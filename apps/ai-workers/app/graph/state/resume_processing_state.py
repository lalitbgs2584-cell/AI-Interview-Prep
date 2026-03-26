from typing import Annotated, List, Dict, Optional, Any
from typing_extensions import TypedDict


# =========================
# Reducer helpers
# =========================

def keep_last(current, new):
    """
    For scalar fields written by multiple parallel branches.
    Always keeps the latest written value — last write wins.
    """
    return new


# =========================
# State
# =========================

class ResumeProcessState(TypedDict):

    # ── Input (set once before graph runs) ──
    s3_file_name: str
    user_id: str
    file_id: str

    # ── Stage 1: Download ──
    pdf_bytes: Optional[bytes]

    # ── Stage 2: Convert ──
    page_images: Optional[List[bytes]]

    # ── Stage 3: OCR ──
    raw_text: Optional[str]

    # ── Stage 4: Clean ──
    cleaned_text: Optional[str]

    # ── Stage 5a: Structured extraction ──
    # Written by structured_node (Branch 1)
    skills: Optional[List[Dict]]
    work_experience: Optional[List[Dict]]
    education: Optional[List[Dict]]
    projects: Optional[List[Dict]]
    strong_domains: Optional[List]
    extracurricular: Optional[List[Dict]]
    key_skills: Optional[List]
    experience_level:  int
    ats_score:  int

    # ── Stage 5b: Chunking + Embedding ──
    # Written by chunk_node and embedding_node (Branch 2)
    text_chunks: Optional[List[str]]
    chunk_embeddings: Optional[List[List[float]]]

    # ── Stage 6: Storage outputs ──
    neo4j_node_id: Optional[str]
    neo4j_node_ids: Optional[Dict]
    qdrant_point_ids: Optional[List[str]]

    # ── Status flags ──
    # These are written by different parallel branches simultaneously.
    # Annotated[..., keep_last] tells LangGraph to accept concurrent writes
    # and resolve them by keeping the latest value instead of raising an error.
    stored_in_neo4j: Annotated[Optional[bool], keep_last]
    stored_in_neon:  Annotated[Optional[bool], keep_last]
    stored_in_qdrant: Annotated[Optional[bool], keep_last]
    stored_in_neon: Annotated[Optional[bool], keep_last]

    # ── Error ──
    # Also Annotated so both branches can write errors without conflict
    error: Annotated[Optional[str], keep_last]