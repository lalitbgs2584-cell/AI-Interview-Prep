from typing import List, Dict, Optional, Any
from typing_extensions import TypedDict


class ExpectedAnswer(TypedDict, total=False):
    key_concepts:     List[str]   # must-hit concepts to score above 6
    reasoning_steps:  List[str]   # ideal thinking path
    ideal_structure:  str         # how a great answer is organised
    common_mistakes:  List[str]   # traps that reveal shallow knowledge


class EvalDimensions(TypedDict, total=False):
    correctness:   int   # 0-10
    depth:         int   # 0-10
    clarity:       int   # 0-10
    communication: int   # 0-10


class InterviewState(TypedDict, total=False):
    # ─── Core interview info ───────────────────────────────────────────────
    interview_id:   str
    user_id:        str
    role:           str
    interview_type: str
    description:    Optional[str]

    # ─── Context retrieval ────────────────────────────────────────────────
    resume_context: List[str]
    skills:         List[str]
    memories:       List[Dict[str, Any]]
    candidate_name: str

    # ─── Question flow ────────────────────────────────────────────────────
    current_index:    int
    current_question: str
    question_history: List[Dict[str, Any]]
    difficulty:       str

    # expected answer generated alongside the question
    expected_answer: ExpectedAnswer

    # ─── User response ────────────────────────────────────────────────────
    user_answer: str
    timeout:     bool

    # ─── Evaluation (rich structured) ────────────────────────────────────
    score:             float
    confidence:        float
    feedback:          str           # backward compat alias for verdict
    dimensions:        EvalDimensions
    missing_concepts:  List[str]
    incorrect_points:  List[str]
    strengths:         List[str]
    weaknesses:        List[str]
    verdict:           str           # 1-line brutally honest summary
    followup:          bool
    followup_question: str

    # ─── Gap analysis (accumulated across all questions) ──────────────────
    gap_tracker: Dict[str, int]   # concept/skill -> miss count

    # ─── Interview flow control ───────────────────────────────────────────
    interview_complete:    bool
    start_time:            int
    consecutive_struggles: int
    is_support_turn:       bool

    # ─── Final summary ────────────────────────────────────────────────────
    summary: Dict[str, Any]
