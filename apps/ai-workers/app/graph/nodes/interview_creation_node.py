"""
Interview Engine — Production-Grade Redesign
=============================================
Key changes vs original:

NODE 2  generate_question   — returns {question, expected_answer} JSON in ONE LLM call.
                              expected_answer carries: key_concepts, reasoning_steps,
                              ideal_structure, common_mistakes.

NODE 5  evaluate_answer     — COMPARATIVE evaluation: user_answer vs expected_answer.
                              Returns full dimensional breakdown + missing concepts.
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
import unicodedata
from collections import Counter
from typing import List, Dict, Any

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from qdrant_client import QdrantClient
from neo4j import GraphDatabase
from qdrant_client.http import models

from app.core.redis_client import client
from app.core.config import settings
from app.graph.state.interview_creation_state import InterviewState
from app.core.mem0 import memory_client


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
FILLER_TERMS = [
    "um",
    "uh",
    "like",
    "you know",
    "i mean",
    "sort of",
    "kind of",
    "basically",
    "actually",
]
HEDGE_PATTERNS = [
    r"\bmaybe\b",
    r"\bprobably\b",
    r"\bperhaps\b",
    r"\bi think\b",
    r"\bi guess\b",
    r"\bi believe\b",
    r"\bnot sure\b",
    r"\bkind of\b",
    r"\bsort of\b",
]
SELF_CORRECTION_PATTERNS = [
    r"\bi mean\b",
    r"\bsorry\b",
    r"\blet me rephrase\b",
    r"\bto correct that\b",
    r"\bor rather\b",
    r"\bwhat i meant\b",
]
NON_ANSWER_PATTERNS = [
    r"^\s*$",
    r"^\s*(i\s+don'?t\s+know|dont\s+know|do\s+not\s+know)\s*[.!]?\s*$",
    r"^\s*(no\s+idea|not\s+sure|can'?t\s+say|cannot\s+say|skip|pass)\s*[.!]?\s*$",
    r"^\s*(hmm+|umm+|uhh+|ahh+)\s*[.!]?\s*$",
]
ABUSIVE_PATTERNS = [
    r"\bfuck\b",
    r"\bfucking\b",
    r"\bshit\b",
    r"\bbitch\b",
    r"\basshole\b",
    r"\bbastard\b",
    r"\bcunt\b",
    r"\bmadarchod\b",
    r"\bbehenchod\b",
    r"\bchutiya\b",
    r"\bgandu\b",
    r"\bharami\b",
]


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _tokenize_words(text: str) -> List[str]:
    return re.findall(r"\b[\w'-]+\b", (text or "").lower())


def _count_regex_matches(text: str, patterns: List[str]) -> int:
    return sum(len(re.findall(pattern, text, flags=re.IGNORECASE)) for pattern in patterns)


def _is_non_answer(answer: str) -> bool:
    normalized = (answer or "").strip().lower()
    if not normalized:
        return True
    if any(re.match(pattern, normalized, flags=re.IGNORECASE) for pattern in NON_ANSWER_PATTERNS):
        return True

    words = _tokenize_words(normalized)
    if len(words) <= 2 and all(word in {"um", "uh", "hmm", "ah", "er"} for word in words):
        return True

    return False


def _contains_abusive_language(answer: str) -> bool:
    return any(re.search(pattern, answer or "", flags=re.IGNORECASE) for pattern in ABUSIVE_PATTERNS)


def _contains_non_english_script(answer: str) -> bool:
    for ch in answer or "":
        if ch.isalpha():
            try:
                name = unicodedata.name(ch)
            except ValueError:
                continue
            if "LATIN" not in name:
                return True
    return False


def _extract_answer_payload(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")

    if not isinstance(raw, str):
        return {"text": "", "analytics": {}}

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict) and isinstance(parsed.get("text"), str):
            analytics = parsed.get("analytics")
            return {
                "text": parsed["text"],
                "analytics": analytics if isinstance(analytics, dict) else {},
            }
    except Exception:
        pass

    return {"text": raw, "analytics": {}}


def _compute_filler_metrics(answer: str, provided: Dict[str, Any]) -> Dict[str, Any]:
    words = _tokenize_words(answer)
    word_count = max(len(words), 1)
    provided_filler = provided.get("filler_words")
    if isinstance(provided_filler, dict):
        counts = {
            str(term): _safe_int(count)
            for term, count in provided_filler.get("counts", {}).items()
        }
        total = _safe_int(provided_filler.get("count"), sum(counts.values()))
        bursts = _safe_int(provided_filler.get("bursts"))
    else:
        counts: Dict[str, int] = {}
        total = 0
        bursts = 0
        current_burst = 0
        for term in FILLER_TERMS:
            regex = r"\b" + re.escape(term) + r"\b"
            count = len(re.findall(regex, answer, flags=re.IGNORECASE))
            if count:
                counts[term] = count
                total += count
        for token in words:
            if token in {"um", "uh", "like"}:
                current_burst += 1
                if current_burst >= 2:
                    bursts += 1
            else:
                current_burst = 0

    density = round((total / word_count) * 100, 2)
    top_terms = [term for term, _ in sorted(counts.items(), key=lambda item: -item[1])[:3]]
    return {
        "count": total,
        "density": density,
        "bursts": bursts,
        "top_terms": top_terms,
        "counts": counts,
    }


def _compute_star_metrics(answer: str, interview_type: str) -> Dict[str, Any]:
    if not is_human_round(interview_type):
        return {
            "situation": False,
            "task": False,
            "action": False,
            "result": False,
            "completeness": 0,
        }

    lowered = answer.lower()
    markers = {
        "situation": bool(re.search(r"\b(when|while|at my previous|in my last role|there was a time)\b", lowered)),
        "task": bool(re.search(r"\b(my goal|i needed to|i was responsible|the task was)\b", lowered)),
        "action": bool(re.search(r"\b(i did|i led|i built|i created|i decided|i implemented)\b", lowered)),
        "result": bool(re.search(r"\b(result|outcome|impact|improved|reduced|increased|delivered)\b", lowered)),
    }
    completeness = round((sum(1 for present in markers.values() if present) / 4) * 100)
    markers["completeness"] = completeness
    return markers


def _derive_answer_analytics(
    answer: str,
    provided: Dict[str, Any],
    interview_type: str,
    expected_answer: Dict[str, Any],
    dimensions: Dict[str, Any],
    score: int,
    missing_concepts: List[str],
) -> Dict[str, Any]:
    words = _tokenize_words(answer)
    word_count = len(words)
    speech_duration_ms = max(
        1000,
        _safe_int(provided.get("speech_duration_ms"), word_count * 450),
    )
    latency_ms = max(0, _safe_int(provided.get("latency_ms"), 0))
    interruptions = max(0, _safe_int(provided.get("interruption_count"), 0))
    filler = _compute_filler_metrics(answer, provided)

    wpm = round((word_count / max(speech_duration_ms / 60000, 1 / 60)), 1) if word_count else 0.0
    pause_ratio = clamp(
        _safe_float(
            provided.get("pause_ratio"),
            latency_ms / max(latency_ms + speech_duration_ms, 1),
        ),
        0.0,
        0.9,
    )
    long_pauses = max(
        0,
        _safe_int(
            provided.get("long_pause_count"),
            1 if latency_ms >= 2500 else 0,
        ),
    )
    consistency = round(
        clamp(
            100
            - abs(wpm - 145) * 0.45
            - pause_ratio * 70
            - long_pauses * 8
            - filler["density"] * 1.4,
            0,
            100,
        )
    )

    hedges = max(
        0,
        _safe_int(
            provided.get("hedge_count"),
            _count_regex_matches(answer, HEDGE_PATTERNS),
        ),
    )
    self_corrections = max(
        0,
        _safe_int(
            provided.get("self_corrections"),
            _count_regex_matches(answer, SELF_CORRECTION_PATTERNS),
        ),
    )
    decisiveness = round(
        clamp(100 - hedges * 9 - self_corrections * 10 - filler["bursts"] * 5, 0, 100)
    )
    vocal_stability = round(
        clamp(100 - pause_ratio * 65 - long_pauses * 10 - interruptions * 7, 0, 100)
    )
    confidence_score = round(
        clamp(
            decisiveness * 0.45
            + vocal_stability * 0.35
            + consistency * 0.20
            - filler["density"] * 1.2,
            0,
            100,
        )
    )

    star = _compute_star_metrics(answer, interview_type)
    expected_key_concepts = expected_answer.get("key_concepts", []) or []
    expected_count = len(expected_key_concepts)
    concept_hits = max(0, expected_count - len(missing_concepts))
    concept_coverage = round((concept_hits / expected_count) * 100) if expected_count else min(score * 10, 100)

    target_words = 120 if is_human_round(interview_type) else 90
    length_penalty = abs(word_count - target_words) * 0.35
    conciseness_score = round(
        clamp(
            100 - filler["density"] * 2.2 - filler["bursts"] * 4 - length_penalty,
            0,
            100,
        )
    )

    clarity_score = _safe_int(dimensions.get("clarity"), score) * 10
    communication_score = _safe_int(dimensions.get("communication"), score) * 10
    content_score = round(clamp(score * 10 + concept_coverage * 0.15, 0, 100))
    delivery_score = round(clamp(consistency * 0.45 + conciseness_score * 0.35 + communication_score * 0.20, 0, 100))
    communication_flow_score = round(
        clamp(clarity_score * 0.4 + consistency * 0.4 + (100 - pause_ratio * 100) * 0.2, 0, 100)
    )

    return {
        "word_count": word_count,
        "speech_duration_ms": speech_duration_ms,
        "latency_ms": latency_ms,
        "interruptions": interruptions,
        "filler": filler,
        "flow": {
            "wpm": wpm,
            "pause_ratio": round(pause_ratio, 3),
            "long_pauses": long_pauses,
            "latency_ms": latency_ms,
            "consistency": consistency,
        },
        "confidence_signals": {
            "hedges": hedges,
            "self_corrections": self_corrections,
            "vocal_stability": vocal_stability,
            "decisiveness": decisiveness,
            "score": confidence_score,
        },
        "star": star,
        "conciseness_score": conciseness_score,
        "concept_coverage": concept_coverage,
        "score_pillars": {
            "content_score": content_score,
            "delivery_score": delivery_score,
            "confidence_score": confidence_score,
            "communication_flow_score": communication_flow_score,
        },
    }


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


llm_classifier = ChatOpenAI(
    model="gpt-4.1", temperature=0.0, api_key=settings.OPENAI_API_KEY
)

# ── Slightly warmer for the reference answer — we want natural language ──
llm_ref = ChatOpenAI(model="gpt-4.1", temperature=0.3, api_key=settings.OPENAI_API_KEY)
INTERVIEWER_PERSONA = (
    "You are a professional, in-character technical/behavioral interviewer. "
    "You are polite but firm. You never break character. "
    "You respond in English only, regardless of what language the candidate uses."
)


def _safe_json(text: str) -> dict:
    cleaned = re.sub(r"```(?:json)?", "", text).replace("```", "").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    raise ValueError(f"Cannot parse JSON: {text[:200]}")


def _publish_event(channel: str, payload: dict) -> None:
    client.publish(channel, json.dumps(payload))


def _is_terminated(state: InterviewState) -> bool:
    return bool(state.get("timeout", False))


def get_candidate_name(resume_chunks: List[str]) -> str:
    if not resume_chunks:
        return "the candidate"
    first_chunk = resume_chunks[0][:300]
    lines = [l.strip() for l in first_chunk.splitlines() if l.strip()]
    return lines[0] if lines else "the candidate"


def is_human_round(interview_type: str) -> bool:
    return (interview_type or "").strip().lower() in HUMAN_INTERVIEW_TYPES


def _is_terminated(state: InterviewState) -> bool:
    return bool(state.get("timeout", False))


def _normalize_topic_phrase(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9\s/#.+-]", " ", (value or "").lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return ""
    stop = {
        "the",
        "and",
        "with",
        "about",
        "your",
        "their",
        "from",
        "into",
        "that",
        "this",
        "have",
        "what",
        "when",
        "where",
        "which",
        "would",
        "could",
        "should",
        "explain",
        "describe",
        "walk",
        "through",
        "question",
        "answer",
    }
    tokens = [token for token in cleaned.split() if len(token) > 2 and token not in stop]
    return " ".join(tokens[:4]).strip()


def _extract_memory_focuses(raw_memories: List[Any]) -> List[str]:
    focuses: List[str] = []
    for memory in raw_memories:
        text = memory.get("memory", str(memory)) if isinstance(memory, dict) else str(memory)
        segments = re.split(r"[.;\n]", text)
        for segment in segments:
            lowered = segment.lower()
            if any(marker in lowered for marker in ("gap", "weak", "struggle", "practice", "improve", "missed")):
                normalized = _normalize_topic_phrase(segment)
                if normalized:
                    focuses.append(normalized)
    ranked = [item for item, _ in Counter(focuses).most_common(6)]
    return ranked


def _extract_covered_topics(question_history: List[Dict[str, Any]]) -> List[str]:
    topics: List[str] = []
    for entry in question_history:
        pieces = [
            str(entry.get("question", "")),
            *[str(item) for item in (entry.get("weaknesses") or []) if item],
            *[str(item) for item in (entry.get("missing_concepts") or []) if item],
        ]
        for piece in pieces:
            normalized = _normalize_topic_phrase(piece)
            if normalized:
                topics.append(normalized)
    return [item for item, _ in Counter(topics).most_common(8)]


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
        "start_time": int(time.time()),
        "consecutive_struggles": 0,
        "is_support_turn": False,
        "timeout": False,
        "gap_map": {},
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
    memory_focuses = _extract_memory_focuses(raw_memories)
    covered_topics = _extract_covered_topics(question_history)
    memories_text = json.dumps(
        [
            m.get("memory", str(m)) if isinstance(m, dict) else str(m)
            for m in raw_memories[:5]
        ],
        indent=2,
    )
    memory_focus_block = (
        "\nPrevious weak areas to probe more carefully: "
        + ", ".join(memory_focuses[:5])
        if memory_focuses
        else "\nPrevious weak areas to probe more carefully: none recorded."
    )
    covered_topics_block = (
        "\nTopics already covered in this and past recent sessions: "
        + ", ".join(covered_topics[:6])
        if covered_topics
        else "\nTopics already covered in this and past recent sessions: none."
    )
    adaptive_instruction_block = (
        "\nAdaptive interviewing guidance:"
        "\n- Prefer asking for explanation on past weak areas before introducing unrelated concepts."
        "\n- Avoid repeating already-covered topics unless you are intentionally testing improvement."
        "\n- If you revisit a weak area, ask for a clearer explanation than before and require stronger reasoning."
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

    # ── Build prompt — returns JSON with question + expected_answer ─────────
    if human_round:
        system_prompt = f"""You are a strict {interview_type.upper()} interviewer for a {role} position.

Candidate: {candidate_name}
Resume (background only — NO technical questions):
\"\"\"{resume_text[:1500]}\"\"\"

Memories: {memories_text[:400]}
{extra_context_block}
{memory_focus_block}
{covered_topics_block}
{adaptive_instruction_block}
Previous questions (do NOT repeat themes): {prev_qa_summary or "None yet."}

TASK — Question #{index + 1} of {max_questions} | {difficulty.upper()}
{difficulty_instruction}

ABSOLUTE RULES:
1. ZERO technical content — no code, algorithms, systems, APIs, frameworks, databases.
2. Output ONLY valid JSON — no markdown, no commentary, no preamble.
3. The expected_answer must be specific to THIS question, not generic.
4. The interview is English-only. Ask the question in English and expect the candidate to answer in English.
5. Professional conduct is mandatory. Abusive language is a policy violation.

Return ONLY this JSON:
{{
  "question": "<the exact question to ask — one sentence, no numbering>",
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
{extra_context_block}{memory_focus_block}{covered_topics_block}{adaptive_instruction_block}{topic_constraint}
Previous questions (do NOT repeat topics): {prev_qa_summary or "None yet."}

TASK — Question #{index + 1} of {max_questions} | {difficulty.upper()}
{difficulty_instruction}

RULES:
1. Output ONLY valid JSON — no markdown, no commentary, no preamble.
2. The expected_answer must be specific to THIS question.
3. key_concepts must be the EXACT technical concepts a correct answer requires.
4. common_mistakes must name real misconceptions, not generic advice.
5. The interview is English-only. Ask the question in English and expect the candidate to answer in English.
6. Professional conduct is mandatory. Abusive language is a policy violation.

Return ONLY this JSON:
{{
  "question": "<the exact question to ask — one sentence, no numbering>",
  "expected_answer": {{
    "key_concepts": ["<required concept 1>", "<required concept 2>", "<required concept 3>"],
    "reasoning_steps": ["<step 1>", "<step 2>", "<step 3>"],
    "ideal_structure": "<what a complete, correct answer covers — 1 sentence>",
    "common_mistakes": ["<mistake 1>", "<mistake 2>", "<mistake 3>"]
  }}
}}"""

    question = ""
    expected_answer = {}

    try:
        response_text = llm.invoke(
            [HumanMessage(content=system_prompt)]
        ).content.strip()
        parsed = safe_json_parse(response_text)
        question = str(parsed.get("question", "")).strip()
        expected_answer = parsed.get("expected_answer", {})

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
<<<<<<< HEAD
=======
                target_competency = str(parsed.get("target_competency", "")).strip()
                difficulty_rationale = str(
                    parsed.get("difficulty_rationale", "")
                ).strip()
                anti_repetition_key = str(parsed.get("anti_repetition_key", "")).strip()
                question_evidence_anchor = str(
                    parsed.get("evidence_anchor", "")
                ).strip()
>>>>>>> upstream/main

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
<<<<<<< HEAD
=======
        target_competency = (
            "behavioral_communication" if human_round else "technical_problem_solving"
        )
        difficulty_rationale = f"Fallback question chosen for {difficulty.upper()} after LLM parse failure."
        anti_repetition_key = f"fallback-{difficulty}-{index}"
        question_evidence_anchor = (
            custom_topics[0]
            if custom_topics
            else (skills[0] if skills else "candidate profile context")
        )

    if not target_competency:
        target_competency = (
            "behavioral_communication" if human_round else "technical_problem_solving"
        )
    if not difficulty_rationale:
        difficulty_rationale = f"This question is calibrated for {difficulty.upper()} based on prior turns and profile depth."
    if not anti_repetition_key:
        anti_repetition_key = f"{interview_type.lower()}-{difficulty}-q{index+1}"
    if not question_evidence_anchor:
        question_evidence_anchor = (
            custom_topics[0]
            if custom_topics
            else (skills[0] if skills else "candidate profile context")
        )
>>>>>>> upstream/main

    entry = {
        "question": question,
        "expected_answer": expected_answer,
        "answer": "",
        "index": index,
        "difficulty": difficulty,
        "timestamp": int(time.time()),
    }

    print(f"[generate_question] Q#{index+1} ({difficulty}): {question[:100]}…")

    return {
        "current_question": question,
        "expected_answer": expected_answer,
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
        return {"user_answer": "", "timeout": True}

    interview_id = state.get("interview_id")
    answer_key = f"interview:{interview_id}:latest_answer"
    end_key = f"interview:{interview_id}:ended"
    ready_channel = f"interview:{interview_id}:answer_ready"
    timeout = 240

    # Check persistent end flag before subscribing (race-condition guard)
    if client.exists(end_key):
        print("[wait_for_answer] ⛔ End flag already set")
        return {"user_answer": "", "timeout": True}

    # Drain any answer already in the key
    raw = client.get(answer_key)
    if raw:
        client.delete(answer_key)
        payload = _extract_answer_payload(raw)
        answer = payload["text"]
        if answer == "__END__":
            return {"user_answer": "", "timeout": True}
        return {
            "user_answer": answer,
            "answer_analytics": payload.get("analytics", {}),
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
                return {"user_answer": "", "timeout": True}

            message = sub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message is None:
                continue
            if message["type"] != "message":
                continue

            raw = client.get(answer_key)
            if raw:
                client.delete(answer_key)
                payload = _extract_answer_payload(raw)
                answer = payload["text"]
                if answer == "__END__":
<<<<<<< HEAD
                    return {"user_answer": "", "timeout": True}
=======
                    return {
                        "user_answer": "",
                        "response_analytics": {},
                        "timeout": True,
                    }
>>>>>>> upstream/main
                print(f"[wait_for_answer] Answer received: {answer[:80]}…")
                return {
                    "user_answer": answer,
                    "answer_analytics": payload.get("analytics", {}),
                    "timeout": False,
                }
    finally:
        try:
            sub.unsubscribe(ready_channel)
            sub.close()
        except Exception:
            pass

    print("[wait_for_answer] Timed out after 240s")
    return {"user_answer": "", "timeout": True}


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
    provided_analytics = state.get("answer_analytics") or {}
    expected_answer = state.get("expected_answer") or {}
    role = state.get("role") or "Software Engineer"
    difficulty = state.get("difficulty", "medium")
    interview_type = state.get("interview_type", "technical")
    skills = [str(s) for s in (state.get("skills") or []) if s is not None]
    timed_out = state.get("timeout", False)
    is_support_turn = state.get("is_support_turn", False)

    _empty = {
        "score": 0,
        "confidence": 0.0,
        "dimensions": {
            "clarity": 0,
            "communication": 0,
            "star_structure": 0,
            "self_awareness": 0,
            "correctness": 0,
            "depth": 0,
        },
        "missing_concepts": expected_answer.get("key_concepts", []) or [],
        "incorrect_points": [],
        "strengths": [],
        "weaknesses": ["You gave no substantive answer to evaluate."],
        "verdict": "You did not provide a substantive answer, so this response earned no credit.",
        "feedback": "You did not provide a substantive answer, so this response earned no credit.",
        "followup": False,
        "followup_question": "",
        "answer_analytics": {},
        "score_pillars": {
            "content_score": 0,
            "delivery_score": 0,
            "confidence_score": 0,
            "communication_flow_score": 0,
        },
    }

    if timed_out or not answer.strip():
        return _empty

    if _is_non_answer(answer):
        return _empty

    if _contains_non_english_script(answer):
        return {
            **_empty,
            "missing_concepts": expected_answer.get("key_concepts", []) or [],
            "weaknesses": ["You answered in a non-English language during an English-only interview."],
            "verdict": "You violated the interview language policy by answering in a non-English language.",
            "feedback": "You violated the interview language policy by answering in a non-English language.",
        }

    if _contains_abusive_language(answer):
        return {
            **_empty,
            "missing_concepts": expected_answer.get("key_concepts", []) or [],
            "weaknesses": ["You used abusive language instead of giving a professional answer."],
            "verdict": "You violated interview conduct policy by using abusive language.",
            "feedback": "You violated interview conduct policy by using abusive language.",
        }

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
            "feedback": state.get("feedback", ""),
            "followup": False,
            "followup_question": "",
            "answer_analytics": state.get("answer_analytics", {}),
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
- If the answer is not in English, treat it as a policy violation and score it 0.
- If the answer contains abusive or harsh language, treat it as a conduct violation and score it 0.

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
- If the answer is not in English, treat it as a policy violation and score it 0.
- If the answer contains abusive or harsh language, treat it as a conduct violation and score it 0.

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

        word_count = len(_tokenize_words(answer))
        if word_count <= 4:
            final_score = min(final_score, 1)
            for key in (
                "clarity",
                "communication",
                "correctness",
                "depth",
                "star_structure",
                "self_awareness",
            ):
                if key in dimensions:
                    dimensions[key] = min(dimensions[key], 2)

        verdict = str(parsed.get("verdict", "")).strip()

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
            "feedback": verdict,  # backward-compat alias
            "followup": bool(parsed.get("followup", False)),
            "followup_question": str(parsed.get("followup_question", "")),
        }
        if word_count <= 4:
            if "Answer was too thin to evaluate meaningfully." not in result["weaknesses"]:
                result["weaknesses"].append("Answer was too thin to evaluate meaningfully.")
            result["strengths"] = []
            result["missing_concepts"] = list({
                *result["missing_concepts"],
                *[str(c) for c in expected_answer.get("key_concepts", []) if c],
            })
            result["verdict"] = (
                "Your response was too short to demonstrate understanding, so it was scored strictly."
            )
            result["feedback"] = result["verdict"]
        answer_analytics = _derive_answer_analytics(
            answer,
            provided_analytics,
            interview_type,
            expected_answer,
            dimensions,
            final_score,
            missing_concepts,
        )
        result["answer_analytics"] = answer_analytics
        result["score_pillars"] = answer_analytics.get("score_pillars", {})

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
            "feedback": "Evaluation error.",
            "followup": False,
            "followup_question": "",
            "answer_analytics": {},
            "score_pillars": {},
        }

    print(
        f"[evaluate_answer] Score: {result['score']}/10 | "
        f"Missing: {result['missing_concepts'][:3]} | "
        f"Followup: {result['followup']}"
    )
    return result


def classify_answer_intent(state: InterviewState) -> dict:
    """
    NODE A — Classifies what the user actually said before scoring it.

    Returns a dict that includes:
        intent            : 'answer' | 'meta_request' | 'skip' | 'question'
        intent_reply      : interviewer response for non-ANSWER intents (empty for ANSWER)
        user_answer       : unchanged (pass-through)
        timeout           : unchanged (pass-through)
        skip_requested    : True only when intent == 'skip'

    The LangGraph router reads `intent` to decide the next node.
    """
    print("[classify_answer_intent] started")

    if _is_terminated(state):
        print("[classify_answer_intent] ⛔ Terminated — skipping")
        return {
            "intent": "answer",
            "intent_reply": "",
            "skip_requested": False,
        }

    answer = (state.get("user_answer") or "").strip()
    question = state.get("current_question", "")
    role = state.get("role", "Software Engineer")
    interview_type = state.get("interview_type", "technical")
    interview_id = state.get("interview_id", "")
    index = state.get("current_index", 1) - 1

    # Empty answer — treat as a no-op ANSWER so downstream handles it with _empty
    if not answer:
        return {
            "intent": "answer",
            "intent_reply": "",
            "skip_requested": False,
        }

    classification_prompt = f"""{INTERVIEWER_PERSONA}
 
You are currently running a {interview_type} interview for a {role} position.
 
The question that was just asked to the candidate:
\"\"\"
{question}
\"\"\"
 
The candidate responded with:
\"\"\"
{answer}
\"\"\"
 
Your task: classify the candidate's response into EXACTLY ONE of these four intents.
 
INTENT DEFINITIONS:
  ANSWER        — The candidate is genuinely attempting to answer the question.
                  Even a partial, wrong, or very short answer still counts.
                  Even if they mention they don't know but try to reason → ANSWER.
  META_REQUEST  — The candidate is NOT answering. Instead they are making a
                  request that changes how the interview runs:
                    · asking to switch language ("speak Hindi", "respond in French")
                    · asking to change the format ("can you type instead of speak")
                    · asking about scoring rules ("how will this be graded")
                    · any request that is about the interview process itself
  SKIP          — The candidate explicitly says they want to skip or pass:
                    · "skip", "pass", "next question", "I want to skip this",
                      "can we move on", "skip karein"
  QUESTION      — The candidate is asking a clarifying question about the
                  interview question itself (not about the process):
                    · "what do you mean by X?"
                    · "are you asking about Y or Z?"
                    · "can you give me an example?"
 
CLASSIFICATION RULES:
  1. If there is ANY genuine attempt to address the question topic, prefer ANSWER.
  2. Only use META_REQUEST if the response contains zero answer content AND is
     clearly a request to change something about how the interview works.
  3. Language-switch requests ("reply in Hindi") are always META_REQUEST.
  4. "I don't know" alone is ANSWER (a valid but weak answer).
  5. Combine meta + attempt → classify as ANSWER (the attempt wins).
 
After classifying, write a SHORT in-character interviewer reply for non-ANSWER
intents. The reply must:
  - Be 1–3 sentences maximum.
  - Stay strictly in English regardless of what language the candidate used.
  - For META_REQUEST: politely but FIRMLY decline. Do NOT apologize excessively.
    State clearly this is not possible and redirect to the question.
  - For SKIP: acknowledge, say you will move to the next question.
  - For QUESTION: answer the clarification concisely, then re-invite the answer.
  - For ANSWER: leave reply as empty string "".
 
Return ONLY valid JSON:
{{
  "intent": "<ANSWER|META_REQUEST|SKIP|QUESTION>",
  "reply": "<in-character reply for non-ANSWER — empty string for ANSWER>"
}}"""

    intent = "answer"
    intent_reply = ""

    try:
        raw = llm_classifier.invoke(
            [HumanMessage(content=classification_prompt)]
        ).content.strip()
        parsed = _safe_json(raw)

        raw_intent = str(parsed.get("intent", "ANSWER")).strip().upper()
        if raw_intent not in {"ANSWER", "META_REQUEST", "SKIP", "QUESTION"}:
            raw_intent = "ANSWER"

        intent = raw_intent.lower()
        intent_reply = str(parsed.get("reply", "")).strip()

        print(
            f"[classify_answer_intent] intent={intent} | "
            f"reply={intent_reply[:80] if intent_reply else '(none)'}…"
        )

    except Exception as e:
        print(f"[classify_answer_intent] LLM/parse error: {e} — defaulting to ANSWER")
        intent = "answer"
        intent_reply = ""

    # Publish the intent reply immediately so frontend TTS reads it out
    if intent != "answer" and intent_reply and interview_id:
        _publish_event(
            f"interview:{interview_id}:events",
            {
                "type": "intent_reply",
                "intent": intent,
                "reply": intent_reply,
                "index": index,
            },
        )
        print(f"[classify_answer_intent] Published intent_reply for intent={intent}")

    return {
        "intent": intent,
        "intent_reply": intent_reply,
        "skip_requested": intent == "skip",
    }


# ─────────────────────────────────────────────────────────────────────────────
# NODE B: GENERATE REFERENCE ANSWER
# ─────────────────────────────────────────────────────────────────────────────


def generate_reference_answer(state: InterviewState) -> dict:
    """
    NODE B — Generates a clean, human-readable model answer for the current
    question. Runs AFTER generate_question, BEFORE publish_question.

    The reference answer is stored in state['reference_answer'] and is
    included in:
      · store_step() — persisted per question in Redis
      · finalize() — included in question_scores for frontend feedback display

    It is NOT shown during the interview — only in the post-interview report.

    Returns:
        reference_answer: str — a 150-300 word model answer in plain English
    """
    print("[generate_reference_answer] started")

    if _is_terminated(state):
        print("[generate_reference_answer] ⛔ Terminated — skipping")
        return {"reference_answer": ""}

    question = state.get("current_question", "")
    expected_answer = state.get("expected_answer") or {}
    role = state.get("role", "Software Engineer")
    interview_type = state.get("interview_type", "technical")
    difficulty = state.get("difficulty", "medium")

    # Support turns have no scoreable question — skip
    if state.get("is_support_turn", False):
        print("[generate_reference_answer] Skipping — support turn")
        return {"reference_answer": ""}

    if not question:
        return {"reference_answer": ""}

    key_concepts = expected_answer.get("key_concepts", [])
    reasoning_steps = expected_answer.get("reasoning_steps", [])
    ideal_structure = expected_answer.get("ideal_structure", "")
    common_mistakes = expected_answer.get("common_mistakes", [])

    is_behavioral = interview_type in {"behavioral", "hr"}

    if is_behavioral:
        format_note = (
            "Structure the answer using the STAR method "
            "(Situation, Task, Action, Result). "
            "Make it concrete — invent a realistic professional scenario. "
            "Include a measurable outcome in the Result section."
        )
    else:
        format_note = (
            "Structure the answer clearly: start with a direct answer, "
            "explain the reasoning, cover edge cases or trade-offs if relevant. "
            "Use plain English — no code unless essential."
        )

    ref_prompt = f"""You are an expert {role} being asked a {difficulty.upper()} {interview_type} interview question.
 
QUESTION:
{question}
 
WHAT A COMPLETE ANSWER MUST COVER:
Key concepts: {json.dumps(key_concepts)}
Reasoning steps: {json.dumps(reasoning_steps)}
Ideal structure: {ideal_structure}
Common mistakes to avoid: {json.dumps(common_mistakes)}
 
YOUR TASK:
Write a model answer that a strong candidate would give. This answer will be shown
to the candidate AFTER the interview as a reference — not during.
 
FORMAT RULES:
- {format_note}
- 150–300 words. No more.
- Write in first person ("I would...", "In my experience...").
- Do NOT use bullet points or numbered lists — write in flowing prose.
- Do NOT start with "Certainly", "Sure", "Great question", or any preamble.
- Start directly with the answer content.
- Cover all key concepts naturally within the prose.
 
Write only the model answer. Nothing else."""

    reference_answer = ""

    try:
        reference_answer = llm_ref.invoke(
            [HumanMessage(content=ref_prompt)]
        ).content.strip()
        print(
            f"[generate_reference_answer] Generated {len(reference_answer)} chars "
            f"for Q: {question[:60]}…"
        )
    except Exception as e:
        print(f"[generate_reference_answer] LLM error: {e}")
        # Fallback: build a minimal reference from expected_answer fields
        if key_concepts:
            reference_answer = (
                f"A strong answer to this question would cover: "
                f"{', '.join(key_concepts[:4])}. "
            )
        if reasoning_steps:
            reference_answer += (
                f"The ideal reasoning path is: {' → '.join(reasoning_steps[:3])}. "
            )
        if ideal_structure:
            reference_answer += ideal_structure
        reference_answer = reference_answer.strip() or (
            "No reference answer could be generated for this question."
        )

    return {"reference_answer": reference_answer}


# ─────────────────────────────────────────────────────────────────────────────
# LANGGRAPH ROUTER  (add this to your graph builder)
# ─────────────────────────────────────────────────────────────────────────────


def route_after_intent(state: InterviewState) -> str:
    """
    Conditional edge function for LangGraph.
    Called after classify_answer_intent.

    Returns the name of the next node:
        "evaluate_answer"    — ANSWER intent → score it
        "wait_for_answer"    — META_REQUEST or QUESTION → loopback after reply
        "generate_question"  — SKIP → advance to next question
    """
    intent = (state.get("intent") or "answer").lower()

    if intent == "answer":
        return "evaluate_answer"
    elif intent == "skip":
        return "generate_question"
    else:
        # META_REQUEST or QUESTION — reply was already published, loop back
        return "wait_for_answer"


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
<<<<<<< HEAD
=======
        "target_competency": state.get("target_competency", ""),
        "difficulty_rationale": state.get("difficulty_rationale", ""),
        "reference_answer": state.get("reference_answer", ""), 
        "expected_answer": state.get("expected_answer", {}),
        "anti_repetition_key": state.get("anti_repetition_key", ""),
        "evidence_anchor": state.get("question_evidence_anchor", ""),
>>>>>>> upstream/main
        "user_answer": state.get("user_answer", ""),
        "score": state.get("score", 0),
        "confidence": state.get("confidence", 0.0),
        "dimensions": state.get("dimensions", {}),
        "answer_analytics": state.get("answer_analytics", {}),
        "score_pillars": state.get("score_pillars", {}),
        "missing_concepts": state.get("missing_concepts", []),
        "incorrect_points": state.get("incorrect_points", []),
        "strengths": state.get("strengths", []),
        "weaknesses": state.get("weaknesses", []),
        "verdict": state.get("verdict", ""),
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
                "answer_analytics": entry["answer_analytics"],
                "score_pillars": entry["score_pillars"],
                "missing_concepts": entry["missing_concepts"],
                "strengths": entry["strengths"],
                "weaknesses": entry["weaknesses"],
                "verdict": entry["verdict"],
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
    pillar_totals: Dict[str, List[float]] = {
        "content_score": [],
        "delivery_score": [],
        "confidence_score": [],
        "communication_flow_score": [],
    }
    coverage_trend: List[Dict[str, Any]] = []
    filler_counts: List[int] = []
    filler_densities: List[float] = []
    filler_bursts: List[int] = []
    wpm_values: List[float] = []
    pause_ratios: List[float] = []
    latencies: List[int] = []
    long_pause_values: List[int] = []
    consistency_values: List[int] = []
    confidence_scores: List[int] = []
    hedge_counts: List[int] = []
    self_correction_counts: List[int] = []
    vocal_stability_values: List[int] = []
    decisiveness_values: List[int] = []
    conciseness_values: List[int] = []
    star_values: List[int] = []

    for i, h in enumerate(history):
        analytics = h.get("answer_analytics", {}) or {}
        pillars = analytics.get("score_pillars") or h.get("score_pillars") or {}
        for pillar in pillar_totals:
            pillar_totals[pillar].append(
                _safe_float(pillars.get(pillar), float(h.get("score", 0)) * 10)
            )

        filler = analytics.get("filler", {}) or {}
        flow = analytics.get("flow", {}) or {}
        confidence_signals = analytics.get("confidence_signals", {}) or {}
        star = analytics.get("star", {}) or {}

        filler_counts.append(_safe_int(filler.get("count")))
        filler_densities.append(_safe_float(filler.get("density")))
        filler_bursts.append(_safe_int(filler.get("bursts")))
        wpm_values.append(_safe_float(flow.get("wpm")))
        pause_ratios.append(_safe_float(flow.get("pause_ratio")))
        latencies.append(_safe_int(flow.get("latency_ms")))
        long_pause_values.append(_safe_int(flow.get("long_pauses")))
        consistency_values.append(_safe_int(flow.get("consistency")))
        confidence_scores.append(_safe_int(confidence_signals.get("score")))
        hedge_counts.append(_safe_int(confidence_signals.get("hedges")))
        self_correction_counts.append(_safe_int(confidence_signals.get("self_corrections")))
        vocal_stability_values.append(_safe_int(confidence_signals.get("vocal_stability")))
        decisiveness_values.append(_safe_int(confidence_signals.get("decisiveness")))
        conciseness_values.append(_safe_int(analytics.get("conciseness_score")))
        if is_human_round(interview_type):
            star_values.append(_safe_int(star.get("completeness")))

        coverage_trend.append(
            {
                "question_order": _safe_int(h.get("index"), i) + 1,
                "coverage_score": _safe_int(analytics.get("concept_coverage")),
                "difficulty": h.get("difficulty", "unknown"),
            }
        )

    question_scores = [
        {
            "index": h.get("index", i),
            "score": round(float(h.get("score", 0)) * 10),  # 0–100
            "difficulty": h.get("difficulty", "unknown"),
            "question": h.get("question", ""),
            "verdict": h.get("verdict", ""),
            "analytics": h.get("answer_analytics", {}),
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

    score_pillars = {
        pillar: round(sum(values) / len(values)) if values else overall_100
        for pillar, values in pillar_totals.items()
    }
    avg_coverage = round(
        sum(point["coverage_score"] for point in coverage_trend) / len(coverage_trend)
    ) if coverage_trend else 0

    midpoint = max(1, len(raw_scores) // 2)
    first_half = raw_scores[:midpoint]
    second_half = raw_scores[midpoint:] or raw_scores
    recovery_score = round(
        clamp(
            50
            + (sum(second_half) / len(second_half) - sum(first_half) / len(first_half)) * 14
            + (avg_coverage - 60) * 0.25,
            0,
            100,
        )
    )
    hard_scores = [
        float(item.get("score", 0)) * 10
        for item in history
        if item.get("difficulty") == "hard"
    ]
    pressure_handling_score = round(
        clamp(
            (sum(hard_scores) / len(hard_scores)) if hard_scores else overall_100 * 0.85
            - max(0, interruption_count - 1) * 4,
            0,
            100,
        )
    )
    overall_conciseness = round(
        sum(conciseness_values) / len(conciseness_values)
    ) if conciseness_values else 0

    filler_summary = {
        "total_count": sum(filler_counts),
        "average_density": round(sum(filler_densities) / len(filler_densities), 2) if filler_densities else 0.0,
        "max_bursts": max(filler_bursts) if filler_bursts else 0,
        "strictness": "high"
        if (sum(filler_counts) >= 8 or (sum(filler_densities) / max(len(filler_densities), 1)) >= 6)
        else "normal",
    }
    flow_summary = {
        "avg_wpm": round(sum(wpm_values) / len(wpm_values), 1) if wpm_values else 0.0,
        "avg_pause_ratio": round(sum(pause_ratios) / len(pause_ratios), 3) if pause_ratios else 0.0,
        "long_pauses": sum(long_pause_values),
        "avg_latency_ms": round(sum(latencies) / len(latencies)) if latencies else 0,
        "consistency": round(sum(consistency_values) / len(consistency_values)) if consistency_values else 0,
    }
    confidence_summary = {
        "avg_score": round(sum(confidence_scores) / len(confidence_scores)) if confidence_scores else 0,
        "hedges": sum(hedge_counts),
        "self_corrections": sum(self_correction_counts),
        "avg_vocal_stability": round(sum(vocal_stability_values) / len(vocal_stability_values)) if vocal_stability_values else 0,
        "avg_decisiveness": round(sum(decisiveness_values) / len(decisiveness_values)) if decisiveness_values else 0,
    }

    coaching_priorities: List[str] = []
    if avg_coverage < 70:
        coaching_priorities.append("Lead with the core concept first and cover missing fundamentals before adding detail.")
    if filler_summary["average_density"] >= 5 or filler_summary["total_count"] >= 8:
        coaching_priorities.append("Cut filler words aggressively. Pause silently instead of using 'um', 'like', or 'you know'.")
    if confidence_summary["avg_score"] < 60:
        coaching_priorities.append("Sound more decisive. Replace hedged phrasing with direct statements and fewer self-corrections.")
    if flow_summary["avg_pause_ratio"] > 0.18 or flow_summary["avg_latency_ms"] > 2200:
        coaching_priorities.append("Reduce dead air. Start with a structured first sentence within two seconds of the question ending.")
    if overall_conciseness < 65:
        coaching_priorities.append("Tighten your answers. Use one clean structure instead of circling the same point.")
    if is_human_round(interview_type) and star_values and round(sum(star_values) / len(star_values)) < 75:
        coaching_priorities.append("Use STAR more strictly. Make the action and measurable result impossible to miss.")
    coaching_priorities = coaching_priorities[:3]

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
        "score_pillars": score_pillars,
        "question_scores": question_scores,
        "analytics": {
            "filler_summary": filler_summary,
            "flow_summary": flow_summary,
            "confidence_summary": confidence_summary,
            "concept_coverage_trend": coverage_trend,
        },
        "recovery_score": recovery_score,
        "pressure_handling_score": pressure_handling_score,
        "conciseness_score": overall_conciseness,
        "coaching_priorities": coaching_priorities,
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
            "what_went_right": [],
            "what_went_wrong": [],
            "strengths": [],
            "weaknesses": [],
            "tips": [],
            "skill_scores": {},
            "question_scores": [],
            "score_pillars": {},
            "analytics": {
                "filler_summary": {},
                "flow_summary": {},
                "confidence_summary": {},
                "concept_coverage_trend": [],
            },
            "recovery_score": 0,
            "pressure_handling_score": 0,
            "conciseness_score": 0,
            "coaching_priorities": [],
            # ── PATCH 5: Add integrity fields to empty-history branch ──────
            "end_reason": end_reason if "end_reason" in dir() else "user_ended",
            "is_early_exit": True,
            "interruption_count": 0,
        }
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
- End reason: {end_reason}{"  ⚠️  EARLY EXIT — candidate left before completing all questions." if is_early_exit else ""}
- AI interruptions: {interruption_count} times the candidate spoke over the AI mid-answer
{extra_context}

Full Q&A with verdicts:
{qa_block[:4000]}

Return ONLY valid JSON — no markdown, no extra keys:
{{
  "summary": "<2 sentences. First: what you demonstrated overall (reference actual answers). Second: your single biggest gap (name the concept).>",
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
- If end_reason is NOT 'completed', the first sentence of "summary" MUST note that the session ended early.
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
<<<<<<< HEAD
=======
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
                content_quality = f"You finished with {overall_100}/100 and showed mixed depth across tested competencies."
            if not delivery_quality:
                delivery_quality = "Your delivery quality reflects clarity and structure signals observed in your responses."
            if not interview_integrity:
                interview_integrity = (
                    "Integrity signals were stable throughout this session."
                    if not is_early_exit and interruption_count <= 1
                    else f"Integrity impact noted: end_reason={end_reason}, interruptions={interruption_count}."
                )
            summary_text = " ".join(
                s for s in [content_quality, delivery_quality, interview_integrity] if s
            ).strip()
>>>>>>> upstream/main

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
<<<<<<< HEAD
                "score_pillars": facts["score_pillars"],
                "analytics": facts["analytics"],
                "recovery_score": facts["recovery_score"],
                "pressure_handling_score": facts["pressure_handling_score"],
                "conciseness_score": facts["conciseness_score"],
                "coaching_priorities": facts["coaching_priorities"],
=======
                "score_pillars": analytics_facts.get("score_pillars", {}),
                "analytics": {
                    "filler_summary": analytics_facts.get("filler_summary", {}),
                    "flow_summary": analytics_facts.get("flow_summary", {}),
                    "confidence_summary": analytics_facts.get("confidence_summary", {}),
                },
                "insights": {
                    "star_completeness": analytics_facts.get("star_completeness", []),
                    "concept_coverage_trend": analytics_facts.get(
                        "concept_coverage_trend", []
                    ),
                    "recovery_score": analytics_facts.get("recovery_score", 0),
                    "pressure_handling_score": analytics_facts.get(
                        "pressure_handling_score", 0
                    ),
                    "conciseness_score": analytics_facts.get("conciseness_score", 0),
                    "coaching_priorities": analytics_facts.get(
                        "coaching_priorities", []
                    ),
                },
>>>>>>> upstream/main
                # ── Narrated content from LLM step ───────────────────────────
                "summary": str(narrated.get("summary", "")),
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
<<<<<<< HEAD
                "score_pillars": facts["score_pillars"],
                "analytics": facts["analytics"],
                "recovery_score": facts["recovery_score"],
                "pressure_handling_score": facts["pressure_handling_score"],
                "conciseness_score": facts["conciseness_score"],
                "coaching_priorities": facts["coaching_priorities"],
=======
                "score_pillars": analytics_facts.get("score_pillars", {}),
                "analytics": {
                    "filler_summary": analytics_facts.get("filler_summary", {}),
                    "flow_summary": analytics_facts.get("flow_summary", {}),
                    "confidence_summary": analytics_facts.get("confidence_summary", {}),
                },
                "insights": {
                    "star_completeness": analytics_facts.get("star_completeness", []),
                    "concept_coverage_trend": analytics_facts.get(
                        "concept_coverage_trend", []
                    ),
                    "recovery_score": analytics_facts.get("recovery_score", 0),
                    "pressure_handling_score": analytics_facts.get(
                        "pressure_handling_score", 0
                    ),
                    "conciseness_score": analytics_facts.get("conciseness_score", 0),
                    "coaching_priorities": analytics_facts.get(
                        "coaching_priorities", []
                    ),
                },
>>>>>>> upstream/main
                "summary": (
                    f"Interview completed with a weighted score of {facts['weighted_avg']}/10. "
                    f"Repeated gaps: {', '.join(facts['repeated_gaps']) or 'none identified'}."
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
