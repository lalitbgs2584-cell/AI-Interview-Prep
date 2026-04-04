"""Shared helper utilities for interview creation and evaluation."""

import json
import re
import unicodedata
from collections import Counter
from typing import Any, Dict, List
from app.core.config import settings

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

from app.core.redis_client import client
from app.core.token_budget import (
    BudgetExceededError,
    check_budget,
    estimate_tokens,
    extract_total_tokens,
    increment_usage,
)
from app.graph.state.interview_creation_state import InterviewState

DEFAULT_MAX_QUESTIONS = 10
HUMAN_INTERVIEW_TYPES = {"behavioral", "hr"}
CHAT_MODEL_NAME = "gpt-4.1"
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
    return sum(
        len(re.findall(pattern, text, flags=re.IGNORECASE)) for pattern in patterns
    )


def _is_non_answer(answer: str) -> bool:
    normalized = (answer or "").strip().lower()
    if not normalized:
        return True
    if any(
        re.match(pattern, normalized, flags=re.IGNORECASE)
        for pattern in NON_ANSWER_PATTERNS
    ):
        return True

    words = _tokenize_words(normalized)
    if len(words) <= 2 and all(
        word in {"um", "uh", "hmm", "ah", "er"} for word in words
    ):
        return True

    return False


def _contains_abusive_language(answer: str) -> bool:
    return any(
        re.search(pattern, answer or "", flags=re.IGNORECASE)
        for pattern in ABUSIVE_PATTERNS
    )


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
    top_terms = [
        term for term, _ in sorted(counts.items(), key=lambda item: -item[1])[:3]
    ]
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
        "situation": bool(
            re.search(
                r"\b(when|while|at my previous|in my last role|there was a time)\b",
                lowered,
            )
        ),
        "task": bool(
            re.search(
                r"\b(my goal|i needed to|i was responsible|the task was)\b", lowered
            )
        ),
        "action": bool(
            re.search(
                r"\b(i did|i led|i built|i created|i decided|i implemented)\b", lowered
            )
        ),
        "result": bool(
            re.search(
                r"\b(result|outcome|impact|improved|reduced|increased|delivered)\b",
                lowered,
            )
        ),
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

    # "" Unpack nested frontend envelope """"""""""""""""""""""""""""""""""""""
    # Frontend sends: { audio: {...}, speech: {...} }
    # Old code was doing provided.get("pause_ratio") " reading the wrong level
    audio = provided.get("audio") or {}
    speech = provided.get("speech") or {}

    # "" Speech duration """""""""""""""""""""""""""""""""""""""""""""""""""""""
    # Prefer audio.speaking_ms (real measured value from AudioMetricsCollector)
    # Fall back to word_count estimate only if truly missing
    speaking_ms_direct = _safe_int(audio.get("speaking_ms"), 0)
    speech_duration_ms = (
        speaking_ms_direct if speaking_ms_direct > 0 else max(1000, word_count * 450)
    )

    # "" Latency """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    # speech.response_latency_ms = time from question received to first speech
    latency_ms = max(0, _safe_int(speech.get("response_latency_ms"), 0))

    # "" Interruptions """""""""""""""""""""""""""""""""""""""""""""""""""""""""
    # Comes from socket-level tracking, not audio block
    interruptions = max(0, _safe_int(provided.get("interruption_count"), 0))

    # "" Pause metrics " real values from AudioMetricsCollector """""""""""""""
    pause_ratio = clamp(
        _safe_float(audio.get("pause_ratio"), 0.0),
        0.0,
        0.9,
    )
    long_pauses = max(0, _safe_int(audio.get("long_pause_count"), 0))

    # "" Acoustic features " real values, no longer defaulting to 0 """""""""""
    rms_mean = _safe_float(audio.get("rms_mean"), 0.0)
    rms_std = _safe_float(audio.get("rms_std"), 0.0)
    zcr_mean = _safe_float(audio.get("zcr_mean"), 0.0)
    zcr_std = _safe_float(audio.get("zcr_std"), 0.0)

    # "" WPM " use frontend value directly, it measured the real duration """"""
    # Frontend: word_count / (durationMs / 60000) " more accurate than our estimate
    wpm_frontend = _safe_float(speech.get("words_per_minute"), 0.0)
    wpm = (
        wpm_frontend
        if wpm_frontend > 0
        else (
            round((word_count / max(speech_duration_ms / 60000, 1 / 60)), 1)
            if word_count
            else 0.0
        )
    )

    # "" Filler words " computed from transcript text (no audio needed) """"""""
    filler = _compute_filler_metrics(answer, provided)

    # "" Consistency score """""""""""""""""""""""""""""""""""""""""""""""""""""
    # Measures how smooth and steady the delivery was
    # Penalizes deviation from natural WPM (145), high pause ratio,
    # long silences, and filler density
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

    # "" Hedge / self-correction detection """"""""""""""""""""""""""""""""""""
    # These are text-based signals for confidence
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

    # "" Vocal stability """""""""""""""""""""""""""""""""""""""""""""""""""""""
    # Now uses rms_std as an additional signal " high std = unsteady voice energy
    # Normalized: rms_std of 0.02 is moderate, 0.04+ is high variance
    rms_instability_penalty = clamp(rms_std / 0.04, 0.0, 1.0) * 15
    vocal_stability = round(
        clamp(
            100
            - pause_ratio * 65
            - long_pauses * 10
            - interruptions * 7
            - rms_instability_penalty,
            0,
            100,
        )
    )

    # "" Decisiveness """""""""""""""""""""""""""""""""""""""""""""""""""""""""
    decisiveness = round(
        clamp(
            100 - hedges * 9 - self_corrections * 10 - filler["bursts"] * 5,
            0,
            100,
        )
    )

    # "" Confidence score """"""""""""""""""""""""""""""""""""""""""""""""""""""
    # Now incorporates rms_mean as a real loudness/energy signal
    # rms_mean of 0.05 = strong voice, 0.01 = very quiet/tentative
    # Normalized to 0-1 range: 0.05 rms = full energy contribution
    energy_contribution = clamp(rms_mean / 0.05, 0.0, 1.0) * 15
    confidence_score = round(
        clamp(
            decisiveness * 0.35
            + vocal_stability * 0.30
            + consistency * 0.15
            + energy_contribution
            - filler["density"] * 1.8
            - filler["bursts"] * 2,
            0,
            100,
        )
    )

    # "" STAR structure (behavioral only) """""""""""""""""""""""""""""""""""""
    star = _compute_star_metrics(answer, interview_type)

    # "" Concept coverage """"""""""""""""""""""""""""""""""""""""""""""""""""""
    expected_key_concepts = expected_answer.get("key_concepts", []) or []
    expected_count = len(expected_key_concepts)
    concept_hits = max(0, expected_count - len(missing_concepts))
    concept_coverage = (
        round((concept_hits / expected_count) * 100)
        if expected_count
        else min(score * 10, 100)
    )

    # "" Conciseness """""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    target_words = 120 if is_human_round(interview_type) else 90
    length_penalty = abs(word_count - target_words) * 0.35
    conciseness_score = round(
        clamp(
            100 - filler["density"] * 3.0 - filler["bursts"] * 5 - length_penalty,
            0,
            100,
        )
    )

    # "" Score pillars """""""""""""""""""""""""""""""""""""""""""""""""""""""""
    clarity_score = _safe_int(dimensions.get("clarity"), score) * 10
    communication_score = _safe_int(dimensions.get("communication"), score) * 10
    content_score = round(clamp(score * 10 + concept_coverage * 0.15, 0, 100))
    delivery_score = round(
        clamp(
            consistency * 0.45 + conciseness_score * 0.35 + communication_score * 0.20,
            0,
            100,
        )
    )
    communication_flow_score = round(
        clamp(
            clarity_score * 0.4 + consistency * 0.4 + (100 - pause_ratio * 100) * 0.2,
            0,
            100,
        )
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
        "acoustic": {
            # These were always 0 before " now they carry real values
            "rms_mean": round(rms_mean, 6),
            "rms_std": round(rms_std, 6),
            "zcr_mean": round(zcr_mean, 6),
            "zcr_std": round(zcr_std, 6),
            "samples": _safe_int(audio.get("samples"), 0),
            "active_samples": _safe_int(audio.get("active_samples"), 0),
            "silence_ms": _safe_int(audio.get("silence_ms"), 0),
        },
        "confidence_signals": {
            "hedges": hedges,
            "self_corrections": self_corrections,
            "vocal_stability": vocal_stability,
            "decisiveness": decisiveness,
            "score": confidence_score,
            "energy_level": round(clamp(rms_mean / 0.05, 0.0, 1.0) * 100),
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


# """""""""""""""""""""""""""""""""""""""""""""
# UTILITIES
# """""""""""""""""""""""""""""""""""""""""""""

def safe_json_parse(text: str) -> dict:
    """
    Robust JSON extraction " tries three strategies before raising.
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

# "" Slightly warmer for the reference answer " we want natural language ""
llm_ref = ChatOpenAI(model="gpt-4.1", temperature=0.3, api_key=settings.OPENAI_API_KEY)


def _safe_json(text: str) -> dict:
    """Robust JSON parsing."""
    import json

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

def get_candidate_name(resume_chunks: List[str]) -> str:
    if not resume_chunks:
        return "the candidate"
    first_chunk = resume_chunks[0][:300]
    lines = [l.strip() for l in first_chunk.splitlines() if l.strip()]
    return lines[0] if lines else "the candidate"


def is_human_round(interview_type: str) -> bool:
    return (interview_type or "").strip().lower() in HUMAN_INTERVIEW_TYPES


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
    tokens = [
        token for token in cleaned.split() if len(token) > 2 and token not in stop
    ]
    return " ".join(tokens[:4]).strip()


def _extract_memory_focuses(raw_memories: List[Any]) -> List[str]:
    focuses: List[str] = []
    for memory in raw_memories:
        text = (
            memory.get("memory", str(memory))
            if isinstance(memory, dict)
            else str(memory)
        )
        segments = re.split(r"[.;\n]", text)
        for segment in segments:
            lowered = segment.lower()
            if any(
                marker in lowered
                for marker in (
                    "gap",
                    "weak",
                    "struggle",
                    "practice",
                    "improve",
                    "missed",
                )
            ):
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


# """""""""""""""""""""""""""""""""""""""""""""
# DESCRIPTION / CONFIG PARSING
# """""""""""""""""""""""""""""""""""""""""""""

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


# """""""""""""""""""""""""""""""""""""""""""""
# DIFFICULTY CONFIG
# """""""""""""""""""""""""""""""""""""""""""""

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
MISSING_CONCEPT_CAPS = {"intro": 9, "easy": 3, "medium": 5, "hard": 6}

# Absolute max scores per difficulty (a perfect answer on an easy question
# cannot score the same as a perfect answer on a hard one)
DIFFICULTY_MAX_SCORES = {"intro": 9, "easy": 7, "medium": 8, "hard": 10}


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


# """""""""""""""""""""""""""""""""""""""""""""
# DIFFICULTY INSTRUCTIONS (question generation)
# """""""""""""""""""""""""""""""""""""""""""""

DIFFICULTY_INSTRUCTIONS_TECHNICAL = {
    "intro": (
        "Opening question only. Ask the candidate to briefly introduce themselves " "
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
        "Ask a challenging, nuanced question " system design, deep architecture trade-offs, "
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


# """""""""""""""""""""""""""""""""""""""""""""
# PSYCHOLOGICAL AWARENESS LAYER
# (kept for live UX " does NOT affect scoring)
# """""""""""""""""""""""""""""""""""""""""""""

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

def compute_gap_analysis(history: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Deterministic gap analysis from stored interview history.
    Returns:
        repeated_gaps   " concepts missed in 2+ questions (systemic weakness)
        all_gaps        " every unique missing concept
        gap_frequency   " concept ' count
        weak_dimensions " average dimension score < 5 across all questions
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

    # Dimensions where average < 5 " systemic weakness
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


# """""""""""""""""""""""""""""""""""""""""""""
# SOCKET HANDLERS (PATCHES 3 & 4)
# """""""""""""""""""""""""""""""""""""""""""""

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
    PATCH 7 & 8: STEP 1 " pure deterministic computation.
    No LLM involved. Returns a structured facts dict that the LLM
    in step 2 will narrate (but cannot contradict or invent).

    Now includes interruption penalty calculation.
    """
    if not history:
        return {}

    # "" Score aggregation """"""""""""""""""""""""""""""""""""""""""""""""""
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

    # "" PATCH 7: Interruption penalty """"""""""""""""""""""""""""""""""""""
    FREE_INTERRUPTIONS = 1  # first one is forgiven
    PENALTY_PER_EXTRA = 0.1  # 0.1 off the 0-10 weighted avg per excess interruption
    MAX_PENALTY = 1.0  # never deduct more than 1 full point (10 on 100-pt scale)

    excess = max(0, interruption_count - FREE_INTERRUPTIONS)
    int_penalty = min(MAX_PENALTY, excess * PENALTY_PER_EXTRA)
    weighted_avg = round(max(0.0, weighted_avg - int_penalty), 2)
    overall_100 = round(weighted_avg * 10)

    # "" Recommendation (hard rule " no LLM) """""""""""""""""""""""""""""""
    if weighted_avg >= 8.0:
        recommendation = "Strong Hire"
    elif weighted_avg >= 6.5:
        recommendation = "Hire"
    elif weighted_avg >= 5.0:
        recommendation = "Needs More Evaluation"
    else:
        recommendation = "No Hire"

    # "" Aggregated strengths / weaknesses """""""""""""""""""""""""""""""""
    all_strengths: List[str] = []
    all_weaknesses: List[str] = []

    for h in history:
        all_strengths.extend(h.get("strengths", []))
        all_weaknesses.extend(h.get("weaknesses", []))

    strength_counts = Counter(all_strengths)
    weakness_counts = Counter(all_weaknesses)
    top_strengths = [s for s, _ in strength_counts.most_common(5)]
    top_weaknesses = [w for w, _ in weakness_counts.most_common(5)]

    # "" Gap analysis """""""""""""""""""""""""""""""""""""""""""""""""""""""
    gap_data = compute_gap_analysis(history)

    # "" Dimension averages """""""""""""""""""""""""""""""""""""""""""""""""
    dimension_totals: Dict[str, List[float]] = {}
    for h in history:
        for dim, val in (h.get("dimensions") or {}).items():
            dimension_totals.setdefault(dim, []).append(float(val))

    dim_averages = {
        dim: round(sum(vals) / len(vals), 1) for dim, vals in dimension_totals.items()
    }

    # "" Per-question score summary """""""""""""""""""""""""""""""""""""""""
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
        self_correction_counts.append(
            _safe_int(confidence_signals.get("self_corrections"))
        )
        vocal_stability_values.append(
            _safe_int(confidence_signals.get("vocal_stability"))
        )
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
                "score": round(float(h.get("score", 0)) * 10),  # 0"100
                "difficulty": h.get("difficulty", "unknown"),
                "question": h.get("question", ""),
                "user_answer": h.get("user_answer") or h.get("answer", ""),
                "expected_answer": h.get("expected_answer", {}),
                "reference_answer": h.get("reference_answer", ""),
                "verdict": h.get("verdict", ""),
                "dimensions": h.get("dimensions", {}),          #  ADD THIS LINE
                "analytics": h.get("answer_analytics", {}),
                "score_pillars": h.get("score_pillars", {}),
                "missing_concepts": h.get("missing_concepts", []),
                "strengths": h.get("strengths", []),
                "weaknesses": h.get("weaknesses", []),
                "timestamp": h.get("timestamp", 0),
            }
            for i, h in enumerate(history)
        ]
    # "" Skill dimension scores (deterministic from dim_averages) """""""""""
    skill_dimensions = get_skill_dimensions(interview_type)
    # Map LLM dimension keys ' display skill names (best-effort)
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
    avg_coverage = (
        round(
            sum(point["coverage_score"] for point in coverage_trend)
            / len(coverage_trend)
        )
        if coverage_trend
        else 0
    )

    midpoint = max(1, len(raw_scores) // 2)
    first_half = raw_scores[:midpoint]
    second_half = raw_scores[midpoint:] or raw_scores
    recovery_score = round(
        clamp(
            50
            + (sum(second_half) / len(second_half) - sum(first_half) / len(first_half))
            * 14
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
            (
                (sum(hard_scores) / len(hard_scores))
                if hard_scores
                else overall_100 * 0.85 - max(0, interruption_count - 1) * 4
            ),
            0,
            100,
        )
    )
    overall_conciseness = (
        round(sum(conciseness_values) / len(conciseness_values))
        if conciseness_values
        else 0
    )

    filler_summary = {
        "total_count": sum(filler_counts),
        "average_density": (
            round(sum(filler_densities) / len(filler_densities), 2)
            if filler_densities
            else 0.0
        ),
        "max_bursts": max(filler_bursts) if filler_bursts else 0,
        "strictness": (
            "high"
            if (
                sum(filler_counts) >= 8
                or (sum(filler_densities) / max(len(filler_densities), 1)) >= 6
            )
            else "normal"
        ),
    }
    flow_summary = {
        "avg_wpm": round(sum(wpm_values) / len(wpm_values), 1) if wpm_values else 0.0,
        "avg_pause_ratio": (
            round(sum(pause_ratios) / len(pause_ratios), 3) if pause_ratios else 0.0
        ),
        "long_pauses": sum(long_pause_values),
        "avg_latency_ms": round(sum(latencies) / len(latencies)) if latencies else 0,
        "consistency": (
            round(sum(consistency_values) / len(consistency_values))
            if consistency_values
            else 0
        ),
    }
    confidence_summary = {
        "avg_score": (
            round(sum(confidence_scores) / len(confidence_scores))
            if confidence_scores
            else 0
        ),
        "hedges": sum(hedge_counts),
        "self_corrections": sum(self_correction_counts),
        "avg_vocal_stability": (
            round(sum(vocal_stability_values) / len(vocal_stability_values))
            if vocal_stability_values
            else 0
        ),
        "avg_decisiveness": (
            round(sum(decisiveness_values) / len(decisiveness_values))
            if decisiveness_values
            else 0
        ),
    }

    coaching_priorities: List[str] = []
    if avg_coverage < 70:
        coaching_priorities.append(
            "Lead with the core concept first and cover missing fundamentals before adding detail."
        )
    if filler_summary["average_density"] >= 5 or filler_summary["total_count"] >= 8:
        coaching_priorities.append(
            "Cut filler words aggressively. Pause silently instead of using 'um', 'like', or 'you know'."
        )
    if confidence_summary["avg_score"] < 60:
        coaching_priorities.append(
            "Sound more decisive. Replace hedged phrasing with direct statements and fewer self-corrections."
        )
    if flow_summary["avg_pause_ratio"] > 0.18 or flow_summary["avg_latency_ms"] > 2200:
        coaching_priorities.append(
            "Reduce dead air. Start with a structured first sentence within two seconds of the question ending."
        )
    if overall_conciseness < 65:
        coaching_priorities.append(
            "Tighten your answers. Use one clean structure instead of circling the same point."
        )
    if (
        is_human_round(interview_type)
        and star_values
        and round(sum(star_values) / len(star_values)) < 75
    ):
        coaching_priorities.append(
            "Use STAR more strictly. Make the action and measurable result impossible to miss."
        )
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

def _publish_budget_exceeded(interview_id: str | None, model_name: str) -> None:
    if not interview_id:
        return
    _publish_event(
        f"interview:{interview_id}:events",
        {
            "type": "budget_exceeded",
            "error": "BUDGET_EXCEEDED",
            "model": model_name,
            "message": "Daily interview limit reached. Resets at midnight.",
        },
    )


def _invoke_chat_model(
    *,
    llm_client: ChatOpenAI,
    prompt: str,
    user_id: str,
    model_name: str,
    interview_id: str | None = None,
) -> Any:
    check_budget(user_id, model_name)
    try:
        response = llm_client.invoke([HumanMessage(content=prompt)])
    except BudgetExceededError:
        _publish_budget_exceeded(interview_id, model_name)
        raise

    used_tokens = extract_total_tokens(
        response,
        estimate_tokens(prompt, getattr(response, "content", "")),
    )
    increment_usage(user_id, model_name, used_tokens)
    return response


def publish_event(channel: str, payload: dict) -> None:
    client.publish(channel, json.dumps(payload))


def _publish_event(channel: str, payload: dict) -> None:
    client.publish(channel, json.dumps(payload))


def _is_terminated(state: InterviewState) -> bool:
    return bool(state.get("timeout", False))


def _build_supportive_response(
    last_question: str,
    last_answer: str,
    consecutive_struggles: int,
    difficulty: str,
    interview_type: str,
    candidate_name: str,
    user_id: str,
    llm_client: ChatOpenAI,
    invoke_chat_model,
    interview_id: str | None = None,
) -> str:
    """
    Live interview support " separate from scoring.
    This helps the candidate think; it does NOT inflate their score.
    """
    human_round = is_human_round(interview_type)
    is_pivot = consecutive_struggles >= _PIVOT_THRESHOLD

    scaffold_hint = (
        "Ask them to recall any situation " even a small or informal one " "
        "that relates to the theme of the original question."
        if human_round
        else "Break the question into a simpler sub-concept, or invite them to reason "
        "through a general approach even without the exact answer."
    )

    pivot_note = (
        (
            "\nThis is their 3rd consecutive struggle. "
            "Acknowledge the difficulty, say you'll move on " do NOT ask another question yet."
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
        f"3. {'Move on " do NOT ask another question.' if is_pivot else scaffold_hint}\n\n"
        "Output ONLY what the interviewer says. No labels."
    )

    try:
        return invoke_chat_model(
            llm_client=llm_client,
            prompt=prompt,
            user_id=user_id,
            model_name=CHAT_MODEL_NAME,
            interview_id=interview_id,
        ).content.strip()
    except BudgetExceededError:
        raise
    except Exception as e:
        print(f"[_build_supportive_response] LLM error: {e}")
        if is_pivot:
            return (
                f"That's a tough area " completely fine. "
                "Let's shift gears and move on to something else."
            )
        return (
            "Take your time " even a rough first thought is useful. "
            "What comes to mind first when you approach this?"
        )


# """""""""""""""""""""""""""""""""""""""""""""
# GAP ANALYSIS ENGINE
# """""""""""""""""""""""""""""""""""""""""""""


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

    # This is what wait_for_answer already checks " setting it here is the
    # CORRECT way to break out of the blocking poll loop in NODE 4.
    client.set(end_key, "1", ex=60 * 60 * 24)
    client.set(reason_key, reason, ex=60 * 60 * 24)
    client.set(dur_key, str(duration_sec), ex=60 * 60 * 24)

    print(
        f"[end_event] interview={interview_id} reason={reason} duration={duration_sec}s"
    )


# """""""""""""""""""""""""""""""""""""""""""""
# NODE 1: LOAD CONTEXT
# """""""""""""""""""""""""""""""""""""""""""""



