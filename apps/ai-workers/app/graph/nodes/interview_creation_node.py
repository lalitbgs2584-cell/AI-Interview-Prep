"""
Interview Engine — Production-Grade Redesign
=============================================
Key changes vs original:

NODE 2  generate_question   — returns {question, expected_answer} JSON in ONE LLM call.
                              expected_answer carries: key_concepts, reasoning_steps,
                              ideal_structure, common_mistakes.
                              Prompt now enforces evidence anchoring + competency metadata
                              (target_competency, difficulty_rationale, anti_repetition_key).

NODE 5  evaluate_answer     — COMPARATIVE evaluation: user_answer vs expected_answer.
                              Returns full dimensional breakdown + missing concepts.
                              Prompt now requires why_score_not_higher + transcript
                              evidence_snippets for anchored scoring rationale.
                              Difficulty-aware scoring caps applied DETERMINISTICALLY
                              after LLM output (not left to LLM discretion).

NODE 6  store_step          — persists FULL structured entry incl. expected_answer,
                              dimensions, missing_concepts, strengths, weaknesses,
                              verdict.  NO more score+feedback-only storage.

NODE 8  finalize            — HYBRID:
                                Step 1 (deterministic) — compute weighted score,
                                  aggregate gaps, rank strengths/weaknesses, detect
                                  repeated patterns.
                                Step 2 (LLM) — narrate computed facts into readable
                                  summary.  LLM cannot invent data it wasn't given.
                              Narration now returns split summaries:
                              content_quality, delivery_quality, interview_integrity.

PATCH TRACKING:
- PATCH 1: InterviewState TypedDict — 3 new integrity fields
- PATCH 2: load_context() — initialize new fields
- PATCH 3: handle_interruption_event() — NEW socket handler
- PATCH 4: handle_end_event() — NEW socket handler
- PATCH 5: finalize() — read integrity fields from Redis
- PATCH 6: narration_prompt — include end_reason + interruptions in facts
- PATCH 7: _compute_deterministic_summary() — interruption penalty
- PATCH 8: Call site — pass interruption_count to helper
- PATCH 9: Mem0 memory text — include end_reason + interruption note
"""

import json
import time
import re
from collections import Counter
from typing import List, Dict, Any, Tuple

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from qdrant_client import QdrantClient
from neo4j import GraphDatabase
from qdrant_client.http import models

from app.core.redis_client import client
from app.core.config import settings
from app.graph.state.interview_creation_state import InterviewState
from app.core.mem0 import memory_client
from app.graph.answer_analytics import (
    compute_answer_analytics,
    aggregate_interview_analytics,
)


# ─────────────────────────────────────────────
# CLIENTS
# ─────────────────────────────────────────────

qdrant = QdrantClient(url=settings.QDRANT_URI)

neo4j_driver = GraphDatabase.driver(
    settings.NEO4J_URI,
    auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
)

# Creative temperature for question generation
llm = ChatOpenAI(model="gpt-4.1", temperature=0.7, api_key=settings.OPENAI_API_KEY)

# Low temperature for deterministic evaluation — consistency is paramount
llm_eval = ChatOpenAI(model="gpt-4.1", temperature=0.1, api_key=settings.OPENAI_API_KEY)

# Near-zero temperature for final summary narration (facts only, no invention)
llm_summary = ChatOpenAI(
    model="gpt-4.1", temperature=0.2, api_key=settings.OPENAI_API_KEY
)

embeddings = OpenAIEmbeddings(
    model="text-embedding-3-small", api_key=settings.OPENAI_API_KEY
)

QDRANT_COLLECTION = "resumes"
DEFAULT_MAX_QUESTIONS = 10
HUMAN_INTERVIEW_TYPES = {"behavioral", "hr"}


# ─────────────────────────────────────────────
# UTILITIES
# ─────────────────────────────────────────────


def publish_event(channel: str, payload: dict) -> None:
    client.publish(channel, json.dumps(payload))


def safe_json_parse(text: str) -> dict:
    """
    Robust JSON extraction — tries three strategies before raising.
    1. Strip markdown fences then parse.
    2. Extract first {...} block via regex.
    3. Raise so the caller can fall back gracefully.
    """
    # Strategy 1: strip fences
    cleaned = re.sub(r"```(?:json)?", "", text).replace("```", "").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Strategy 2: extract first balanced JSON object
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON from LLM output: {text[:200]}")


def get_candidate_name(resume_chunks: List[str]) -> str:
    if not resume_chunks:
        return "the candidate"
    first_chunk = resume_chunks[0][:300]
    lines = [l.strip() for l in first_chunk.splitlines() if l.strip()]
    return lines[0] if lines else "the candidate"


def is_human_round(interview_type: str) -> bool:
    return (interview_type or "").strip().lower() in HUMAN_INTERVIEW_TYPES


def parse_answer_payload(raw_answer: str) -> Tuple[str, Dict[str, Any]]:
    """
    Backward-compatible parsing for candidate answer payloads.
    Legacy payload: plain string answer.
    New payload: JSON object {"text": "...", "analytics": {...}}.
    """
    if not raw_answer:
        return "", {}
    if raw_answer == "__END__":
        return "__END__", {}

    try:
        maybe_json = json.loads(raw_answer)
    except Exception:
        return raw_answer, {}

    if isinstance(maybe_json, dict):
        text = str(maybe_json.get("text", "")).strip()
        analytics = maybe_json.get("analytics", {})
        if not text and isinstance(maybe_json.get("answer"), str):
            text = maybe_json.get("answer", "").strip()
        return text, analytics if isinstance(analytics, dict) else {}

    return raw_answer, {}


def _is_terminated(state: InterviewState) -> bool:
    return bool(state.get("timeout", False))


# ─────────────────────────────────────────────
# DESCRIPTION / CONFIG PARSING
# ─────────────────────────────────────────────

_CUSTOM_CONFIG_RE = re.compile(
    r"__CUSTOM_CONFIG__(\{.*?\})__END_CONFIG__",
    re.DOTALL,
)


def parse_custom_config(description: str) -> dict:
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
    if not description:
        return ""
    return _CUSTOM_CONFIG_RE.sub("", description).strip()


# ─────────────────────────────────────────────
# DIFFICULTY CONFIG
# ─────────────────────────────────────────────

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

CUSTOM_DIFFICULTY_MAPS = {
    "easy": {i: ("intro" if i == 0 else "easy") for i in range(15)},
    "medium": {0: "intro", 1: "easy", 2: "easy", **{i: "medium" for i in range(3, 15)}},
    "hard": {0: "intro", 1: "easy", 2: "medium", **{i: "hard" for i in range(3, 15)}},
}

# Difficulty weights for score aggregation (harder questions count more)
DIFFICULTY_WEIGHTS = {"intro": 0.3, "easy": 1.0, "medium": 1.5, "hard": 2.0}

# Post-LLM scoring caps applied DETERMINISTICALLY based on missing concepts
# If the candidate missed any key concept the score cannot exceed these ceilings.
MISSING_CONCEPT_CAPS = {"intro": 10, "easy": 4, "medium": 6, "hard": 7}

# Absolute max scores per difficulty (a perfect answer on an easy question
# cannot score the same as a perfect answer on a hard one)
DIFFICULTY_MAX_SCORES = {"intro": 10, "easy": 8, "medium": 9, "hard": 10}


def resolve_difficulty(index: int, description: str) -> str:
    config = parse_custom_config(description or "")
    override = config.get("difficulty_override", "")
    dmap = CUSTOM_DIFFICULTY_MAPS.get(override, DEFAULT_DIFFICULTY_MAP)
    return dmap.get(index, "hard")


def resolve_max_questions(description: str) -> int:
    config = parse_custom_config(description or "")
    raw = config.get("max_questions")
    if raw is not None:
        try:
            return max(3, min(15, int(raw)))
        except (TypeError, ValueError):
            pass
    return DEFAULT_MAX_QUESTIONS


def apply_difficulty_scoring_cap(
    raw_score: int,
    missing_concepts: List[str],
    difficulty: str,
) -> int:
    """
    Deterministic post-processing cap.
    Ensures LLM cannot inflate scores when key concepts are absent.
    """
    # Cap by absolute difficulty ceiling
    score = min(raw_score, DIFFICULTY_MAX_SCORES.get(difficulty, 10))

    # Further cap if fundamentals are missing
    if missing_concepts:
        score = min(score, MISSING_CONCEPT_CAPS.get(difficulty, 6))

    return max(0, score)


# ─────────────────────────────────────────────
# DIFFICULTY INSTRUCTIONS (question generation)
# ─────────────────────────────────────────────

DIFFICULTY_INSTRUCTIONS_TECHNICAL = {
    "intro": (
        "Opening question only. Ask the candidate to briefly introduce themselves — "
        "background, current role, and what brings them here. Warm and conversational. "
        "No technical content."
    ),
    "easy": (
        "Ask a direct factual question about one skill or concept from the candidate's "
        "profile that any competent engineer at this level should answer confidently "
        "without hesitation."
    ),
    "medium": (
        "Ask a question requiring genuine problem-solving or architectural reasoning. "
        "Reference a specific technology, project, or trade-off relevant to their background."
    ),
    "hard": (
        "Ask a challenging, nuanced question — system design, deep architecture trade-offs, "
        "advanced algorithms, or a scenario requiring expert-level reasoning. "
        "No softballing."
    ),
}

DIFFICULTY_INSTRUCTIONS_BEHAVIORAL = {
    "intro": (
        "Opening question only. Ask the candidate to walk through their background and "
        "what excites them about this opportunity. Conversational. No STAR required yet."
    ),
    "easy": (
        "Ask a straightforward behavioral question with STAR structure expected. "
        "Focus on collaboration, communication, or feedback reception. "
        "ZERO technical content whatsoever."
    ),
    "medium": (
        "Ask a behavioral question probing leadership, conflict resolution, or high-stakes "
        "decisions. Expect full STAR with measurable outcomes. ZERO technical content."
    ),
    "hard": (
        "Ask a challenging behavioral question about ambiguity, influence without authority, "
        "organizational failure, or driving change. Full STAR + strong self-awareness expected. "
        "ZERO technical content."
    ),
}


def get_difficulty_instruction(difficulty: str, interview_type: str) -> str:
    if is_human_round(interview_type):
        return DIFFICULTY_INSTRUCTIONS_BEHAVIORAL.get(
            difficulty, DIFFICULTY_INSTRUCTIONS_BEHAVIORAL["medium"]
        )
    return DIFFICULTY_INSTRUCTIONS_TECHNICAL.get(
        difficulty, DIFFICULTY_INSTRUCTIONS_TECHNICAL["medium"]
    )


# ─────────────────────────────────────────────
# PSYCHOLOGICAL AWARENESS LAYER
# (kept for live UX — does NOT affect scoring)
# ─────────────────────────────────────────────

_UNCERTAINTY_RE = re.compile(
    r"\b("
    r"i (don'?t|do not) know|not sure|no idea|idk|pass|skip|"
    r"i'?m? (confused|lost|blank|stuck|unsure|not confident)|"
    r"can(not|'t) (recall|remember|think of)|"
    r"never (heard|used|seen) (of )?it|"
    r"i (forgot|have no clue|have no idea)|"
    r"i('m| am) not (familiar|aware)"
    r")\b",
    re.IGNORECASE,
)
_SHORT_ANSWER_WORDS = 8
_PIVOT_THRESHOLD = 3

BEHAVIORAL_FALLBACKS = {
    "intro": "Could you start by walking me through your background and what excites you about this opportunity?",
    "easy": "Tell me about a time you had to collaborate closely with a teammate who had a very different working style. How did you handle it?",
    "medium": "Describe a situation where you had to manage a conflict within your team. What steps did you take and what was the outcome?",
    "hard": "Tell me about a time you had to drive an important initiative without having direct authority. How did you build alignment and what was the result?",
}


def _is_uncertain(answer: str) -> bool:
    if not answer or not answer.strip():
        return True
    if _UNCERTAINTY_RE.search(answer):
        return True
    if len(answer.split()) < _SHORT_ANSWER_WORDS:
        return True
    return False


def _build_supportive_response(
    last_question: str,
    last_answer: str,
    consecutive_struggles: int,
    difficulty: str,
    interview_type: str,
    candidate_name: str,
) -> str:
    """
    Live interview support — separate from scoring.
    This helps the candidate think; it does NOT inflate their score.
    """
    human_round = is_human_round(interview_type)
    is_pivot = consecutive_struggles >= _PIVOT_THRESHOLD

    scaffold_hint = (
        "Ask them to recall any situation — even a small or informal one — "
        "that relates to the theme of the original question."
        if human_round
        else "Break the question into a simpler sub-concept, or invite them to reason "
        "through a general approach even without the exact answer."
    )

    pivot_note = (
        (
            "\nThis is their 3rd consecutive struggle. "
            "Acknowledge the difficulty, say you'll move on — do NOT ask another question yet."
        )
        if is_pivot
        else ""
    )

    no_tech_note = "\nABSOLUTE RULE: Zero technical content." if human_round else ""

    prompt = (
        f"You are an interviewer. The candidate just struggled with:\n"
        f'"{last_question}"\n\n'
        f'Their response: "{last_answer}"\n\n'
        f"Struggle #{consecutive_struggles}.{pivot_note}{no_tech_note}\n\n"
        "Generate a SHORT response (under 4 sentences) that:\n"
        "1. Acknowledges their difficulty without being condescending.\n"
        "2. Reduces pressure.\n"
        f"3. {'Move on — do NOT ask another question.' if is_pivot else scaffold_hint}\n\n"
        "Output ONLY what the interviewer says. No labels."
    )

    try:
        return llm.invoke([HumanMessage(content=prompt)]).content.strip()
    except Exception as e:
        print(f"[_build_supportive_response] LLM error: {e}")
        if is_pivot:
            return (
                f"That's a tough area — completely fine. "
                "Let's shift gears and move on to something else."
            )
        return (
            "Take your time — even a rough first thought is useful. "
            "What comes to mind first when you approach this?"
        )


# ─────────────────────────────────────────────
# GAP ANALYSIS ENGINE
# ─────────────────────────────────────────────


def compute_gap_analysis(history: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Deterministic gap analysis from stored interview history.
    Returns:
        repeated_gaps   — concepts missed in 2+ questions (systemic weakness)
        all_gaps        — every unique missing concept
        gap_frequency   — concept → count
        weak_dimensions — average dimension score < 5 across all questions
    """
    all_missing: List[str] = []
    all_incorrect: List[str] = []
    dimension_totals: Dict[str, List[int]] = {}

    for h in history:
        all_missing.extend(h.get("missing_concepts", []))
        all_incorrect.extend(h.get("incorrect_points", []))

        dims = h.get("dimensions", {})
        for dim, val in dims.items():
            dimension_totals.setdefault(dim, []).append(int(val))

    gap_frequency = dict(Counter(all_missing))
    repeated_gaps = sorted(
        [c for c, freq in gap_frequency.items() if freq >= 2],
        key=lambda c: -gap_frequency[c],
    )

    incorrect_frequency = dict(Counter(all_incorrect))

    # Dimensions where average < 5 — systemic weakness
    weak_dimensions = []
    dim_averages: Dict[str, float] = {}
    for dim, scores in dimension_totals.items():
        avg = round(sum(scores) / len(scores), 1)
        dim_averages[dim] = avg
        if avg < 5.0:
            weak_dimensions.append(dim)

    return {
        "repeated_gaps": repeated_gaps,
        "all_gaps": list(gap_frequency.keys()),
        "gap_frequency": gap_frequency,
        "weak_dimensions": weak_dimensions,
        "dimension_averages": dim_averages,
        "incorrect_points": list(incorrect_frequency.keys()),
    }


# ─────────────────────────────────────────────
# SOCKET HANDLERS (PATCHES 3 & 4)
# ─────────────────────────────────────────────


def handle_interruption_event(interview_id: str, count: int, timestamp: int) -> None:
    """
    PATCH 3: Called when the frontend emits 'interview:interruption'.
    Persists the latest interruption count to Redis so finalize() can read it.
    Also publishes a proctoring event for real-time monitoring dashboards.
    """
    key = f"interview:{interview_id}:interruptions"
    client.set(key, str(count), ex=60 * 60 * 24)  # 24-hour TTL

    publish_event(
        f"interview:{interview_id}:proctoring",
        {
            "type": "interruption",
            "count": count,
            "timestamp": timestamp,
        },
    )
    print(f"[interruption] interview={interview_id} count={count}")


def handle_end_event(interview_id: str, reason: str, duration_sec: int) -> None:
    """
    PATCH 4: Called when the frontend emits 'interview:end'.
    Sets the persistent end flag (which wait_for_answer already polls)
    and records the reason so finalize() can include it in the report.
    """
    end_key = f"interview:{interview_id}:ended"
    reason_key = f"interview:{interview_id}:end_reason"
    dur_key = f"interview:{interview_id}:duration_sec"

    # This is what wait_for_answer already checks — setting it here is the
    # CORRECT way to break out of the blocking poll loop in NODE 4.
    client.set(end_key, "1", ex=60 * 60 * 24)
    client.set(reason_key, reason, ex=60 * 60 * 24)
    client.set(dur_key, str(duration_sec), ex=60 * 60 * 24)

    print(
        f"[end_event] interview={interview_id} reason={reason} duration={duration_sec}s"
    )


# ─────────────────────────────────────────────
# NODE 1: LOAD CONTEXT
# ─────────────────────────────────────────────


def load_context(state: InterviewState) -> dict:
    """
    NODE 1: Load context for interview.
    PATCH 2: Initialize the three new integrity fields.
    """
    print("[load_context] started")
    user_id = state.get("user_id")
    role = state.get("role") or "Software Engineer"
    description = state.get("description") or ""
    interview_type = state.get("interview_type", "technical")

    custom_config = parse_custom_config(description)
    print(
        f"[load_context] session_type={'custom' if custom_config else 'simple'}, "
        f"interview_type={interview_type}, config={custom_config}"
    )

    # Qdrant — resume chunks
    try:
        results, _ = qdrant.scroll(
            collection_name=QDRANT_COLLECTION,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="user_id", match=models.MatchValue(value=user_id)
                    )
                ]
            ),
            limit=10,
            with_payload=True,
        )
        resume_chunks = [r.payload.get("text", "") for r in results if r.payload]
    except Exception as e:
        print(f"[load_context] Qdrant error: {e}")
        resume_chunks = []

    # Neo4j — skills graph
    graph_skills: List[str] = []
    if not is_human_round(interview_type):
        try:
            with neo4j_driver.session(database="neo4j") as session:
                result = session.run(
                    "MATCH (u:Candidate {user_id: $user_id})-[:HAS_SKILL]->(s:Skill) RETURN s.name AS skill",
                    user_id=user_id,
                )
                graph_skills = [
                    str(r["skill"]) for r in result if r["skill"] is not None
                ]
        except Exception as e:
            print(f"[load_context] Neo4j error: {e}")

    # Mem0 — past interview memories
    mem_query = role
    if custom_config.get("topics"):
        mem_query = f"{role} {', '.join(custom_config['topics'][:3])}"
    try:
        raw = memory_client.search(query=mem_query, user_id=user_id, limit=10)
        memories = (
            raw.get("results", [])
            if isinstance(raw, dict)
            else (raw if isinstance(raw, list) else [])
        )
    except Exception as e:
        print(f"[load_context] Mem0 error: {e}")
        memories = []

    candidate_name = get_candidate_name(resume_chunks)
    print(
        f"[load_context] Skills={len(graph_skills)}, Chunks={len(resume_chunks)}, "
        f"Memories={len(memories)}, MaxQ={resolve_max_questions(description)}"
    )

    return {
        "resume_context": resume_chunks,
        "skills": graph_skills,
        "memories": memories,
        "candidate_name": candidate_name,
        "current_index": 0,
        "question_history": [],
        "target_competency": "",
        "difficulty_rationale": "",
        "anti_repetition_key": "",
        "question_evidence_anchor": "",
        "start_time": int(time.time()),
        "consecutive_struggles": 0,
        "is_support_turn": False,
        "timeout": False,
        "gap_map": {},
        "response_analytics": {},
        "response_analytics_metrics": {},
        "score_pillars": {
            "content_score": 0,
            "delivery_score": 0,
            "confidence_score": 0,
            "communication_flow_score": 0,
        },
        # ── PATCH 2: Initialize new integrity fields ──────────────────────
        "interruption_count": 0,
        "end_reason": "user_ended",
        "session_duration_sec": 0,
    }


# ─────────────────────────────────────────────
# NODE 2: GENERATE QUESTION  (+ expected answer)
# ─────────────────────────────────────────────


def generate_question(state: InterviewState) -> dict:
    """
    NODE 2: Single LLM call returns BOTH the question AND its expected answer.
    The expected answer is stored in state and used later by evaluate_answer
    for comparative evaluation instead of in-isolation scoring.
    """
    print("[generate_question] started")

    index = state.get("current_index", 0)
    role = state.get("role") or "Software Engineer"
    interview_type = state.get("interview_type", "technical")
    candidate_name = state.get("candidate_name") or "the candidate"
    question_history = state.get("question_history") or []
    description = state.get("description") or ""
    last_answer = state.get("user_answer", "")
    consecutive_struggles = state.get("consecutive_struggles", 0)

    skills = [str(s) for s in (state.get("skills") or []) if s is not None]
    resume_chunks = [
        str(c) for c in (state.get("resume_context") or []) if c is not None
    ]
    raw_memories = [m for m in (state.get("memories") or []) if m is not None]

    if _is_terminated(state):
        print("[generate_question] ⛔ Terminated — skipping")
        return {
            "current_question": "",
            "expected_answer": {},
            "target_competency": "",
            "difficulty_rationale": "",
            "anti_repetition_key": "",
            "question_evidence_anchor": "",
            "question_history": question_history,
            "current_index": index,
            "difficulty": state.get("difficulty", "medium"),
            "followup": False,
            "followup_question": "",
            "consecutive_struggles": 0,
            "is_support_turn": False,
            "timeout": True,
        }

    custom_config = parse_custom_config(description)
    clean_description = strip_custom_config(description)
    custom_topics: List[str] = custom_config.get("topics", [])
    human_round = is_human_round(interview_type)

    print(
        f"[generate_question] index={index}, type={interview_type}, "
        f"human_round={human_round}, struggles={consecutive_struggles}"
    )

    # ── PSYCHOLOGICAL CHECK ────────────────────────────────────────────────
    last_question = question_history[-1].get("question", "") if question_history else ""

    if index > 0 and _is_uncertain(last_answer):
        new_struggles = consecutive_struggles + 1
        print(
            f"[generate_question] ⚠️  Uncertainty detected — struggle #{new_struggles}"
        )

        supportive_text = _build_supportive_response(
            last_question=last_question,
            last_answer=last_answer,
            consecutive_struggles=new_struggles,
            difficulty=state.get("difficulty", "medium"),
            interview_type=interview_type,
            candidate_name=candidate_name,
        )
        is_pivot = new_struggles >= _PIVOT_THRESHOLD
        print(
            f"[generate_question] {'Pivoting' if is_pivot else 'Scaffolding'}: {supportive_text[:80]}…"
        )

        return {
            "current_question": supportive_text,
            "expected_answer": {},  # no expected answer for support turns
            "target_competency": "supportive_scaffolding",
            "difficulty_rationale": "Support turn triggered by uncertainty detection.",
            "anti_repetition_key": "support-turn",
            "question_evidence_anchor": "Detected uncertainty in the most recent candidate answer.",
            "question_history": question_history,
            "current_index": index + 1 if is_pivot else index,
            "difficulty": state.get("difficulty", "medium"),
            "followup": True,
            "followup_question": supportive_text,
            "consecutive_struggles": 0 if is_pivot else new_struggles,
            "is_support_turn": True,
            "timeout": False,
        }

    # ── NORMAL QUESTION GENERATION ────────────────────────────────────────
    new_struggles = 0
    difficulty = resolve_difficulty(index, description)
    difficulty_instruction = get_difficulty_instruction(difficulty, interview_type)

    prev_qa_summary = ""
    if question_history:
        lines = []
        for entry in question_history[-3:]:
            lines.append(f"Q: {entry.get('question', '')}")
            lines.append(f"A: {entry.get('answer', '(no answer yet)')}")
        prev_qa_summary = "\n".join(lines)

    resume_text = "\n\n".join(resume_chunks[:4])
    max_questions = resolve_max_questions(description)
    memories_text = json.dumps(
        [
            m.get("memory", str(m)) if isinstance(m, dict) else str(m)
            for m in raw_memories[:5]
        ],
        indent=2,
    )

    topic_constraint = ""
    if custom_config and custom_topics and not human_round:
        topic_constraint = (
            f"\nFOCUS TOPICS (must use one): {', '.join(custom_topics)}.\n"
        )

    extra_context_block = (
        f'\nSession context:\n"""\n{clean_description[:1500]}\n"""\n'
        if clean_description
        else ""
    )

    # ── Build prompt — returns JSON with question + expected_answer + anchors ─────────
    if human_round:
        system_prompt = f"""You are a strict {interview_type.upper()} interviewer for a {role} position.

Candidate: {candidate_name}
Resume (background only — NO technical questions):
\"\"\"{resume_text[:1500]}\"\"\"

Memories: {memories_text[:400]}
{extra_context_block}
Previous questions (do NOT repeat themes): {prev_qa_summary or "None yet."}

TASK — Question #{index + 1} of {max_questions} | {difficulty.upper()}
{difficulty_instruction}

ABSOLUTE RULES:
1. ZERO technical content — no code, algorithms, systems, APIs, frameworks, databases.
2. Output ONLY valid JSON — no markdown, no commentary, no preamble.
3. The expected_answer must be specific to THIS question, not generic.
4. Evidence anchoring is mandatory: include a quote-like anchor tied to resume/context/memory.

Return ONLY this JSON:
{{
  "question": "<the exact question to ask — one sentence, no numbering>",
  "target_competency": "<single competency this question tests>",
  "difficulty_rationale": "<why this is {difficulty.upper()} for this candidate>",
  "anti_repetition_key": "<short stable key to avoid repeating this theme>",
  "evidence_anchor": "<quote-like snippet from provided context that motivates this question>",
  "expected_answer": {{
    "key_concepts": ["<concept 1>", "<concept 2>", "<concept 3>"],
    "reasoning_steps": ["<STAR step 1>", "<STAR step 2>", "<STAR step 3>", "<STAR step 4>"],
    "ideal_structure": "<what an ideal answer looks like — 1 sentence>",
    "common_mistakes": ["<mistake 1>", "<mistake 2>", "<mistake 3>"]
  }}
}}"""
    else:
        system_prompt = f"""You are a strict {interview_type} interviewer hiring for a {role} position.

Candidate: {candidate_name}
Skills: {", ".join(skills[:8]) if skills else "Not specified"}
Resume:
\"\"\"{resume_text[:2000]}\"\"\"

Memories: {memories_text[:600]}
{extra_context_block}{topic_constraint}
Previous questions (do NOT repeat topics): {prev_qa_summary or "None yet."}

TASK — Question #{index + 1} of {max_questions} | {difficulty.upper()}
{difficulty_instruction}

RULES:
1. Output ONLY valid JSON — no markdown, no commentary, no preamble.
2. The expected_answer must be specific to THIS question.
3. key_concepts must be the EXACT technical concepts a correct answer requires.
4. common_mistakes must name real misconceptions, not generic advice.
5. Evidence anchoring is mandatory: include a quote-like anchor tied to resume/context/memory.

Return ONLY this JSON:
{{
  "question": "<the exact question to ask — one sentence, no numbering>",
  "target_competency": "<single competency this question tests>",
  "difficulty_rationale": "<why this is {difficulty.upper()} for this candidate>",
  "anti_repetition_key": "<short stable key to avoid repeating this theme>",
  "evidence_anchor": "<quote-like snippet from provided context that motivates this question>",
  "expected_answer": {{
    "key_concepts": ["<required concept 1>", "<required concept 2>", "<required concept 3>"],
    "reasoning_steps": ["<step 1>", "<step 2>", "<step 3>"],
    "ideal_structure": "<what a complete, correct answer covers — 1 sentence>",
    "common_mistakes": ["<mistake 1>", "<mistake 2>", "<mistake 3>"]
  }}
}}"""

    question = ""
    expected_answer = {}
    target_competency = ""
    difficulty_rationale = ""
    anti_repetition_key = ""
    question_evidence_anchor = ""

    try:
        response_text = llm.invoke(
            [HumanMessage(content=system_prompt)]
        ).content.strip()
        parsed = safe_json_parse(response_text)
        question = str(parsed.get("question", "")).strip()
        expected_answer = parsed.get("expected_answer", {})
        target_competency = str(parsed.get("target_competency", "")).strip()
        difficulty_rationale = str(parsed.get("difficulty_rationale", "")).strip()
        anti_repetition_key = str(parsed.get("anti_repetition_key", "")).strip()
        question_evidence_anchor = str(parsed.get("evidence_anchor", "")).strip()

        # Behavioral guard — re-generate if technical leakage detected
        if human_round:
            TECH_KEYWORDS = [
                "algorithm",
                "code",
                "implement",
                "function",
                "database",
                "sql",
                "api",
                "rest",
                "graphql",
                "system design",
                "data structure",
                "big o",
                "complexity",
                "framework",
                "runtime",
                "deploy",
                "docker",
                "kubernetes",
                "microservice",
                "async",
                "thread",
                "cache",
                "index",
                "query",
                "schema",
            ]
            if any(kw in question.lower() for kw in TECH_KEYWORDS):
                print(
                    "[generate_question] ⚠️  Technical leakage detected — regenerating"
                )
                retry_prompt = (
                    f"{system_prompt}\n\n"
                    "⚠️  Previous attempt leaked technical content. "
                    "Regenerate a purely behavioral question with ZERO engineering concepts."
                )
                response_text = llm.invoke(
                    [HumanMessage(content=retry_prompt)]
                ).content.strip()
                parsed = safe_json_parse(response_text)
                question = str(parsed.get("question", "")).strip()
                expected_answer = parsed.get("expected_answer", {})
                target_competency = str(parsed.get("target_competency", "")).strip()
                difficulty_rationale = str(parsed.get("difficulty_rationale", "")).strip()
                anti_repetition_key = str(parsed.get("anti_repetition_key", "")).strip()
                question_evidence_anchor = str(parsed.get("evidence_anchor", "")).strip()

    except Exception as e:
        print(f"[generate_question] LLM/parse error: {e}")
        # Deterministic fallback — question only; expected_answer is minimal
        if human_round:
            question = BEHAVIORAL_FALLBACKS.get(
                difficulty, BEHAVIORAL_FALLBACKS["easy"]
            )
        elif difficulty == "intro":
            question = (
                f"Hi {candidate_name}! Could you start by telling me a bit about yourself "
                f"and what draws you to this {role} role?"
            )
        elif custom_topics:
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

        # Minimal expected answer for fallback questions
        expected_answer = {
            "key_concepts": [
                "relevant technical depth",
                "clear problem statement",
                "outcome",
            ],
            "reasoning_steps": [
                "Identify the problem",
                "Describe your approach",
                "Share the outcome",
            ],
            "ideal_structure": "Concise problem-solution-outcome narrative with specifics.",
            "common_mistakes": [
                "Too vague",
                "No outcome mentioned",
                "No personal contribution",
            ],
        }
        target_competency = (
            "behavioral_communication"
            if human_round
            else "technical_problem_solving"
        )
        difficulty_rationale = (
            f"Fallback question chosen for {difficulty.upper()} after LLM parse failure."
        )
        anti_repetition_key = f"fallback-{difficulty}-{index}"
        question_evidence_anchor = (
            custom_topics[0]
            if custom_topics
            else (skills[0] if skills else "candidate profile context")
        )

    if not target_competency:
        target_competency = (
            "behavioral_communication"
            if human_round
            else "technical_problem_solving"
        )
    if not difficulty_rationale:
        difficulty_rationale = (
            f"This question is calibrated for {difficulty.upper()} based on prior turns and profile depth."
        )
    if not anti_repetition_key:
        anti_repetition_key = f"{interview_type.lower()}-{difficulty}-q{index+1}"
    if not question_evidence_anchor:
        question_evidence_anchor = (
            custom_topics[0]
            if custom_topics
            else (skills[0] if skills else "candidate profile context")
        )

    entry = {
        "question": question,
        "expected_answer": expected_answer,
        "target_competency": target_competency,
        "difficulty_rationale": difficulty_rationale,
        "anti_repetition_key": anti_repetition_key,
        "evidence_anchor": question_evidence_anchor,
        "answer": "",
        "index": index,
        "difficulty": difficulty,
        "timestamp": int(time.time()),
    }

    print(f"[generate_question] Q#{index+1} ({difficulty}): {question[:100]}…")

    return {
        "current_question": question,
        "expected_answer": expected_answer,
        "target_competency": target_competency,
        "difficulty_rationale": difficulty_rationale,
        "anti_repetition_key": anti_repetition_key,
        "question_evidence_anchor": question_evidence_anchor,
        "question_history": [*question_history, entry],
        "current_index": index + 1,
        "difficulty": difficulty,
        "followup": False,
        "followup_question": "",
        "consecutive_struggles": new_struggles,
        "is_support_turn": False,
        "timeout": False,
    }


# ─────────────────────────────────────────────
# NODE 3: PUBLISH QUESTION
# ─────────────────────────────────────────────


def publish_question(state: InterviewState) -> dict:
    print("[publish_question] started")

    if _is_terminated(state):
        print("[publish_question] ⛔ Terminated — skipping")
        return {}

    interview_id = state.get("interview_id")
    index = state.get("current_index", 1) - 1
    difficulty = state.get("difficulty", "intro")
    is_followup = state.get("followup", False)
    followup_question = state.get("followup_question", "")
    is_support_turn = state.get("is_support_turn", False)
    question = (
        followup_question
        if is_followup and followup_question
        else state.get("current_question", "")
    )

    publish_event(
        f"interview:{interview_id}:events",
        {
            "type": "question",
            "index": index,
            "difficulty": difficulty,
            "question": question,
            "is_followup": is_followup,
            "is_support_turn": is_support_turn,
            "time": int(time.time() * 1000),
        },
    )
    return {}


# ─────────────────────────────────────────────
# NODE 4: WAIT FOR ANSWER
# ─────────────────────────────────────────────


def wait_for_answer(state: InterviewState) -> dict:
    print("[wait_for_answer] started")

    if _is_terminated(state):
        print("[wait_for_answer] ⛔ Already terminated — returning immediately")
        return {"user_answer": "", "response_analytics": {}, "timeout": True}

    interview_id = state.get("interview_id")
    answer_key = f"interview:{interview_id}:latest_answer"
    end_key = f"interview:{interview_id}:ended"
    ready_channel = f"interview:{interview_id}:answer_ready"
    timeout = 240

    # Check persistent end flag before subscribing (race-condition guard)
    if client.exists(end_key):
        print("[wait_for_answer] ⛔ End flag already set")
        return {"user_answer": "", "response_analytics": {}, "timeout": True}

    # Drain any answer already in the key
    raw = client.get(answer_key)
    if raw:
        client.delete(answer_key)
        answer = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        if answer == "__END__":
            return {"user_answer": "", "response_analytics": {}, "timeout": True}
        answer_text, response_analytics = parse_answer_payload(answer)
        return {
            "user_answer": answer_text,
            "response_analytics": response_analytics,
            "timeout": False,
        }

    sub = client.pubsub()
    sub.subscribe(ready_channel)
    start = time.time()

    try:
        while True:
            if time.time() - start > timeout:
                break
            if client.exists(end_key):
                print("[wait_for_answer] ⛔ End flag detected during poll")
                return {"user_answer": "", "response_analytics": {}, "timeout": True}

            message = sub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message is None:
                continue
            if message["type"] != "message":
                continue

            raw = client.get(answer_key)
            if raw:
                client.delete(answer_key)
                answer = raw.decode("utf-8") if isinstance(raw, bytes) else raw
                if answer == "__END__":
                    return {"user_answer": "", "response_analytics": {}, "timeout": True}
                print(f"[wait_for_answer] Answer received: {answer[:80]}…")
                answer_text, response_analytics = parse_answer_payload(answer)
                return {
                    "user_answer": answer_text,
                    "response_analytics": response_analytics,
                    "timeout": False,
                }
    finally:
        try:
            sub.unsubscribe(ready_channel)
            sub.close()
        except Exception:
            pass

    print("[wait_for_answer] Timed out after 240s")
    return {"user_answer": "", "response_analytics": {}, "timeout": True}


# ─────────────────────────────────────────────
# NODE 5: EVALUATE ANSWER  (comparative, strict)
# ─────────────────────────────────────────────


def evaluate_answer(state: InterviewState) -> dict:
    """
    NODE 5: COMPARATIVE evaluation: user_answer is measured against expected_answer.
    Scoring is strict:
      - No generic praise.
      - Missing concepts are named explicitly.
      - Difficulty-aware caps are applied deterministically AFTER LLM output.
    """
    print("[evaluate_answer] started")

    question = state.get("current_question", "")
    answer = state.get("user_answer", "")
    expected_answer = state.get("expected_answer") or {}
    role = state.get("role") or "Software Engineer"
    difficulty = state.get("difficulty", "medium")
    interview_type = state.get("interview_type", "technical")
    skills = [str(s) for s in (state.get("skills") or []) if s is not None]
    timed_out = state.get("timeout", False)
    is_support_turn = state.get("is_support_turn", False)
    response_analytics = (
        state.get("response_analytics", {})
        if isinstance(state.get("response_analytics", {}), dict)
        else {}
    )

    _empty = {
        "score": 0,
        "confidence": 0.0,
        "dimensions": {},
        "missing_concepts": [],
        "incorrect_points": [],
        "strengths": [],
        "weaknesses": [],
        "verdict": "No answer was provided.",
        "why_score_not_higher": "No answer submitted, so higher score was not possible.",
        "evidence_snippets": [],
        "feedback": "No answer was provided.",
        "followup": False,
        "followup_question": "",
        "response_analytics": response_analytics,
        "response_analytics_metrics": {},
        "score_pillars": {
            "content_score": 0,
            "delivery_score": 0,
            "confidence_score": 0,
            "communication_flow_score": 0,
        },
    }

    if timed_out or not answer.strip():
        return _empty

    # Support turns are live UX responses — never scored
    if is_support_turn:
        print("[evaluate_answer] Skipping — support turn")
        return {
            "score": state.get("score", 0),
            "confidence": state.get("confidence", 0.0),
            "dimensions": state.get("dimensions", {}),
            "missing_concepts": state.get("missing_concepts", []),
            "incorrect_points": state.get("incorrect_points", []),
            "strengths": state.get("strengths", []),
            "weaknesses": state.get("weaknesses", []),
            "verdict": state.get("verdict", ""),
            "why_score_not_higher": state.get("why_score_not_higher", ""),
            "evidence_snippets": state.get("evidence_snippets", []),
            "feedback": state.get("feedback", ""),
            "followup": False,
            "followup_question": "",
            "response_analytics": state.get("response_analytics", {}),
            "response_analytics_metrics": state.get("response_analytics_metrics", {}),
            "score_pillars": state.get("score_pillars", {}),
        }

    human_round = is_human_round(interview_type)

    key_concepts_text = json.dumps(expected_answer.get("key_concepts", []))
    reasoning_steps_text = json.dumps(expected_answer.get("reasoning_steps", []))
    ideal_structure_text = expected_answer.get("ideal_structure", "Not specified")
    common_mistakes_text = json.dumps(expected_answer.get("common_mistakes", []))

    # ── DIFFICULTY SCORING RULES ───────────────────────────────────────────
    difficulty_rules = {
        "intro": (
            "This is an intro/self-introduction question. "
            "Score 8-10 if the candidate gave a reasonable self-introduction. "
            "Score below 6 only if the answer is completely off-topic or blank."
        ),
        "easy": (
            "STRICT — easy questions test fundamentals. "
            "If ANY key concept from the expected answer is absent → score cannot exceed 4. "
            "A complete, correct answer deserves at most 8 (easy questions have a ceiling of 8). "
            "Do not give 9 or 10 for an easy question."
        ),
        "medium": (
            "MODERATE — medium questions require applied knowledge. "
            "If more than half the key concepts are missing → score cannot exceed 6. "
            "Partial credit allowed up to 7 for answers that cover core concepts but lack depth."
        ),
        "hard": (
            "LENIENT ON PARTIAL — hard questions are genuinely difficult. "
            "Award partial credit generously if the candidate demonstrates correct reasoning "
            "even without the complete answer. Full marks (9-10) only for truly complete answers."
        ),
    }.get(difficulty, "")

    if human_round:
        eval_prompt = f"""You are a strict behavioral interview evaluator. 
Role: {role} | Difficulty: {difficulty.upper()}

QUESTION ASKED:
{question}

WHAT A STRONG ANSWER REQUIRES:
- Key concepts: {key_concepts_text}
- Ideal structure: {ideal_structure_text}
- Common mistakes to watch for: {common_mistakes_text}

CANDIDATE'S ACTUAL ANSWER:
{answer}

SCORING RULES:
{difficulty_rules}

General rules:
- Do NOT use generic phrases like "great job", "good attempt", "nice work".
- Name specific things the candidate said (or failed to say).
- Use "you" — never "the candidate".
- missing_concepts must list EXACTLY which key concepts were absent from the answer.
- If the answer is vague and hits no concrete STAR element → score ≤ 4.
- A score of 7+ requires clear Situation, Task, Action, AND Result with measurable impact.
- Evidence anchoring is mandatory: include direct quote-like snippets from the transcript answer.

Dimensions for behavioral evaluation:
- star_structure (0-10): How well the STAR format was followed
- self_awareness (0-10): Reflection on own role, mistakes, growth
- clarity (0-10): How clearly and concisely the story was told
- communication (0-10): Professional tone, structured delivery

Return ONLY valid JSON — no markdown, no extra keys:
{{
  "score": <integer 0-10>,
  "confidence": <float 0.0-1.0 — your confidence this score is accurate>,
  "dimensions": {{
    "star_structure": <0-10>,
    "self_awareness": <0-10>,
    "clarity": <0-10>,
    "communication": <0-10>
  }},
  "missing_concepts": ["<concept absent from the answer>", ...],
  "incorrect_points": ["<anything factually wrong or misleading>", ...],
  "strengths": ["<specific thing done well — under 15 words>", ...],
  "weaknesses": ["<specific gap — name what was missing — under 15 words>", ...],
  "verdict": "<1 sentence brutally honest summary of this answer>",
  "why_score_not_higher": "<1-2 sentences naming exact missing pieces that prevented a higher score>",
  "evidence_snippets": ["<short quote-like snippet from candidate answer>", "<second snippet>", "<third snippet>"],
  "followup": <true if a clarifying question would add meaningful signal>,
  "followup_question": "<specific behavioral follow-up, or empty string>"
}}"""
    else:
        eval_prompt = f"""You are a strict technical interview evaluator (FAANG standard).
Role: {role} | Difficulty: {difficulty.upper()}
Candidate's known skills: {', '.join(skills[:6]) if skills else 'Not specified'}

QUESTION ASKED:
{question}

WHAT A CORRECT ANSWER REQUIRES:
- Key concepts: {key_concepts_text}
- Reasoning steps: {reasoning_steps_text}
- Ideal structure: {ideal_structure_text}
- Common mistakes: {common_mistakes_text}

CANDIDATE'S ACTUAL ANSWER:
{answer}

SCORING RULES:
{difficulty_rules}

General rules:
- Do NOT use generic phrases. Name specific concepts.
- Use "you" — never "the candidate".
- missing_concepts must list exactly which key concepts from the expected answer were absent.
- incorrect_points must name specific factual errors or misconceptions.
- A score of 7+ requires that the majority of key concepts are correctly addressed.
- Do not reward confidence without correctness.
- Evidence anchoring is mandatory: include direct quote-like snippets from the transcript answer.

Dimensions for technical evaluation:
- correctness (0-10): Are the technical facts accurate?
- depth (0-10): Does the answer go beyond surface-level?
- clarity (0-10): Is the explanation clear and well-structured?
- communication (0-10): Is it professional and articulate?

Return ONLY valid JSON — no markdown, no extra keys:
{{
  "score": <integer 0-10>,
  "confidence": <float 0.0-1.0>,
  "dimensions": {{
    "correctness": <0-10>,
    "depth": <0-10>,
    "clarity": <0-10>,
    "communication": <0-10>
  }},
  "missing_concepts": ["<key concept absent>", ...],
  "incorrect_points": ["<specific error or misconception>", ...],
  "strengths": ["<specific correct thing — under 15 words>", ...],
  "weaknesses": ["<specific gap or error — name the concept — under 15 words>", ...],
  "verdict": "<1 sentence brutally honest summary>",
  "why_score_not_higher": "<1-2 sentences naming exact missing pieces that prevented a higher score>",
  "evidence_snippets": ["<short quote-like snippet from candidate answer>", "<second snippet>", "<third snippet>"],
  "followup": <true if a probing technical follow-up would add signal>,
  "followup_question": "<specific follow-up, or empty string>"
}}"""

    try:
        result_text = llm_eval.invoke([HumanMessage(content=eval_prompt)]).content
        parsed = safe_json_parse(result_text)

        # ── DETERMINISTIC POST-PROCESSING ─────────────────────────────────
        raw_score = max(0, min(10, int(parsed.get("score", 0))))
        missing_concepts = [str(c) for c in parsed.get("missing_concepts", []) if c]

        # Apply difficulty-aware cap — LLM cannot override this
        final_score = apply_difficulty_scoring_cap(
            raw_score, missing_concepts, difficulty
        )

        confidence = max(0.0, min(1.0, float(parsed.get("confidence", 0.5))))

        # Ensure dimensions are integers 0-10
        raw_dims = parsed.get("dimensions", {})
        dimensions = {
            k: max(0, min(10, int(v)))
            for k, v in raw_dims.items()
            if isinstance(v, (int, float))
        }

        verdict = str(parsed.get("verdict", "")).strip()
        why_score_not_higher = str(parsed.get("why_score_not_higher", "")).strip()
        raw_evidence = parsed.get("evidence_snippets", [])
        evidence_snippets = (
            [str(s).strip() for s in raw_evidence if str(s).strip()]
            if isinstance(raw_evidence, list)
            else []
        )[:3]
        analytics_bundle = compute_answer_analytics(
            answer_text=answer,
            response_analytics=response_analytics,
            dimensions=dimensions,
            base_score=final_score,
            missing_concepts=missing_concepts,
            interview_type=interview_type,
        )

        result = {
            "score": final_score,
            "confidence": confidence,
            "dimensions": dimensions,
            "missing_concepts": missing_concepts,
            "incorrect_points": [
                str(p) for p in parsed.get("incorrect_points", []) if p
            ],
            "strengths": [str(s) for s in parsed.get("strengths", []) if s],
            "weaknesses": [str(w) for w in parsed.get("weaknesses", []) if w],
            "verdict": verdict,
            "why_score_not_higher": (
                why_score_not_higher
                or "Key expected concepts were missing or insufficiently supported."
            ),
            "evidence_snippets": evidence_snippets,
            "feedback": verdict,  # backward-compat alias
            "followup": bool(parsed.get("followup", False)),
            "followup_question": str(parsed.get("followup_question", "")),
            "response_analytics": response_analytics,
            "response_analytics_metrics": analytics_bundle.get("metrics", {}),
            "score_pillars": analytics_bundle.get("score_pillars", {}),
        }

    except Exception as e:
        print(f"[evaluate_answer] Parse error: {e}")
        result = {
            "score": 0,
            "confidence": 0.0,
            "dimensions": {},
            "missing_concepts": [],
            "incorrect_points": [],
            "strengths": [],
            "weaknesses": ["Evaluation failed — answer could not be processed."],
            "verdict": "Evaluation error.",
            "why_score_not_higher": "Evaluation failed, so higher score could not be justified.",
            "evidence_snippets": [],
            "feedback": "Evaluation error.",
            "followup": False,
            "followup_question": "",
            "response_analytics": response_analytics,
            "response_analytics_metrics": {},
            "score_pillars": {
                "content_score": 0,
                "delivery_score": 0,
                "confidence_score": 0,
                "communication_flow_score": 0,
            },
        }

    print(
        f"[evaluate_answer] Score: {result['score']}/10 | "
        f"Missing: {result['missing_concepts'][:3]} | "
        f"Followup: {result['followup']}"
    )
    return result


# ─────────────────────────────────────────────
# NODE 6: STORE STEP  (full structured data)
# ─────────────────────────────────────────────


def store_step(state: InterviewState) -> dict:
    """
    NODE 6: Stores the FULL structured interview step — not just score + feedback.
    Includes expected_answer, dimensional breakdown, and comparative analysis.
    """
    print("[store_step] started")

    interview_id = state.get("interview_id")
    question_history = state.get("question_history", [])
    current_index = state.get("current_index", 1)
    is_support_turn = state.get("is_support_turn", False)

    if is_support_turn:
        print("[store_step] Skipping — support turn")
        return {
            "question_history": question_history,
            "followup": False,
            "followup_question": "",
            "current_index": current_index,
            "is_support_turn": False,
        }

    if _is_terminated(state):
        print("[store_step] ⛔ Terminated — skipping")
        return {
            "question_history": question_history,
            "followup": False,
            "followup_question": "",
            "current_index": current_index,
            "is_support_turn": False,
            "timeout": True,
        }

    history_index = current_index - 1

    # Full structured entry — every field the evaluation produced
    entry = {
        "index": history_index,
        "question": state.get("current_question", ""),
        "expected_answer": state.get("expected_answer", {}),
        "target_competency": state.get("target_competency", ""),
        "difficulty_rationale": state.get("difficulty_rationale", ""),
        "anti_repetition_key": state.get("anti_repetition_key", ""),
        "evidence_anchor": state.get("question_evidence_anchor", ""),
        "user_answer": state.get("user_answer", ""),
        "score": state.get("score", 0),
        "confidence": state.get("confidence", 0.0),
        "dimensions": state.get("dimensions", {}),
        "missing_concepts": state.get("missing_concepts", []),
        "incorrect_points": state.get("incorrect_points", []),
        "strengths": state.get("strengths", []),
        "weaknesses": state.get("weaknesses", []),
        "verdict": state.get("verdict", ""),
        "why_score_not_higher": state.get("why_score_not_higher", ""),
        "evidence_snippets": state.get("evidence_snippets", []),
        "response_analytics": state.get("response_analytics", {}),
        "response_analytics_metrics": state.get("response_analytics_metrics", {}),
        "score_pillars": state.get("score_pillars", {}),
        "difficulty": state.get("difficulty", "unknown"),
        "followup": state.get("followup", False),
        "followup_question": state.get("followup_question", ""),
        "timestamp": int(time.time()),
    }

    client.rpush(f"interview:{interview_id}:history", json.dumps(entry))

    # Update in-memory history for finalize
    updated_history = list(question_history)
    if updated_history and updated_history[-1].get("index") == history_index:
        updated_history[-1].update(
            {
                "answer": entry["user_answer"],
                "score": entry["score"],
                "dimensions": entry["dimensions"],
                "missing_concepts": entry["missing_concepts"],
                "strengths": entry["strengths"],
                "weaknesses": entry["weaknesses"],
                "verdict": entry["verdict"],
                "why_score_not_higher": entry["why_score_not_higher"],
                "evidence_snippets": entry["evidence_snippets"],
                "response_analytics_metrics": entry["response_analytics_metrics"],
                "score_pillars": entry["score_pillars"],
            }
        )

    print(
        f"[store_step] Stored step #{history_index} | "
        f"score={entry['score']} | missing={entry['missing_concepts'][:2]}"
    )

    return {
        "question_history": updated_history,
        "followup": False,
        "followup_question": "",
        "current_index": current_index,
        "is_support_turn": False,
    }


# ─────────────────────────────────────────────
# NODE 7: CHECK CONTINUE
# ─────────────────────────────────────────────


def check_continue(state: InterviewState) -> dict:
    print("[check_continue] started")

    current_index = state.get("current_index", 0)
    description = state.get("description") or ""
    max_questions = resolve_max_questions(description)
    is_support_turn = state.get("is_support_turn", False)
    timed_out = bool(state.get("timeout"))

    print(
        f"[check_continue] index={current_index}, max={max_questions}, "
        f"timeout={timed_out}, support_turn={is_support_turn}"
    )

    if timed_out:
        return {"interview_complete": True, "timeout": True}

    if is_support_turn:
        return {"interview_complete": False, "timeout": False}

    if current_index >= max_questions:
        print("[check_continue] → max questions reached, finalizing")
        return {"interview_complete": True, "timeout": False}

    print(f"[check_continue] → continuing, next Q#{current_index + 1}")
    return {"interview_complete": False, "timeout": False}


# ─────────────────────────────────────────────
# NODE 8: FINALIZE  (deterministic step 1 + LLM step 2)
# ─────────────────────────────────────────────

SKILL_SCORE_DIMENSIONS = {
    "behavioral": [
        "Communication",
        "Self-Awareness",
        "Leadership",
        "Conflict Resolution",
        "Adaptability",
        "Teamwork",
    ],
    "hr": [
        "Communication",
        "Professionalism",
        "Culture Fit",
        "Motivation",
        "Self-Awareness",
        "Negotiation Readiness",
    ],
    "default": [
        "Communication",
        "Technical Depth",
        "Problem Solving",
        "Clarity",
        "Domain Knowledge",
        "Confidence",
    ],
}


def get_skill_dimensions(interview_type: str) -> List[str]:
    key = (interview_type or "").strip().lower()
    return SKILL_SCORE_DIMENSIONS.get(key, SKILL_SCORE_DIMENSIONS["default"])


def _compute_deterministic_summary(
    history: List[Dict[str, Any]],
    interview_type: str,
    interruption_count: int = 0,
) -> Dict[str, Any]:
    """
    PATCH 7 & 8: STEP 1 — pure deterministic computation.
    No LLM involved. Returns a structured facts dict that the LLM
    in step 2 will narrate (but cannot contradict or invent).

    Now includes interruption penalty calculation.
    """
    if not history:
        return {}

    # ── Score aggregation ──────────────────────────────────────────────────
    raw_scores = [float(h.get("score", 0)) for h in history]
    plain_avg = round(sum(raw_scores) / len(raw_scores), 2) if raw_scores else 0.0

    # Difficulty-weighted average
    weighted_sum = sum(
        float(h.get("score", 0))
        * DIFFICULTY_WEIGHTS.get(h.get("difficulty", "medium"), 1.0)
        for h in history
    )
    total_weight = sum(
        DIFFICULTY_WEIGHTS.get(h.get("difficulty", "medium"), 1.0) for h in history
    )
    weighted_avg = (
        round(weighted_sum / total_weight, 2) if total_weight > 0 else plain_avg
    )

    # ── PATCH 7: Interruption penalty ──────────────────────────────────────
    FREE_INTERRUPTIONS = 1  # first one is forgiven
    PENALTY_PER_EXTRA = 0.1  # 0.1 off the 0-10 weighted avg per excess interruption
    MAX_PENALTY = 1.0  # never deduct more than 1 full point (10 on 100-pt scale)

    excess = max(0, interruption_count - FREE_INTERRUPTIONS)
    int_penalty = min(MAX_PENALTY, excess * PENALTY_PER_EXTRA)
    weighted_avg = round(max(0.0, weighted_avg - int_penalty), 2)
    overall_100 = round(weighted_avg * 10)

    # ── Recommendation (hard rule — no LLM) ───────────────────────────────
    if weighted_avg >= 8.0:
        recommendation = "Strong Hire"
    elif weighted_avg >= 6.5:
        recommendation = "Hire"
    elif weighted_avg >= 5.0:
        recommendation = "Needs More Evaluation"
    else:
        recommendation = "No Hire"

    # ── Aggregated strengths / weaknesses ─────────────────────────────────
    all_strengths: List[str] = []
    all_weaknesses: List[str] = []

    for h in history:
        all_strengths.extend(h.get("strengths", []))
        all_weaknesses.extend(h.get("weaknesses", []))

    strength_counts = Counter(all_strengths)
    weakness_counts = Counter(all_weaknesses)
    top_strengths = [s for s, _ in strength_counts.most_common(5)]
    top_weaknesses = [w for w, _ in weakness_counts.most_common(5)]

    # ── Gap analysis ───────────────────────────────────────────────────────
    gap_data = compute_gap_analysis(history)

    # ── Dimension averages ─────────────────────────────────────────────────
    dimension_totals: Dict[str, List[float]] = {}
    for h in history:
        for dim, val in (h.get("dimensions") or {}).items():
            dimension_totals.setdefault(dim, []).append(float(val))

    dim_averages = {
        dim: round(sum(vals) / len(vals), 1) for dim, vals in dimension_totals.items()
    }

    # ── Per-question score summary ─────────────────────────────────────────
    question_scores = [
        {
            "index": h.get("index", i),
            "score": round(float(h.get("score", 0)) * 10),  # 0–100
            "difficulty": h.get("difficulty", "unknown"),
            "question": h.get("question", ""),
            "target_competency": h.get("target_competency", ""),
            "difficulty_rationale": h.get("difficulty_rationale", ""),
            "anti_repetition_key": h.get("anti_repetition_key", ""),
            "evidence_anchor": h.get("evidence_anchor", ""),
            "verdict": h.get("verdict", ""),
            "why_score_not_higher": h.get("why_score_not_higher", ""),
            "evidence_snippets": h.get("evidence_snippets", []),
            "response_analytics_metrics": h.get("response_analytics_metrics", {}),
            "score_pillars": h.get("score_pillars", {}),
            "missing_concepts": h.get("missing_concepts", []),
            "strengths": h.get("strengths", []),
            "weaknesses": h.get("weaknesses", []),
            "timestamp": h.get("timestamp", 0),
        }
        for i, h in enumerate(history)
    ]

    # ── Skill dimension scores (deterministic from dim_averages) ───────────
    skill_dimensions = get_skill_dimensions(interview_type)
    # Map LLM dimension keys → display skill names (best-effort)
    dim_key_map = {
        # technical
        "correctness": "Technical Depth",
        "depth": "Technical Depth",
        "clarity": "Clarity",
        "communication": "Communication",
        # behavioral
        "star_structure": "Communication",
        "self_awareness": "Self-Awareness",
    }
    skill_scores: Dict[str, int] = {}
    for dim_key, avg in dim_averages.items():
        display_name = dim_key_map.get(dim_key)
        if display_name and display_name in skill_dimensions:
            skill_scores[display_name] = round(avg * 10)

    # Fill any remaining skill dimensions with overall_100 as baseline
    for dim in skill_dimensions:
        if dim not in skill_scores:
            skill_scores[dim] = overall_100

    interview_analytics = aggregate_interview_analytics(
        history=history,
        interruption_count=interruption_count,
    )

    return {
        "plain_avg": plain_avg,
        "weighted_avg": weighted_avg,
        "overall_100": overall_100,
        "recommendation": recommendation,
        "top_strengths": top_strengths,
        "top_weaknesses": top_weaknesses,
        "repeated_gaps": gap_data["repeated_gaps"],
        "all_gaps": gap_data["all_gaps"],
        "gap_frequency": gap_data["gap_frequency"],
        "weak_dimensions": gap_data["weak_dimensions"],
        "dim_averages": dim_averages,
        "skill_scores": skill_scores,
        "question_scores": question_scores,
        "interview_analytics": interview_analytics,
    }


def finalize(state: InterviewState) -> dict:
    """
    NODE 8: PATCH 5 — Read integrity fields from Redis.
    PATCH 6 — Include them in narration_prompt.
    PATCH 8 — Pass interruption_count to _compute_deterministic_summary.
    PATCH 9 — Include end_reason + interruption note in Mem0 memory text.
    """
    print("[finalize] started")

    interview_id = state.get("interview_id")
    user_id = state.get("user_id")
    role = state.get("role") or "Software Engineer"
    interview_type = state.get("interview_type", "technical")
    candidate_name = state.get("candidate_name", "the candidate")
    start_time = state.get("start_time", int(time.time()))
    description = state.get("description") or ""
    duration_seconds = int(time.time()) - start_time

    human_round = is_human_round(interview_type)
    custom_config = parse_custom_config(description)
    custom_topics: List[str] = custom_config.get("topics", [])
    difficulty_override: str = custom_config.get("difficulty_override", "")

    # Load full history from Redis
    raw_history = client.lrange(f"interview:{interview_id}:history", 0, -1)
    history = [json.loads(h) for h in raw_history]

    # ── PATCH 5: Read integrity fields from Redis ──────────────────────────
    def _redis_int(key: str, fallback: int = 0) -> int:
        raw = client.get(key)
        if raw is None:
            return fallback
        try:
            return int(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
        except (ValueError, AttributeError):
            return fallback

    def _redis_str(key: str, fallback: str = "") -> str:
        raw = client.get(key)
        if raw is None:
            return fallback
        return raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)

    interruption_count = _redis_int(
        f"interview:{interview_id}:interruptions", state.get("interruption_count", 0)
    )
    end_reason = _redis_str(
        f"interview:{interview_id}:end_reason", state.get("end_reason", "completed")
    )
    recorded_duration = _redis_int(
        f"interview:{interview_id}:duration_sec", duration_seconds
    )

    # If the session ended early (not 'completed'), override the duration
    # with whatever the frontend reported — it's more accurate.
    if end_reason != "completed" and recorded_duration > 0:
        duration_seconds = recorded_duration

    is_early_exit = end_reason != "completed"
    print(
        f"[finalize] end_reason={end_reason} interruptions={interruption_count} early_exit={is_early_exit}"
    )

    if not history:
        summary_payload = {
            "role": role,
            "interview_type": interview_type,
            "candidate_name": candidate_name,
            "date_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "duration_seconds": duration_seconds,
            "overall_score": 0,
            "recommendation": "Insufficient data",
            "summary": "No questions were answered.",
            "content_quality": "No answer content was available to evaluate.",
            "delivery_quality": "Delivery quality could not be evaluated without spoken answers.",
            "interview_integrity": "Interview ended before evaluable answers were captured.",
            "what_went_right": [],
            "what_went_wrong": [],
            "strengths": [],
            "weaknesses": [],
            "tips": [],
            "skill_scores": {},
            "question_scores": [],
            "score_pillars": {
                "content_score": 0,
                "delivery_score": 0,
                "confidence_score": 0,
                "communication_flow_score": 0,
            },
            "analytics": {
                "filler_summary": {},
                "flow_summary": {},
                "confidence_summary": {},
            },
            "insights": {
                "star_completeness": [],
                "concept_coverage_trend": [],
                "recovery_score": 0,
                "pressure_handling_score": 0,
                "conciseness_score": 0,
                "coaching_priorities": [],
            },
            # ── PATCH 5: Add integrity fields to empty-history branch ──────
            "end_reason": end_reason if "end_reason" in dir() else "user_ended",
            "is_early_exit": True,
            "interruption_count": 0,
        }
        recommendation = summary_payload["recommendation"]
    else:
        # ──────────────────────────────────────────────────────────────────
        # STEP 1 — DETERMINISTIC COMPUTATION
        # ──────────────────────────────────────────────────────────────────
        # PATCH 8: Pass interruption_count to the helper
        facts = _compute_deterministic_summary(
            history, interview_type, interruption_count
        )

        overall_100 = facts["overall_100"]
        recommendation = facts["recommendation"]
        skill_scores = facts["skill_scores"]
        question_scores = facts["question_scores"]
        analytics_facts = facts.get("interview_analytics", {})

        extra_context = ""
        if custom_topics and not human_round:
            extra_context += f"\nTopics tested: {', '.join(custom_topics)}."
        if difficulty_override:
            extra_context += f"\nDifficulty setting: {difficulty_override}."
        clean_description = strip_custom_config(description)
        if clean_description:
            extra_context += f"\nSession context: {clean_description[:300]}"

        # ──────────────────────────────────────────────────────────────────
        # STEP 2 — LLM NARRATION (facts only, no invention)
        # The LLM receives the computed facts and NARRATES them.
        # It cannot change scores, invent strengths, or hallucinate gaps.
        # ──────────────────────────────────────────────────────────────────

        # Build compact Q&A block with verdicts for the LLM to reference
        qa_block = ""
        for i, h in enumerate(history):
            qa_block += (
                f"Q{i+1} [{h.get('difficulty','?')}]: {h.get('question','')}\n"
                f"Answer: {h.get('user_answer','(no answer)')}\n"
                f"Score: {h.get('score',0)}/10 | Verdict: {h.get('verdict','')}\n"
                f"Missing: {', '.join(h.get('missing_concepts',[]) or []) or 'none'}\n\n"
            )

        # ── PATCH 6: Include end_reason + interruptions in narration_prompt ────
        narration_prompt = f"""You are writing a post-interview report for a candidate.
You MUST narrate ONLY the facts provided below. Do NOT invent, inflate, or soften anything.
Use "you" when addressing the candidate. Be direct. No filler phrases.

COMPUTED FACTS (authoritative — do not contradict):
- Overall score: {overall_100}/100
- Weighted average (0-10): {facts['weighted_avg']}
- Recommendation: {recommendation}
- Top strengths: {json.dumps(facts['top_strengths'])}
- Top weaknesses: {json.dumps(facts['top_weaknesses'])}
- Repeated gaps (missed in 2+ questions): {json.dumps(facts['repeated_gaps'])}
- Weak dimensions (avg < 5): {json.dumps(facts['weak_dimensions'])}
- Dimension averages: {json.dumps(facts['dim_averages'])}
- Score pillars: {json.dumps(analytics_facts.get('score_pillars', {}))}
- Recovery score: {analytics_facts.get('recovery_score', 0)}/100
- Pressure handling score: {analytics_facts.get('pressure_handling_score', 0)}/100
- Conciseness score: {analytics_facts.get('conciseness_score', 0)}/100
- Coaching priorities: {json.dumps(analytics_facts.get('coaching_priorities', []))}
- End reason: {end_reason}{"  ⚠️  EARLY EXIT — candidate left before completing all questions." if is_early_exit else ""}
- AI interruptions: {interruption_count} times the candidate spoke over the AI mid-answer
{extra_context}

Full Q&A with verdicts:
{qa_block[:4000]}

Return ONLY valid JSON — no markdown, no extra keys:
{{
  "summary": {{
    "content_quality": "<2 sentences on technical/behavioral content quality, anchored in actual answers.>",
    "delivery_quality": "<1-2 sentences on clarity/structure/communication quality, anchored in transcript behavior.>",
    "interview_integrity": "<1 sentence on end_reason/interruptions/proctoring signals and impact.>"
  }},
  "what_went_right": [
    {{"point": "<specific thing from the actual answers — under 20 words>", "tag": "<Core|Clarity|Structure|STAR|Design>"}},
    {{"point": "<specific thing>", "tag": "<tag>"}},
    {{"point": "<specific thing>", "tag": "<tag>"}}
  ],
  "what_went_wrong": [
    {{"point": "<specific gap — name the missing concept — under 20 words>", "tag": "<Gap|Depth|Structure|STAR|Pace>"}},
    {{"point": "<specific gap>", "tag": "<tag>"}},
    {{"point": "<specific gap>", "tag": "<tag>"}}
  ],
  "tips": [
    "<actionable fix starting with a verb — under 20 words>",
    "<actionable fix>",
    "<actionable fix>"
  ]
}}

Rules:
- Every point in what_went_right/wrong MUST reference something from the actual Q&A.
- Tips must start with a verb (Always..., Lead with..., Practice..., Study...).
- No bullet characters inside strings. No markdown.
- If end_reason is NOT 'completed', "summary.interview_integrity" MUST explicitly note early termination.
- If interruption_count > 2, include it as a weakness point in what_went_wrong.
- Do not use "good job", "great answer", "nice work", "the candidate".
"""

        try:
            result_text = llm_summary.invoke(
                [HumanMessage(content=narration_prompt)]
            ).content
            narrated = safe_json_parse(result_text)

            def clean_points(raw: Any) -> List[Dict[str, str]]:
                if not isinstance(raw, list):
                    return []
                return [
                    {
                        "point": str(item.get("point", "")),
                        "tag": str(item.get("tag", "General")),
                    }
                    for item in raw
                    if isinstance(item, dict) and item.get("point")
                ]

            what_went_right = clean_points(narrated.get("what_went_right", []))
            what_went_wrong = clean_points(narrated.get("what_went_wrong", []))
            raw_summary = narrated.get("summary", {})
            if isinstance(raw_summary, dict):
                content_quality = str(raw_summary.get("content_quality", "")).strip()
                delivery_quality = str(raw_summary.get("delivery_quality", "")).strip()
                interview_integrity = str(
                    raw_summary.get("interview_integrity", "")
                ).strip()
            else:
                content_quality = str(raw_summary).strip()
                delivery_quality = ""
                interview_integrity = ""

            if not content_quality:
                content_quality = (
                    f"You finished with {overall_100}/100 and showed mixed depth across tested competencies."
                )
            if not delivery_quality:
                delivery_quality = (
                    "Your delivery quality reflects clarity and structure signals observed in your responses."
                )
            if not interview_integrity:
                interview_integrity = (
                    "Integrity signals were stable throughout this session."
                    if not is_early_exit and interruption_count <= 1
                    else f"Integrity impact noted: end_reason={end_reason}, interruptions={interruption_count}."
                )
            summary_text = " ".join(
                s
                for s in [content_quality, delivery_quality, interview_integrity]
                if s
            ).strip()

            summary_payload = {
                "role": role,
                "interview_type": interview_type,
                "candidate_name": candidate_name,
                "date_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "duration_seconds": duration_seconds,
                # ── Scores from deterministic step — LLM cannot touch these ──
                "overall_score": overall_100,
                "recommendation": recommendation,
                "skill_scores": skill_scores,
                "question_scores": question_scores,
                "score_pillars": analytics_facts.get("score_pillars", {}),
                "analytics": {
                    "filler_summary": analytics_facts.get("filler_summary", {}),
                    "flow_summary": analytics_facts.get("flow_summary", {}),
                    "confidence_summary": analytics_facts.get("confidence_summary", {}),
                },
                "insights": {
                    "star_completeness": analytics_facts.get("star_completeness", []),
                    "concept_coverage_trend": analytics_facts.get("concept_coverage_trend", []),
                    "recovery_score": analytics_facts.get("recovery_score", 0),
                    "pressure_handling_score": analytics_facts.get("pressure_handling_score", 0),
                    "conciseness_score": analytics_facts.get("conciseness_score", 0),
                    "coaching_priorities": analytics_facts.get("coaching_priorities", []),
                },
                # ── Narrated content from LLM step ───────────────────────────
                "summary": summary_text,
                "content_quality": content_quality,
                "delivery_quality": delivery_quality,
                "interview_integrity": interview_integrity,
                "what_went_right": what_went_right,
                "what_went_wrong": what_went_wrong,
                "tips": [str(t) for t in narrated.get("tips", []) if t],
                # ── Backward-compat aliases ───────────────────────────────────
                "strengths": [p["point"] for p in what_went_right],
                "weaknesses": [p["point"] for p in what_went_wrong],
                # ── PATCH 5: Integrity fields in normal branch ───────────────
                "end_reason": end_reason,
                "is_early_exit": is_early_exit,
                "interruption_count": interruption_count,
                # ── Gap analysis (deterministic, always included) ─────────────
                "gap_analysis": {
                    "repeated_gaps": facts["repeated_gaps"],
                    "all_gaps": facts["all_gaps"],
                    "gap_frequency": facts["gap_frequency"],
                    "weak_dimensions": facts["weak_dimensions"],
                    "dim_averages": facts["dim_averages"],
                },
            }

        except Exception as e:
            print(f"[finalize] LLM narration error: {e}")
            # Fall back to deterministic-only summary — no LLM needed
            summary_payload = {
                "role": role,
                "interview_type": interview_type,
                "candidate_name": candidate_name,
                "date_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "duration_seconds": duration_seconds,
                "overall_score": overall_100,
                "recommendation": recommendation,
                "skill_scores": skill_scores,
                "question_scores": question_scores,
                "score_pillars": analytics_facts.get("score_pillars", {}),
                "analytics": {
                    "filler_summary": analytics_facts.get("filler_summary", {}),
                    "flow_summary": analytics_facts.get("flow_summary", {}),
                    "confidence_summary": analytics_facts.get("confidence_summary", {}),
                },
                "insights": {
                    "star_completeness": analytics_facts.get("star_completeness", []),
                    "concept_coverage_trend": analytics_facts.get("concept_coverage_trend", []),
                    "recovery_score": analytics_facts.get("recovery_score", 0),
                    "pressure_handling_score": analytics_facts.get("pressure_handling_score", 0),
                    "conciseness_score": analytics_facts.get("conciseness_score", 0),
                    "coaching_priorities": analytics_facts.get("coaching_priorities", []),
                },
                "summary": (
                    f"Interview completed with a weighted score of {facts['weighted_avg']}/10. "
                    f"Repeated gaps: {', '.join(facts['repeated_gaps']) or 'none identified'}."
                ),
                "content_quality": (
                    f"Your content quality landed at {overall_100}/100 based on weighted question performance."
                ),
                "delivery_quality": (
                    "Delivery quality was inferred from clarity and communication dimension averages."
                ),
                "interview_integrity": (
                    "No major integrity concerns detected."
                    if not is_early_exit and interruption_count <= 1
                    else f"Integrity concern: end_reason={end_reason}, interruptions={interruption_count}."
                ),
                "what_went_right": [
                    {"point": s, "tag": "Core"} for s in facts["top_strengths"][:3]
                ],
                "what_went_wrong": [
                    {"point": w, "tag": "Gap"} for w in facts["top_weaknesses"][:3]
                ],
                "strengths": facts["top_strengths"][:3],
                "weaknesses": facts["top_weaknesses"][:3],
                "tips": [],
                "end_reason": end_reason,
                "is_early_exit": is_early_exit,
                "interruption_count": interruption_count,
                "gap_analysis": {
                    "repeated_gaps": facts["repeated_gaps"],
                    "all_gaps": facts["all_gaps"],
                    "gap_frequency": facts["gap_frequency"],
                    "weak_dimensions": facts["weak_dimensions"],
                    "dim_averages": facts["dim_averages"],
                },
            }

    # Persist summary to Redis (7 days)
    client.set(
        f"interview:{interview_id}:summary",
        json.dumps(summary_payload),
        ex=60 * 60 * 24 * 7,
    )

    # Publish completion event
    publish_event(
        f"interview:{interview_id}:events",
        {"type": "interview_complete", "summary": summary_payload},
    )

    # Store to Mem0 for future sessions
    # ── PATCH 9: Include end_reason + interruption note ────────────────────
    try:
        gap_str = (
            ", ".join(
                summary_payload.get("gap_analysis", {}).get("repeated_gaps", [])[:3]
            )
            or "none"
        )

        integrity_note = ""
        if is_early_exit:
            integrity_note = f" Session ended early ({end_reason})."
        if interruption_count > 1:
            integrity_note += f" Interrupted AI {interruption_count} times."

        memory_text = (
            f"Interview for {role} ({interview_type}): "
            f"Score {summary_payload['overall_score']}/100 — {recommendation}. "
            f"Summary: {summary_payload['summary']} "
            f"Repeated gaps: {gap_str}.{integrity_note}"
        )
        memory_client.add(memory_text, user_id=user_id)
    except Exception as e:
        print(f"[finalize] Mem0 store error: {e}")

    print(
        f"[finalize] Done. Score={summary_payload.get('overall_score')}/100 | {recommendation}"
    )
    return {"summary": summary_payload}
