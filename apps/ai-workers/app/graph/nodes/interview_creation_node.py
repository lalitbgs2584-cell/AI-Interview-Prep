import json
import time
import re
from typing import List
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from qdrant_client import QdrantClient
from neo4j import GraphDatabase
from qdrant_client.http import models

from app.core.redis_client import client
from app.core.config import settings
from app.graph.state.interview_creation_state import InterviewState
from app.core.mem0 import memory_client


# -----------------------------
# Clients
# -----------------------------

qdrant = QdrantClient(url=settings.QDRANT_URI)

neo4j_driver = GraphDatabase.driver(
    settings.NEO4J_URI,
    auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
)

llm = ChatOpenAI(model="gpt-4.1", temperature=0.7, api_key=settings.OPENAI_API_KEY)
llm_eval = ChatOpenAI(model="gpt-4.1", temperature=0.2, api_key=settings.OPENAI_API_KEY)

embeddings = OpenAIEmbeddings(model="text-embedding-3-small", api_key=settings.OPENAI_API_KEY)

QDRANT_COLLECTION = "resumes"

# Default max questions for simple sessions — custom sessions override this
DEFAULT_MAX_QUESTIONS = 10


# -----------------------------
# Utilities
# -----------------------------

def publish_event(channel: str, payload: dict):
    client.publish(channel, json.dumps(payload))


def safe_json_parse(text: str) -> dict:
    cleaned = re.sub(r"```(?:json)?", "", text).replace("```", "").strip()
    return json.loads(cleaned)


def get_candidate_name(resume_chunks: List[str]) -> str:
    if not resume_chunks:
        return "the candidate"
    first_chunk = resume_chunks[0][:300]
    lines = [l.strip() for l in first_chunk.splitlines() if l.strip()]
    return lines[0] if lines else "the candidate"


# -----------------------------
# Description parsing helpers
# -----------------------------
# Custom sessions pack structured config into state.description using a known
# JSON prefix block so load_context can extract it without extra state fields.
#
# Format written by the frontend:
#   __CUSTOM_CONFIG__{"max_questions":8,"difficulty_override":"hard","topics":["Redis","Kafka"]}__END_CONFIG__
#   Focus topics: Redis, Kafka.
#   Candidate notes: ...
#   Job Description: ...

_CUSTOM_CONFIG_RE = re.compile(
    r"__CUSTOM_CONFIG__(\{.*?\})__END_CONFIG__",
    re.DOTALL,
)


def parse_custom_config(description: str) -> dict:
    """
    Extract the embedded JSON config block from description.
    Returns {} if this is a simple session (no config block).
    """
    if not description:
        return {}
    match = _CUSTOM_CONFIG_RE.search(description)
    if not match:
        return {}
    try:
        return json.loads(match.group(1))
    except Exception:
        return {}


def strip_custom_config(description: str) -> str:
    """Remove the config block, returning only the human-readable portion."""
    if not description:
        return ""
    return _CUSTOM_CONFIG_RE.sub("", description).strip()


# -----------------------------
# DIFFICULTY CONFIG
# -----------------------------

# Default progression for simple sessions (index → difficulty label)
DEFAULT_DIFFICULTY_MAP = {
    0: "intro",
    1: "easy",
    2: "easy",
    3: "easy",
    4: "medium",
    5: "medium",
    6: "medium",
    7: "medium",
    8: "hard",
    9: "hard",
}

# Difficulty progressions for custom sessions keyed on override value.
# We still always start with an "intro" at index 0 regardless of chosen difficulty.
CUSTOM_DIFFICULTY_MAPS = {
    "easy": {
        0: "intro",
        1: "easy", 2: "easy", 3: "easy", 4: "easy",
        5: "easy", 6: "easy", 7: "easy", 8: "easy",
        9: "easy", 10: "easy", 11: "easy", 12: "easy",
        13: "easy", 14: "easy",
    },
    "medium": {
        0: "intro",
        1: "easy",  2: "easy",
        3: "medium", 4: "medium", 5: "medium", 6: "medium",
        7: "medium", 8: "medium", 9: "medium", 10: "medium",
        11: "medium", 12: "medium", 13: "medium", 14: "medium",
    },
    "hard": {
        0: "intro",
        1: "easy",  2: "medium",
        3: "hard",  4: "hard",  5: "hard",  6: "hard",
        7: "hard",  8: "hard",  9: "hard",  10: "hard",
        11: "hard", 12: "hard", 13: "hard", 14: "hard",
    },
}

DIFFICULTY_INSTRUCTIONS = {
    "intro": (
        "This is the OPENING question of the interview. "
        "Ask the candidate to briefly introduce themselves — their background, current role, "
        "and what brings them to this opportunity. Keep it warm, welcoming, and conversational. "
        "Do NOT ask anything technical yet."
    ),
    "easy": (
        "Ask a straightforward question about one of the candidate's listed skills or past experience. "
        "It should be something any competent candidate in this role could answer confidently."
    ),
    "medium": (
        "Ask a question that requires the candidate to demonstrate deeper knowledge or problem-solving. "
        "Reference a specific skill, project, or scenario relevant to their background."
    ),
    "hard": (
        "Ask a challenging, nuanced question — system design, architecture trade-offs, "
        "advanced concepts, or a scenario that requires strong expertise. "
        "Push the candidate to think critically."
    ),
}


def resolve_difficulty(index: int, description: str) -> str:
    """
    Determine difficulty label for a given question index.
    - Custom sessions: use the difficulty_override from the packed config block.
    - Simple sessions: use the default progression map.
    Falls back gracefully if index is out of range.
    """
    config = parse_custom_config(description or "")
    override = config.get("difficulty_override", "")

    if override in CUSTOM_DIFFICULTY_MAPS:
        dmap = CUSTOM_DIFFICULTY_MAPS[override]
    else:
        dmap = DEFAULT_DIFFICULTY_MAP

    return dmap.get(index, "hard")


def resolve_max_questions(description: str) -> int:
    """Return max_questions from custom config, or the default."""
    config = parse_custom_config(description or "")
    raw = config.get("max_questions")
    if raw is not None:
        try:
            return max(3, min(15, int(raw)))
        except (TypeError, ValueError):
            pass
    return DEFAULT_MAX_QUESTIONS


# ─────────────────────────────────────────────
# NODE 1: LOAD CONTEXT
# ─────────────────────────────────────────────

def load_context(state: InterviewState) -> dict:
    print("[load_context] started")
    user_id = state.get("user_id")
    role = state.get("role") or "Software Engineer"
    description = state.get("description") or ""

    # Detect session type for logging
    custom_config = parse_custom_config(description)
    is_custom = bool(custom_config)
    print(f"[load_context] session_type={'custom' if is_custom else 'simple'}, config={custom_config}")

    # Qdrant resume chunks
    try:
        results, _ = qdrant.scroll(
            collection_name=QDRANT_COLLECTION,
            scroll_filter=models.Filter(
                must=[models.FieldCondition(key="user_id", match=models.MatchValue(value=user_id))]
            ),
            limit=10,
            with_payload=True,
        )
        resume_chunks = [r.payload.get("text", "") for r in results if r.payload]
    except Exception as e:
        print(f"[load_context] Qdrant error: {e}")
        resume_chunks = []

    # Neo4j skills
    try:
        with neo4j_driver.session(database="neo4j") as session:
            result = session.run(
                "MATCH (u:Candidate {user_id: $user_id})-[:HAS_SKILL]->(s:Skill) RETURN s.name AS skill",
                user_id=user_id,
            )
            graph_skills = [str(r["skill"]) for r in result if r["skill"] is not None]
    except Exception as e:
        print(f"[load_context] Neo4j error: {e}")
        graph_skills = []

    # Mem0 memories — use role or topics from custom config as search query
    mem_query = role
    if custom_config.get("topics"):
        topics_str = ", ".join(custom_config["topics"][:3])
        mem_query = f"{role} {topics_str}"

    try:
        raw = memory_client.search(query=mem_query, user_id=user_id, limit=10)
        if isinstance(raw, dict):
            memories = raw.get("results", [])
        elif isinstance(raw, list):
            memories = raw
        else:
            memories = []
    except Exception as e:
        print(f"[load_context] Mem0 error: {e}")
        memories = []

    candidate_name = get_candidate_name(resume_chunks)

    print(
        f"[load_context] Skills: {len(graph_skills)}, Chunks: {len(resume_chunks)}, "
        f"Memories: {len(memories)}, MaxQ: {resolve_max_questions(description)}"
    )

    return {
        "resume_context": resume_chunks,
        "skills": graph_skills,
        "memories": memories,
        "candidate_name": candidate_name,
        "current_index": 0,
        "question_history": [],
        "start_time": int(time.time()),
    }


# ─────────────────────────────────────────────
# NODE 2: GENERATE QUESTION
# ─────────────────────────────────────────────

def generate_question(state: InterviewState) -> dict:
    print("[generate_question] started")

    index = state.get("current_index", 0)
    role = state.get("role") or "Software Engineer"
    interview_type = state.get("interview_type", "technical")
    candidate_name = state.get("candidate_name") or "the candidate"
    question_history = state.get("question_history") or []
    description = state.get("description") or ""

    skills = [str(s) for s in (state.get("skills") or []) if s is not None]
    resume_chunks = [str(c) for c in (state.get("resume_context") or []) if c is not None]
    raw_memories = [m for m in (state.get("memories") or []) if m is not None]

    # ── Parse custom config ───────────────────────────────────────────────────
    custom_config = parse_custom_config(description)
    is_custom = bool(custom_config)
    clean_description = strip_custom_config(description)  # human-readable portion only

    # Topics from custom session (already embedded in clean_description too,
    # but extracting them lets us build a more targeted constraint block)
    custom_topics: List[str] = custom_config.get("topics", [])

    print(
        f"[generate_question] index={index}, skills={len(skills)}, "
        f"chunks={len(resume_chunks)}, is_custom={is_custom}, topics={custom_topics}"
    )

    # ── Difficulty resolution ─────────────────────────────────────────────────
    difficulty = resolve_difficulty(index, description)
    difficulty_instruction = DIFFICULTY_INSTRUCTIONS[difficulty]

    # ── Previous Q&A summary ──────────────────────────────────────────────────
    prev_qa_summary = ""
    if question_history:
        lines = []
        for entry in question_history[-3:]:
            lines.append(f"Q: {entry.get('question', '')}")
            lines.append(f"A: {entry.get('answer', '(no answer yet)')}")
        prev_qa_summary = "\n".join(lines)

    resume_text = "\n\n".join(resume_chunks[:4])

    memories_serializable = []
    for m in raw_memories[:5]:
        if isinstance(m, dict):
            memories_serializable.append(m.get("memory", str(m)))
        else:
            memories_serializable.append(str(m))
    memories_text = json.dumps(memories_serializable, indent=2)

    # ── Build topic constraint block (custom sessions only) ───────────────────
    topic_constraint = ""
    if is_custom and custom_topics:
        topic_constraint = (
            f"\nFOCUS TOPICS (prioritise these): {', '.join(custom_topics)}.\n"
            "Your question MUST relate to one of these topics unless this is the intro question.\n"
        )

    # ── Build JD / notes block from clean description ─────────────────────────
    extra_context_block = ""
    if clean_description:
        extra_context_block = f"\nAdditional context for this session:\n\"\"\"\n{clean_description[:1500]}\n\"\"\"\n"

    # ── Assemble system prompt ────────────────────────────────────────────────
    max_questions = resolve_max_questions(description)

    system_prompt = f"""You are an expert {interview_type} interviewer hiring for a {role} position.

Candidate name: {candidate_name}
Skills on file: {", ".join(skills[:8]) if skills else "Not specified"}

Resume excerpt:
\"\"\"
{resume_text[:2000]}
\"\"\"

Past interview memories (if any):
{memories_text[:800]}
{extra_context_block}{topic_constraint}
Previous questions asked (avoid repeating topics):
{prev_qa_summary or "None yet."}

---
CURRENT TASK — Question #{index + 1} of {max_questions} | Difficulty: {difficulty.upper()}

{difficulty_instruction}

STRICT RULES:
- Output ONE question only. No preamble, no explanation, no numbering.
- Do not say "Sure" or "Here is your question" — just the question itself.
- The question must be specific and relevant to this candidate's actual background.
- Never repeat a topic already covered above.
"""

    try:
        response = llm.invoke([HumanMessage(content=system_prompt)])
        question = response.content.strip()
    except Exception as e:
        print(f"[generate_question] LLM error: {e}")
        if difficulty == "intro":
            question = (
                f"Hi {candidate_name}! Could you start by telling me a bit about yourself "
                f"and what draws you to this {role} role?"
            )
        elif is_custom and custom_topics:
            question = (
                f"Can you walk me through a challenging problem you solved involving "
                f"{custom_topics[0]} and how you approached it?"
            )
        else:
            fallback_skill = skills[0] if skills else "your core skills"
            question = (
                f"Can you walk me through a challenging project involving "
                f"{fallback_skill} and how you handled it?"
            )

    entry = {
        "question": question,
        "answer": "",
        "index": index,
        "difficulty": difficulty,
        "timestamp": int(time.time()),
    }

    print(f"[generate_question] Q#{index + 1} ({difficulty}): {question[:120]}...")

    return {
        "current_question": question,
        "question_history": [*question_history, entry],
        "current_index": index + 1,
        "difficulty": difficulty,
        "followup": False,
        "followup_question": "",
    }


# ─────────────────────────────────────────────
# NODE 3: PUBLISH QUESTION
# ─────────────────────────────────────────────

def publish_question(state: InterviewState) -> dict:
    print("[publish_question] started")
    interview_id = state.get("interview_id")
    index = state.get("current_index", 1) - 1
    difficulty = state.get("difficulty", "intro")

    is_followup = state.get("followup", False)
    followup_question = state.get("followup_question", "")
    question = followup_question if is_followup and followup_question else state.get("current_question", "")

    print(f"[publish_question] is_followup={is_followup}, question={question[:80]}...")

    publish_event(
        f"interview:{interview_id}:events",
        {
            "type": "question",
            "index": index,
            "difficulty": difficulty,
            "question": question,
            "is_followup": is_followup,
            "time": int(time.time() * 1000),
        },
    )
    return {}


# ─────────────────────────────────────────────
# NODE 4: WAIT FOR ANSWER
# ─────────────────────────────────────────────

def wait_for_answer(state: InterviewState) -> dict:
    print("[wait_for_answer] started")
    interview_id = state.get("interview_id")
    answer_key = f"interview:{interview_id}:latest_answer"
    ready_channel = f"interview:{interview_id}:answer_ready"

    timeout = 240  # 4 minutes max — reasonable for a long answer

    sub = client.pubsub()
    sub.subscribe(ready_channel)

    start = time.time()
    answer = None

    try:
        for message in sub.listen():
            if time.time() - start > timeout:
                break
            if message["type"] != "message":
                continue

            raw = client.get(answer_key)
            if raw:
                client.delete(answer_key)
                answer = raw.decode("utf-8") if isinstance(raw, bytes) else raw
                if answer == "__END__":
                    return {"user_answer": "", "timeout": True}
                return {"user_answer": answer, "timeout": False}
    finally:
        sub.unsubscribe(ready_channel)
        sub.close()

    print("[wait_for_answer] Timed out")
    return {"user_answer": "", "timeout": True}


# ─────────────────────────────────────────────
# NODE 5: EVALUATE ANSWER
# ─────────────────────────────────────────────

def evaluate_answer(state: InterviewState) -> dict:
    print("[evaluate_answer] started")
    question = state.get("current_question", "")
    answer = state.get("user_answer", "")
    role = state.get("role") or "Software Engineer"
    difficulty = state.get("difficulty", "medium")
    skills = [str(s) for s in (state.get("skills") or []) if s is not None]
    timed_out = state.get("timeout", False)

    if timed_out or not answer.strip():
        return {
            "score": 0,
            "confidence": 0.0,
            "feedback": "No answer was provided within the time limit.",
            "followup": False,
            "followup_question": "",
        }

    prompt = f"""You are evaluating a candidate for a {role} position.

Question (Difficulty: {difficulty.upper()}):
{question}

Candidate's Answer:
{answer}

Candidate's Known Skills: {", ".join(skills[:6]) if skills else "Not specified"}

Evaluate and return ONLY valid JSON:
{{
  "score": <integer 0-10>,
  "confidence": <float 0.0-1.0>,
  "feedback": "<constructive 1-2 sentence feedback>",
  "followup": <true if a follow-up would add value, otherwise false>,
  "followup_question": "<short follow-up question, or empty string if followup is false>"
}}

Scoring guide:
- 0-2: Off-topic or blank
- 3-4: Vague, minimal understanding
- 5-6: Adequate, covers basics
- 7-8: Strong, well-structured
- 9-10: Exceptional, demonstrates mastery

Return only the JSON. No markdown, no explanation.
"""

    try:
        result = llm_eval.invoke([HumanMessage(content=prompt)]).content
        parsed = safe_json_parse(result)
        parsed["score"] = max(0, min(10, int(parsed.get("score", 5))))
        parsed["confidence"] = max(0.0, min(1.0, float(parsed.get("confidence", 0.5))))
        parsed.setdefault("followup", False)
        parsed.setdefault("followup_question", "")
        parsed.setdefault("feedback", "")
    except Exception as e:
        print(f"[evaluate_answer] Parse error: {e}")
        parsed = {
            "score": 5,
            "confidence": 0.5,
            "feedback": "Could not evaluate this answer automatically.",
            "followup": False,
            "followup_question": "",
        }

    print(f"[evaluate_answer] Score: {parsed['score']}/10 | Followup: {parsed['followup']}")
    return parsed


# ─────────────────────────────────────────────
# NODE 6: STORE STEP
# ─────────────────────────────────────────────

def store_step(state: InterviewState) -> dict:
    print("[store_step] started")
    interview_id = state.get("interview_id")
    question_history = state.get("question_history", [])
    current_index = state.get("current_index", 1)
    history_index = current_index - 1

    entry = {
        "index": history_index,
        "question": state.get("current_question", ""),
        "answer": state.get("user_answer", ""),
        "score": state.get("score", 0),
        "confidence": state.get("confidence", 0.0),
        "feedback": state.get("feedback", ""),
        "difficulty": state.get("difficulty", "unknown"),
        "followup": state.get("followup", False),
        "followup_question": state.get("followup_question", ""),
        "timestamp": int(time.time()),
    }

    client.rpush(f"interview:{interview_id}:history", json.dumps(entry))

    updated_history = list(question_history)
    if updated_history and updated_history[-1].get("index") == history_index:
        updated_history[-1]["answer"] = entry["answer"]
        updated_history[-1]["score"] = entry["score"]

    print(f"[store_step] Stored step #{history_index} | current_index stays at {current_index}")

    return {
        "question_history": updated_history,
        "followup": False,
        "followup_question": "",
        "current_index": current_index,
    }


# ─────────────────────────────────────────────
# NODE 7: CHECK CONTINUE
# ─────────────────────────────────────────────

def check_continue(state: InterviewState) -> dict:
    current_index = state.get("current_index", 0)
    timed_out = state.get("timeout", False)
    description = state.get("description") or ""

    # Respect custom session's max_questions, fall back to default
    max_questions = resolve_max_questions(description)

    print(f"[check_continue] current_index={current_index}, max_questions={max_questions}, timeout={timed_out}")

    if current_index >= max_questions or timed_out:
        print("[check_continue] → finalizing")
        return {"interview_complete": True}

    print(f"[check_continue] → continuing, next question will be #{current_index + 1}")
    return {"interview_complete": False}


# ─────────────────────────────────────────────
# NODE 8: FINALIZE
# ─────────────────────────────────────────────

def finalize(state: InterviewState) -> dict:
    print("[finalize] started")
    interview_id = state.get("interview_id")
    user_id      = state.get("user_id")
    role         = state.get("role") or "Software Engineer"
    interview_type = state.get("interview_type", "technical")
    candidate_name = state.get("candidate_name", "the candidate")
    start_time   = state.get("start_time", int(time.time()))
    description  = state.get("description") or ""
    duration_seconds = int(time.time()) - start_time

    # Pull custom config for summary enrichment
    custom_config = parse_custom_config(description)
    custom_topics: List[str] = custom_config.get("topics", [])
    difficulty_override: str = custom_config.get("difficulty_override", "")

    raw_history = client.lrange(f"interview:{interview_id}:history", 0, -1)
    history = [json.loads(h) for h in raw_history]

    # ── per-question timeline data (score 0-100) ──────────
    question_scores = [
        {
            "index":      h.get("index", i),
            "score":      round(h.get("score", 0) * 10),
            "difficulty": h.get("difficulty", "unknown"),
            "question":   h.get("question", ""),
            "feedback":   h.get("feedback", ""),
            "timestamp":  h.get("timestamp", 0),
        }
        for i, h in enumerate(history)
    ]

    if not history:
        summary_payload = {
            "role":             role,
            "interview_type":   interview_type,
            "candidate_name":   candidate_name,
            "date_iso":         time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "duration_seconds": duration_seconds,
            "overall_score":    0,
            "recommendation":   "Insufficient data",
            "summary":          "No questions were answered.",
            "strengths":        [],
            "weaknesses":       [],
            "tips":             [],
            "skill_scores":     {},
            "question_scores":  [],
        }
    else:
        raw_scores = [h.get("score", 0) for h in history]
        avg_score_10 = round(sum(raw_scores) / len(raw_scores), 1) if raw_scores else 0
        avg_score_100 = round(avg_score_10 * 10)

        # Build extra context lines for the LLM summary prompt
        extra_context_lines = ""
        if custom_topics:
            extra_context_lines += f"\nFocus topics tested: {', '.join(custom_topics)}."
        if difficulty_override:
            extra_context_lines += f"\nSession difficulty setting: {difficulty_override}."

        clean_description = strip_custom_config(description)
        if clean_description:
            extra_context_lines += f"\nSession context: {clean_description[:400]}"

        prompt = f"""You are summarizing a completed {interview_type} interview for role: {role}.
Candidate: {candidate_name}
{extra_context_lines}

Interview Q&A history (scores are 0-10):
{json.dumps(history, indent=2)[:4000]}

Average score: {avg_score_10}/10

Return ONLY valid JSON with this EXACT structure (no extra keys, no markdown):
{{
  "summary": "<2-3 sentence narrative of overall performance>",
  "recommendation": "<Hire | Strong Hire | No Hire | Needs More Evaluation>",
  "strengths": [
    "<specific strength observed, 1 sentence>",
    "<specific strength observed, 1 sentence>",
    "<specific strength observed, 1 sentence>"
  ],
  "weaknesses": [
    "<specific area to improve, 1 sentence>",
    "<specific area to improve, 1 sentence>"
  ],
  "tips": [
    "<actionable tip to improve, 1-2 sentences>",
    "<actionable tip to improve, 1-2 sentences>"
  ],
  "skill_scores": {{
    "Communication": <integer 0-100>,
    "Technical Depth": <integer 0-100>,
    "Problem Solving": <integer 0-100>,
    "Clarity": <integer 0-100>,
    "Domain Knowledge": <integer 0-100>,
    "Confidence": <integer 0-100>
  }}
}}

Base every score on actual answers in the history. Be specific and honest.
Return only the JSON object.
"""

        try:
            result = llm_eval.invoke([HumanMessage(content=prompt)]).content
            parsed = safe_json_parse(result)

            raw_skill_scores = parsed.get("skill_scores", {})
            skill_scores = {
                k: max(0, min(100, int(v)))
                for k, v in raw_skill_scores.items()
            }

            summary_payload = {
                "role":             role,
                "interview_type":   interview_type,
                "candidate_name":   candidate_name,
                "date_iso":         time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "duration_seconds": duration_seconds,
                "overall_score":    max(0, min(100, round(float(parsed.get("overall_score", avg_score_100)))
                                        if "overall_score" in parsed else avg_score_100)),
                "recommendation":   parsed.get("recommendation", "Needs More Evaluation"),
                "summary":          parsed.get("summary", ""),
                "strengths":        parsed.get("strengths", []),
                "weaknesses":       parsed.get("weaknesses", []),
                "tips":             parsed.get("tips", []),
                "skill_scores":     skill_scores,
                "question_scores":  question_scores,
            }

            if skill_scores and summary_payload["overall_score"] == 0:
                summary_payload["overall_score"] = round(
                    sum(skill_scores.values()) / len(skill_scores)
                )

        except Exception as e:
            print(f"[finalize] Parse error: {e}")
            summary_payload = {
                "role":             role,
                "interview_type":   interview_type,
                "candidate_name":   candidate_name,
                "date_iso":         time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "duration_seconds": duration_seconds,
                "overall_score":    avg_score_100,
                "recommendation":   "Needs More Evaluation",
                "summary":          f"Interview completed with an average score of {avg_score_10}/10.",
                "strengths":        [],
                "weaknesses":       [],
                "tips":             [],
                "skill_scores":     {},
                "question_scores":  question_scores,
            }

    # Persist to Redis — Next.js API reads from here
    client.set(
        f"interview:{interview_id}:summary",
        json.dumps(summary_payload),
        ex=60 * 60 * 24 * 7,
    )

    # Publish completion event to frontend
    publish_event(
        f"interview:{interview_id}:events",
        {"type": "interview_complete", "summary": summary_payload},
    )

    # Store memory for future interviews
    try:
        memory_text = (
            f"Interview for {role}: {summary_payload['summary']} "
            f"Strengths: {', '.join(summary_payload.get('strengths', []))}. "
            f"Areas to improve: {', '.join(summary_payload.get('weaknesses', []))}. "
            f"Score: {summary_payload['overall_score']}/100."
        )
        memory_client.add(memory_text, user_id=user_id)
    except Exception as e:
        print(f"[finalize] Mem0 store error: {e}")

    print(f"[finalize] Done. Score: {summary_payload.get('overall_score')}/100")
    return {"summary": summary_payload}