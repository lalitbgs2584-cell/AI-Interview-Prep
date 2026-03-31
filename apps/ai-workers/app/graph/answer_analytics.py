import re
from typing import Any, Dict, List


FILLER_PATTERNS = [
    r"\bum\b",
    r"\buh\b",
    r"\blike\b",
    r"\byou know\b",
]
HEDGE_PATTERNS = [
    r"\bmaybe\b",
    r"\bi think\b",
    r"\bprobably\b",
    r"\bi guess\b",
    r"\bperhaps\b",
    r"\bkind of\b",
    r"\bsort of\b",
    r"\bnot sure\b",
]
SELF_CORRECTION_PATTERNS = [
    r"\bi mean\b",
    r"\blet me rephrase\b",
    r"\bsorry\b",
    r"\bactually\b",
    r"\bwait\b",
]
STAR_PATTERNS = {
    "situation": [r"\bsituation\b", r"\bcontext\b", r"\bwhen\b", r"\bat my previous\b"],
    "task": [r"\btask\b", r"\bgoal\b", r"\bobjective\b", r"\bresponsible\b"],
    "action": [r"\bi did\b", r"\bi implemented\b", r"\bi led\b", r"\baction\b"],
    "result": [r"\bresult\b", r"\boutcome\b", r"\bimpact\b", r"\bincreased\b", r"\breduced\b"],
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _word_count(text: str) -> int:
    return len(re.findall(r"\b[\w']+\b", text or ""))


def _count_patterns(text: str, patterns: List[str]) -> int:
    if not text:
        return 0
    lower = text.lower()
    total = 0
    for pat in patterns:
        total += len(re.findall(pat, lower))
    return total


def _mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _star_completeness(text: str) -> Dict[str, Any]:
    lower = (text or "").lower()
    flags = {}
    for key, pats in STAR_PATTERNS.items():
        flags[key] = any(re.search(p, lower) for p in pats)
    completed = sum(1 for v in flags.values() if v)
    pct = round((completed / 4.0) * 100.0, 1)
    return {"flags": flags, "completed_parts": completed, "completeness_pct": pct}


def _conciseness_score(
    word_count: int,
    filler_density: float,
    missing_concept_count: int,
) -> int:
    if word_count <= 0:
        return 0
    score = 100.0
    if word_count < 20:
        score -= 18.0
    if word_count > 220:
        score -= min(28.0, (word_count - 220) * 0.2)
    score -= min(25.0, filler_density * 2.2)
    score -= min(20.0, missing_concept_count * 3.5)
    return round(_clamp(score, 0.0, 100.0))


def compute_answer_analytics(
    answer_text: str,
    response_analytics: Dict[str, Any],
    dimensions: Dict[str, Any],
    base_score: int,
    missing_concepts: List[str],
    interview_type: str = "technical",
) -> Dict[str, Any]:
    speech = response_analytics.get("speech", {}) if isinstance(response_analytics, dict) else {}
    audio = response_analytics.get("audio", {}) if isinstance(response_analytics, dict) else {}

    words = int(speech.get("word_count") or _word_count(answer_text))
    fillers = _count_patterns(answer_text, FILLER_PATTERNS)
    filler_density = round((fillers * 100.0 / words), 2) if words else 0.0
    filler_bursts = len(
        re.findall(r"\b(?:um|uh|like)\b(?:\s+\b(?:um|uh|like)\b)+", (answer_text or "").lower())
    )

    hedge_count = _count_patterns(answer_text, HEDGE_PATTERNS)
    self_corrections = _count_patterns(answer_text, SELF_CORRECTION_PATTERNS)

    speaking_ms = float(audio.get("speaking_ms") or 0.0)
    silence_ms = float(audio.get("silence_ms") or 0.0)
    duration_ms = max(1.0, speaking_ms + silence_ms)
    pause_ratio = float(audio.get("pause_ratio") or (silence_ms / duration_ms))
    pause_ratio = round(_clamp(pause_ratio, 0.0, 1.0), 3)
    long_pause_count = int(audio.get("long_pause_count") or 0)
    response_latency_ms = int(speech.get("response_latency_ms") or 0)

    wpm = float(speech.get("wpm") or speech.get("words_per_minute") or 0.0)
    if wpm <= 0.0:
        mins = max(0.2, speaking_ms / 60000.0) if speaking_ms > 0 else 1.0
        wpm = words / mins
    wpm = round(wpm, 2)

    rms_std = float(audio.get("rms_std") or 0.0)
    zcr_std = float(audio.get("zcr_std") or 0.0)

    clarity = float(dimensions.get("clarity", 0))
    communication = float(dimensions.get("communication", 0))
    dim_avg = _mean([float(v) for v in dimensions.values()]) if dimensions else float(base_score)

    pace_stability = _clamp(100.0 - abs(wpm - 130.0) * 0.6, 0.0, 100.0)
    vocal_stability = _clamp(100.0 - (rms_std * 120.0 + zcr_std * 140.0), 0.0, 100.0)
    decisiveness = _clamp(
        100.0 - hedge_count * 8.0 - self_corrections * 6.0 - filler_density * 1.5,
        0.0,
        100.0,
    )
    flow_score = _clamp(
        100.0
        - (pause_ratio * 70.0)
        - (long_pause_count * 4.0)
        - (abs(wpm - 130.0) * 0.2)
        - (filler_density * 1.2),
        0.0,
        100.0,
    )

    delivery_score = _clamp(
        (clarity * 10.0) * 0.35
        + (communication * 10.0) * 0.25
        + pace_stability * 0.2
        + (100.0 - pause_ratio * 100.0) * 0.2,
        0.0,
        100.0,
    )
    confidence_score = _clamp(
        decisiveness * 0.45
        + vocal_stability * 0.35
        + max(0.0, 100.0 - max(0, response_latency_ms - 2500) / 100.0) * 0.2,
        0.0,
        100.0,
    )
    content_score = _clamp(
        (base_score * 10.0) * 0.6
        + (dim_avg * 10.0) * 0.4
        - min(20.0, len(missing_concepts) * 3.0),
        0.0,
        100.0,
    )
    communication_flow_score = flow_score

    star = _star_completeness(answer_text)
    conciseness = _conciseness_score(words, filler_density, len(missing_concepts))

    metrics = {
        "filler": {
            "absolute_count": fillers,
            "density_per_100_words": filler_density,
            "bursts": filler_bursts,
        },
        "flow": {
            "words_per_minute": wpm,
            "pause_ratio": pause_ratio,
            "long_pause_count": long_pause_count,
            "response_latency_ms": response_latency_ms,
            "speaking_consistency": round(vocal_stability, 2),
        },
        "confidence": {
            "hedge_count": hedge_count,
            "self_corrections": self_corrections,
            "vocal_stability": round(vocal_stability, 2),
            "decisiveness": round(decisiveness, 2),
            "interrupted_ai": bool(speech.get("interrupted_ai", False)),
            "unfinished_thoughts": len(re.findall(r"\.\.\.|--$", (answer_text or "").strip())),
        },
        "star": star if interview_type in {"behavioral", "hr"} else {"completeness_pct": 0.0, "flags": {}},
        "conciseness_score": conciseness,
    }

    score_pillars = {
        "content_score": round(content_score),
        "delivery_score": round(delivery_score),
        "confidence_score": round(confidence_score),
        "communication_flow_score": round(communication_flow_score),
    }
    return {"metrics": metrics, "score_pillars": score_pillars}


def aggregate_interview_analytics(
    history: List[Dict[str, Any]],
    interruption_count: int,
) -> Dict[str, Any]:
    if not history:
        return {
            "score_pillars": {},
            "filler_summary": {},
            "flow_summary": {},
            "confidence_summary": {},
            "star_completeness": [],
            "concept_coverage_trend": [],
            "recovery_score": 0,
            "pressure_handling_score": 0,
            "conciseness_score": 0,
            "coaching_priorities": [],
        }

    pillar_rows = [h.get("score_pillars", {}) for h in history]
    content_scores = [float(r.get("content_score", 0)) for r in pillar_rows]
    delivery_scores = [float(r.get("delivery_score", 0)) for r in pillar_rows]
    confidence_scores = [float(r.get("confidence_score", 0)) for r in pillar_rows]
    flow_scores = [float(r.get("communication_flow_score", 0)) for r in pillar_rows]

    metrics_rows = [h.get("response_analytics_metrics", {}) for h in history]
    filler_total = sum(int((m.get("filler") or {}).get("absolute_count", 0)) for m in metrics_rows)
    filler_density_avg = _mean(
        [float((m.get("filler") or {}).get("density_per_100_words", 0.0)) for m in metrics_rows]
    )
    burst_total = sum(int((m.get("filler") or {}).get("bursts", 0)) for m in metrics_rows)

    avg_wpm = _mean([float((m.get("flow") or {}).get("words_per_minute", 0.0)) for m in metrics_rows])
    avg_pause = _mean([float((m.get("flow") or {}).get("pause_ratio", 0.0)) for m in metrics_rows])
    long_pause_total = sum(int((m.get("flow") or {}).get("long_pause_count", 0)) for m in metrics_rows)
    avg_latency = _mean(
        [float((m.get("flow") or {}).get("response_latency_ms", 0.0)) for m in metrics_rows]
    )

    hedge_total = sum(int((m.get("confidence") or {}).get("hedge_count", 0)) for m in metrics_rows)
    correction_total = sum(int((m.get("confidence") or {}).get("self_corrections", 0)) for m in metrics_rows)
    avg_vocal_stability = _mean(
        [float((m.get("confidence") or {}).get("vocal_stability", 0.0)) for m in metrics_rows]
    )

    star_completeness = []
    for idx, m in enumerate(metrics_rows, start=1):
        star = m.get("star", {})
        pct = float(star.get("completeness_pct", 0.0))
        if pct > 0:
            star_completeness.append({"index": idx, "completeness_pct": pct})

    concept_coverage_trend = []
    for idx, row in enumerate(history, start=1):
        expected = row.get("expected_answer", {}) if isinstance(row.get("expected_answer"), dict) else {}
        expected_count = len(expected.get("key_concepts", []) or [])
        missing_count = len(row.get("missing_concepts", []) or [])
        if expected_count > 0:
            coverage = round(max(0.0, ((expected_count - missing_count) / expected_count) * 100.0), 1)
        else:
            coverage = round(min(100.0, float(row.get("score", 0)) * 10.0), 1)
        concept_coverage_trend.append(
            {"index": idx, "coverage_pct": coverage, "missing_count": missing_count}
        )

    score_series = [float(h.get("score", 0)) * 10.0 for h in history]
    split = max(1, len(score_series) // 3)
    start_avg = _mean(score_series[:split])
    end_avg = _mean(score_series[-split:])
    recovery_score = round(_clamp(50.0 + (end_avg - start_avg) * 2.0, 0.0, 100.0))

    hard_scores = [
        float(h.get("score", 0)) * 10.0
        for h in history
        if str(h.get("difficulty", "")).lower() == "hard"
    ]
    hard_avg = _mean(hard_scores) if hard_scores else _mean(score_series)
    pressure_handling = _clamp(
        hard_avg * 0.7 + _mean(flow_scores) * 0.3 - max(0.0, (interruption_count - 1) * 4.0),
        0.0,
        100.0,
    )

    conciseness_score = round(
        _mean([float(m.get("conciseness_score", 0.0)) for m in metrics_rows]),
    )

    pillar_summary = {
        "content_score": round(_mean(content_scores)),
        "delivery_score": round(_mean(delivery_scores)),
        "confidence_score": round(_mean(confidence_scores)),
        "communication_flow_score": round(_mean(flow_scores)),
    }

    priorities = []
    if pillar_summary["content_score"] < 65:
        priorities.append("Reinforce core concept-to-example mapping with focused recap drills.")
    if pillar_summary["delivery_score"] < 65:
        priorities.append("Practice timed responses at steady pace with deliberate sentence boundaries.")
    if pillar_summary["confidence_score"] < 65:
        priorities.append("Replace hedging with direct claims supported by one concrete proof point.")
    if pillar_summary["communication_flow_score"] < 65:
        priorities.append("Use a fixed 3-part answer frame: premise, approach, trade-off.")

    recurring = [str(g) for g, n in _collect_gap_frequency(history).items() if n >= 2][:2]
    if recurring:
        priorities.append(f"Revise recurring weak concepts: {', '.join(recurring)}.")

    if not priorities:
        priorities.append("Keep current structure and raise depth with one advanced trade-off per answer.")

    return {
        "score_pillars": pillar_summary,
        "filler_summary": {
            "absolute_fillers": filler_total,
            "avg_density_per_100_words": round(filler_density_avg, 2),
            "filler_bursts": burst_total,
        },
        "flow_summary": {
            "avg_words_per_minute": round(avg_wpm, 2),
            "avg_pause_ratio": round(avg_pause, 3),
            "long_pause_count": long_pause_total,
            "avg_response_latency_ms": round(avg_latency),
        },
        "confidence_summary": {
            "hedges": hedge_total,
            "self_corrections": correction_total,
            "avg_vocal_stability": round(avg_vocal_stability, 2),
        },
        "star_completeness": star_completeness,
        "concept_coverage_trend": concept_coverage_trend,
        "recovery_score": recovery_score,
        "pressure_handling_score": round(pressure_handling),
        "conciseness_score": conciseness_score,
        "coaching_priorities": priorities[:3],
    }


def _collect_gap_frequency(history: List[Dict[str, Any]]) -> Dict[str, int]:
    freq: Dict[str, int] = {}
    for row in history:
        for concept in row.get("missing_concepts", []) or []:
            key = str(concept).strip().lower()
            if not key:
                continue
            freq[key] = freq.get(key, 0) + 1
    return freq
