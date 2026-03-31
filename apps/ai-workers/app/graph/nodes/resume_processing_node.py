# =========================
# Imports
# =========================
from typing_extensions import TypedDict
from typing import List, Dict, Optional
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from neo4j import GraphDatabase
from app.core.s3_client import download_resume
from app.system_prompts.structure_node_prompts import structure_node_prompt
from app.system_prompts.ats_score_prompt import ats_score_prompt
from app.core.config import settings
from app.graph.state.resume_processing_state import ResumeProcessState
from app.workers.convert_pdf_to_image_worker import ocr_images_with_openai
import fitz, json, re, uuid
from app.core.redis_client import client

# =========================
# Models & Clients
# =========================
llm = ChatOpenAI(
    model="gpt-4o",
    temperature=0,
    api_key=settings.OPENAI_API_KEY
)

embedder = OpenAIEmbeddings(
    model="text-embedding-3-large",
    api_key=settings.OPENAI_API_KEY
)

qdrant_client = QdrantClient(url=settings.QDRANT_URI)
QDRANT_COLLECTION = "resumes"
EMBEDDING_DIM = 3072

neo4j_driver = GraphDatabase.driver(
    settings.NEO4J_URI,
    auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
)


# =========================
# Helpers
# =========================
def _ensure_qdrant_collection():
    existing = [c.name for c in qdrant_client.get_collections().collections]
    if QDRANT_COLLECTION not in existing:
        qdrant_client.create_collection(
            collection_name=QDRANT_COLLECTION,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE)
        )
        print(f"Created Qdrant collection: {QDRANT_COLLECTION}")


# =========================
# Nodes
#
# ✅ GOLDEN RULE: every node returns ONLY the keys it writes.
#    NEVER do {**state, "key": value}.
#    Spreading **state re-writes every existing key, which causes
#    INVALID_CONCURRENT_GRAPH_UPDATE when parallel branches run simultaneously.
# =========================

def download_node(state: ResumeProcessState):
    """
    Downloads the resume file from S3 using the file name stored in state.
    Returns only 'pdf_bytes' (or 'error' on failure).
    """
    print("Download Node Started")
    try:
        buffer = download_resume(key=state["s3_file_name"])
        return {"pdf_bytes": buffer}
    except Exception as e:
        return {"error": str(e)}


def convert_images_node(state: ResumeProcessState):
    """
    Converts each PDF page to a PNG image using PyMuPDF at 150 DPI.
    Returns only 'page_images' (or 'error' on failure).
    """
    print("Convert Image Node Started")
    try:
        if not state["s3_file_name"].endswith(".pdf"):
            return {}

        images = []
        mat = fitz.Matrix(150/72, 150/72)

        with fitz.open(stream=state["pdf_bytes"], filetype="pdf") as doc:
            for page in doc:
                pix = page.get_pixmap(matrix=mat)
                images.append(pix.tobytes("png"))

        return {"page_images": images}
    except Exception as e:
        return {"error": str(e)}


def ocr_node(state: ResumeProcessState):
    """
    Sends page images to OpenAI vision for OCR text extraction.
    Returns only 'raw_text' (or 'error' on failure).
    """
    print("OCR Node Started")
    try:
        page_images = state.get("page_images", [])
        text = ocr_images_with_openai(page_images)
        print("OCR text preview:", text[:300])
        return {"raw_text": text}
    except Exception as e:
        return {"error": str(e)}


def clean_node(state: ResumeProcessState):
    """
    Strips OCR artifacts (backticks, extra whitespace) from raw_text.
    Returns only 'cleaned_text'.
    """
    print("Clean Node Started")
    raw = state["raw_text"]
    raw = re.sub(r"```", "", raw)
    cleaned = re.sub(r"\s+", " ", raw).strip()
    print("Cleaned preview:", cleaned[:300])
    return {"cleaned_text": cleaned}


def structured_node(state: ResumeProcessState):
    """
    Uses GPT-4o to extract structured fields from cleaned_text.
    Returns only the 7 structured keys (or 'error' on failure).
    """
    print("Structured Node Started")
    try:
        cleaned_text = state.get("cleaned_text", "").strip()

        if not cleaned_text:
            return {"error": "cleaned_text is empty"}

        prompt = structure_node_prompt(cleaned_text)
        response = llm.invoke(prompt)
        raw_content = response.content.strip()
        raw_content = re.sub(r"^```json|^```|```$", "", raw_content, flags=re.MULTILINE).strip()
        data = json.loads(raw_content)

        print("Skills count:", len(data.get("skills", [])))
        print("Projects count:", len(data.get("projects", [])))

        return {
            "skills":           data.get("skills", []),
            "work_experience":  data.get("work_experience", []),
            "education":        data.get("education", []),
            "projects":         data.get("projects", []),
            "extracurricular":  data.get("extracurricular", []),
            "key_skills": data.get("key_skills",[]),
            "strong_domains": data.get("strong_domains",[]),
            "experience_level": data.get("experience_level",0)
        }

    except json.JSONDecodeError as e:
        print("JSON parse error:", str(e))
        return {"error": f"JSON decode failed: {str(e)}"}
    except Exception as e:
        print("Structured node error:", str(e))
        return {"error": str(e)}

def ats_score_checker(state: ResumeProcessState):
    """
    Scores the resume against ATS criteria using cleaned_text and structured data.
    Returns only 'ats_score' (0–100).
    """
    print("ATS Score Node Started")
    try:
        cleaned_text     = state.get("cleaned_text", "").strip()
        skills           = state.get("skills", [])
        work_experience  = state.get("work_experience", [])
        education        = state.get("education", [])
        projects         = state.get("projects", [])
        extracurricular  = state.get("extracurricular", [])
        experience_level = state.get("experience_level", 0)
        key_skills       = state.get("key_skills", [])
        strong_domains   = state.get("strong_domains", [])

        if not cleaned_text:
            return {"error": "cleaned_text is empty — cannot compute ATS score"}

        prompt = ats_score_prompt(
            cleaned_text=cleaned_text,
            skills=skills,
            key_skills=key_skills,
            strong_domains=strong_domains,
            work_experience=work_experience,
            education=education,
            experience_level=experience_level,
            extracurricular=extracurricular,
            projects=projects
            )

        response = llm.invoke(prompt)
        raw_content = response.content.strip()
        raw_content = re.sub(r"^```json|^```|```$", "", raw_content, flags=re.MULTILINE).strip()
        data = json.loads(raw_content)

        total_score = int(data.get("total_score", 0))
        # Clamp to 0–100 as a safety net
        total_score = max(0, min(100, total_score))

        print(f"ATS Score: {total_score}")
        print(f"Dimension breakdown: {json.dumps(data.get('dimension_scores', {}), indent=2)}")
        print(f"Critical gaps: {data.get('critical_gaps', [])}")

        return {"ats_score": total_score}

    except json.JSONDecodeError as e:
        print("ATS JSON parse error:", str(e))
        return {"error": f"ATS score JSON decode failed: {str(e)}"}
    except Exception as e:
        print("ATS node error:", str(e))
        return {"error": str(e)}
    
def chunk_node(state: ResumeProcessState):
    """
    Splits cleaned_text into overlapping chunks using RecursiveCharacterTextSplitter.
    Returns only 'text_chunks'.
    """
    print("Chunk Node Started")
    try:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=100,
            separators=[". ", ", ", " ", ""],
            length_function=len,
        )
        chunks = splitter.split_text(state["cleaned_text"])
        print(f"Split into {len(chunks)} chunks")
        return {"text_chunks": chunks}
    except Exception as e:
        return {"error": str(e)}


def embedding_node(state: ResumeProcessState):
    """
    Generates 3072-dim embeddings for each chunk via text-embedding-3-large.
    Returns only 'chunk_embeddings'.
    """
    print("Embedding Node Started")
    try:
        embeddings = embedder.embed_documents(state["text_chunks"])
        print(f"Generated {len(embeddings)} embeddings, dim={len(embeddings[0])}")
        return {"chunk_embeddings": embeddings}
    except Exception as e:
        return {"error": str(e)}


def store_neo4j_node(state: ResumeProcessState):
    """
    Stores structured resume data as a graph in Neo4j.
    Uses user_id as the central Candidate node — one node per user,
    updated on every re-upload rather than creating duplicates.

    Strategy on re-upload:
      - Candidate node is MERGEd (never duplicated).
      - All child nodes (Education, WorkExperience, Project, Extracurricular)
        are DELETED and recreated so stale data never accumulates.
      - Skills are MERGEd globally (shared across candidates) and
        the relationship is re-MERGEd so no duplicate edges appear.

    Returns only 'neo4j_node_id', 'neo4j_node_ids', 'stored_in_neo4j'.
    """
    print("Store Neo4j Node Started")
    try:
        file_id          = state.get("file_id", str(uuid.uuid4()))
        user_id          = state.get("user_id", "unknown")
        experience_level = state.get("experience_level", 0)
        ats_score        = state.get("ats_score", 0)
        key_skills       = state.get("key_skills", [])
        strong_domains   = state.get("strong_domains", [])

        node_ids = {
            "candidate":      None,
            "skills":         [],
            "education":      [],
            "work_experience": [],
            "projects":       [],
            "extracurricular": [],
        }

        with neo4j_driver.session() as session:

            # ── 1. Candidate node (MERGE — one per user) ──────────────────
            result = session.run(
                """
                MERGE (c:Candidate {user_id: $user_id})
                SET c.file_id          = $file_id,
                    c.s3_file_name     = $s3_file_name,
                    c.experience_level = $experience_level,
                    c.ats_score        = $ats_score,
                    c.key_skills       = $key_skills,
                    c.strong_domains   = $strong_domains,
                    c.updated_at       = timestamp()
                RETURN elementId(c) AS node_id
                """,
                user_id=user_id,
                file_id=file_id,
                s3_file_name=state.get("s3_file_name", ""),
                experience_level=experience_level,
                ats_score=ats_score,
                key_skills=key_skills,
                strong_domains=strong_domains,
            )
            node_ids["candidate"] = result.single()["node_id"]

            # ── 2. Purge stale child nodes before recreating ──────────────
            # Skills are global nodes (not owned by one candidate), so we
            # only detach the relationships — never delete the Skill nodes.
            session.run(
                """
                MATCH (c:Candidate {user_id: $user_id})
                OPTIONAL MATCH (c)-[:HAS_EDUCATION]->(e:Education)
                OPTIONAL MATCH (c)-[:HAS_EXPERIENCE]->(w:WorkExperience)
                OPTIONAL MATCH (c)-[:HAS_PROJECT]->(p:Project)
                OPTIONAL MATCH (c)-[:HAS_EXTRACURRICULAR]->(x:Extracurricular)
                DETACH DELETE e, w, p, x
                """,
                user_id=user_id,
            )

            # Detach old skill relationships (keep the shared Skill nodes)
            session.run(
                """
                MATCH (c:Candidate {user_id: $user_id})-[r:HAS_SKILL]->()
                DELETE r
                """,
                user_id=user_id,
            )

            # ── 3. Skills (MERGE globally, MERGE relationship) ────────────
            for skill in state.get("skills", []):
                result = session.run(
                    """
                    MATCH (c:Candidate {user_id: $user_id})
                    MERGE (s:Skill {name: $name, category: $category})
                    MERGE (c)-[:HAS_SKILL]->(s)
                    RETURN elementId(s) AS node_id
                    """,
                    user_id=user_id,
                    name=skill.get("name", ""),
                    category=skill.get("category", ""),
                )
                row = result.single()
                if row:
                    node_ids["skills"].append(row["node_id"])

            # ── 4. Education ──────────────────────────────────────────────
            for edu in state.get("education", []):
                result = session.run(
                    """
                    MATCH (c:Candidate {user_id: $user_id})
                    CREATE (e:Education {
                        institution: $institution,
                        degree:      $degree,
                        duration:    $duration,
                        grade:       $grade
                    })
                    CREATE (c)-[:HAS_EDUCATION]->(e)
                    RETURN elementId(e) AS node_id
                    """,
                    user_id=user_id,
                    institution=edu.get("institution", ""),
                    degree=edu.get("degree", ""),
                    duration=edu.get("duration", ""),
                    grade=edu.get("grade", ""),
                )
                row = result.single()
                if row:
                    node_ids["education"].append(row["node_id"])

            # ── 5. Work Experience ────────────────────────────────────────
            for exp in state.get("work_experience", []):
                result = session.run(
                    """
                    MATCH (c:Candidate {user_id: $user_id})
                    CREATE (w:WorkExperience {
                        company:     $company,
                        role:        $role,
                        duration:    $duration,
                        description: $description
                    })
                    CREATE (c)-[:HAS_EXPERIENCE]->(w)
                    RETURN elementId(w) AS node_id
                    """,
                    user_id=user_id,
                    company=exp.get("company", ""),
                    role=exp.get("role", ""),
                    duration=exp.get("duration", ""),
                    description=exp.get("description", ""),
                )
                row = result.single()
                if row:
                    node_ids["work_experience"].append(row["node_id"])

            # ── 6. Projects ───────────────────────────────────────────────
            for proj in state.get("projects", []):
                result = session.run(
                    """
                    MATCH (c:Candidate {user_id: $user_id})
                    CREATE (p:Project {
                        title:       $title,
                        tech_stack:  $tech_stack,
                        description: $description
                    })
                    CREATE (c)-[:HAS_PROJECT]->(p)
                    RETURN elementId(p) AS node_id
                    """,
                    user_id=user_id,
                    title=proj.get("title", ""),
                    tech_stack=proj.get("tech_stack", []),
                    description=proj.get("description", ""),
                )
                row = result.single()
                if row:
                    node_ids["projects"].append(row["node_id"])

            # ── 7. Extracurricular ────────────────────────────────────────
            for extra in state.get("extracurricular", []):
                result = session.run(
                    """
                    MATCH (c:Candidate {user_id: $user_id})
                    CREATE (x:Extracurricular {
                        title:        $title,
                        organization: $organization,
                        duration:     $duration,
                        description:  $description
                    })
                    CREATE (c)-[:HAS_EXTRACURRICULAR]->(x)
                    RETURN elementId(x) AS node_id
                    """,
                    user_id=user_id,
                    title=extra.get("title", ""),
                    organization=extra.get("organization", ""),
                    duration=extra.get("duration", ""),
                    description=extra.get("description", ""),
                )
                row = result.single()
                if row:
                    node_ids["extracurricular"].append(row["node_id"])

        print(f"Neo4j: Candidate node ID  : {node_ids['candidate']}")
        print(f"Neo4j: Skills stored      : {len(node_ids['skills'])}")
        print(f"Neo4j: Education stored   : {len(node_ids['education'])}")
        print(f"Neo4j: Experience stored  : {len(node_ids['work_experience'])}")
        print(f"Neo4j: Projects stored    : {len(node_ids['projects'])}")
        print(f"Neo4j: Extra stored       : {len(node_ids['extracurricular'])}")

        return {
            "neo4j_node_id":   node_ids["candidate"],
            "neo4j_node_ids":  node_ids,
            "stored_in_neo4j": True,
        }

    except Exception as e:
        print("Neo4j node error:", str(e))
        return {"error": str(e)}

def store_qdrant_node(state: ResumeProcessState):
    """
    Upserts text chunks + embeddings into Qdrant with cross-reference metadata.
    Returns only 'qdrant_point_ids', 'stored_in_qdrant'.
    """
    print("Store Qdrant Node Started")
    try:
        _ensure_qdrant_collection()

        chunks        = state["text_chunks"]
        embeddings    = state["chunk_embeddings"]
        file_id       = state.get("file_id", str(uuid.uuid4()))
        user_id       = state.get("user_id", "unknown")
        neo4j_node_id = state.get("neo4j_node_id", None)
        print(f"The length of chunks and embeddings are:",len(chunks),len(embeddings))
        if len(chunks) != len(embeddings):
            return {"error": f"Chunk/embedding mismatch: {len(chunks)} vs {len(embeddings)}"}

        point_ids = []
        points    = []

        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point_id = str(uuid.uuid4())
            point_ids.append(point_id)
            points.append(
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "text":                 chunk,
                        "chunk_index":          i,
                        "total_chunks":         len(chunks),
                        "file_id":              file_id,
                        "user_id":              user_id,
                        "s3_file_name":         state.get("s3_file_name", ""),
                        "neo4j_resume_node_id": neo4j_node_id,
                    }
                )
            )

        qdrant_client.upsert(collection_name=QDRANT_COLLECTION, points=points)
        print(f"Qdrant: stored {len(points)} points")

        return {
            "qdrant_point_ids": point_ids,
            "stored_in_qdrant": True,
        }

    except Exception as e:
        print("Qdrant node error:", str(e))
        return {"error": str(e)}

def merge_node(state: ResumeProcessState) -> ResumeProcessState:
    return state 

def store_neon_node(state: ResumeProcessState):
    print("Storing in neon node started.")
    payload = {
        "user_id":          state.get("user_id"),
        "file_id":          state.get("file_id"),
        "s3_file_name":     state.get("s3_file_name"),
        "neo4j_node_id":    state.get("neo4j_node_id"),
        "qdrant_point_ids": state.get("qdrant_point_ids"),
        "stored_in_neo4j":  state.get("stored_in_neo4j"),
        "stored_in_qdrant": state.get("stored_in_qdrant"),
        "skills":           state.get("skills"),
        "work_experience":  state.get("work_experience"),
        "education":        state.get("education"),
        "projects":         state.get("projects"),
        "extracurricular":  state.get("extracurricular"),
        "key_skills":       state.get("key_skills"),
        "strong_domains":   state.get("strong_domains"),
        "experience_level": state.get("experience_level"),
        "ats_score":        state.get("ats_score"),
        "error":            state.get("error"),
    }

    message = {
        "event_type": "neon.store",
        "payload":    payload,
    }

    try:
        client.publish("resume:processed", json.dumps(message))
        print(f"Published neon.store event for user_id={payload['user_id']}, file_id={payload['file_id']}")
        return {"stored_in_neon": True}
    except Exception as e:
        print("store_neon_node publish error:", str(e))
        return {"error": str(e)}