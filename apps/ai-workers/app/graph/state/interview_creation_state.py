from typing import List, Dict, Optional, Any
from typing_extensions import TypedDict


class ExpectedAnswer(TypedDict, total=False):
    """Schema for the expected answer generated alongside each question."""
    key_concepts:     List[str]   # must-hit concepts to score above 6
    reasoning_steps:  List[str]   # ideal thinking path
    ideal_structure:  str         # how a great answer is organised
    common_mistakes:  List[str]   # traps that reveal shallow knowledge


class EvalDimensions(TypedDict, total=False):
    """Evaluation dimensional breakdown — varies by interview type."""
    correctness:   int   # 0-10 (technical) or unused (behavioral)
    depth:         int   # 0-10 (technical) or unused (behavioral)
    clarity:       int   # 0-10 (both)
    communication: int   # 0-10 (both)
    # Behavioral additions (populated by evaluate_answer for HR interviews)
    star_structure:  int   # 0-10 (behavioral)
    self_awareness:  int   # 0-10 (behavioral)


class InterviewState(TypedDict, total=False):
    """
    LangGraph state for the interview flow.
    
    TYPE SAFETY:
    - Keys marked as required (not total=False) MUST be initialized in load_context().
    - Optional keys may be empty/missing until their node sets them.
    - All list/dict defaults must be [] / {} to avoid None errors.
    
    FLOW:
    1. load_context() — initializes user context, resume, skills, memories
    2. generate_question() — produces current_question + expected_answer
    3. publish_question() — emits the question to frontend
    4. wait_for_answer() — blocks until user_answer is set
    5. evaluate_answer() — scores + dimensional breakdown
    6. store_step() — persists to Redis
    7. check_continue() — decides if interview_complete
    8. finalize() — computes deterministic summary + LLM narration
    """

    # ─── Core interview metadata ───────────────────────────────────────────
    interview_id:   str              # Redis key prefix
    user_id:        str              # Candidate's user ID
    role:           str              # e.g. "Software Engineer"
    interview_type: str              # "technical" | "behavioral" | "hr"
    description:    Optional[str]    # Custom instructions / topics

    # ─── Context retrieval (populated by load_context) ────────────────────
    resume_context: List[str]        # Qdrant resume chunks
    skills:         List[str]        # Neo4j skills graph
    memories:       List[Dict[str, Any]]  # Mem0 past sessions
    candidate_name: str              # Extracted from resume

    # ─── Question generation flow ─────────────────────────────────────────
    current_index:    int            # 0-indexed question number
    current_question: str            # The question being asked
    question_history: List[Dict[str, Any]]  # All prior Q&A entries (structured)
    difficulty:       str            # "intro" | "easy" | "medium" | "hard"

    # ── Expected answer (generated alongside question, used for evaluation) ──
    expected_answer: ExpectedAnswer  # Key concepts, reasoning, structure, common mistakes

    # ─── User response ────────────────────────────────────────────────────
    user_answer: str                 # Candidate's actual response
    timeout:     bool                # True if wait_for_answer timed out

    # ─── Evaluation results (set by evaluate_answer, used by store_step) ───
    score:             int            # 0-10, deterministically capped by difficulty
    confidence:        float          # 0.0-1.0 (LLM's confidence in the score)
    feedback:          str            # Backward compat alias for verdict
    dimensions:        EvalDimensions # Multi-dimensional breakdown
    missing_concepts:  List[str]      # Key concepts absent from the answer
    incorrect_points:  List[str]      # Factual errors or misconceptions
    strengths:         List[str]      # Specific things done well
    weaknesses:        List[str]      # Specific gaps — names the missing concept
    verdict:           str            # 1-line brutally honest summary
    followup:          bool           # True if a follow-up question would help
    followup_question: str            # The follow-up question text (if followup=True)

    # ─── Gap analysis (accumulated, used by finalize) ─────────────────────
    gap_map: Dict[str, int]          # concept -> miss count (for repeated gaps)

    # ─── Interview flow control ───────────────────────────────────────────
    interview_complete:    bool       # True when check_continue says to stop
    start_time:            int        # Unix timestamp (seconds) when load_context ran
    consecutive_struggles: int        # Increments on uncertain answers; resets after pivot
    is_support_turn:       bool       # True during scaffolding — don't score
    followup:              bool       # Alias: true if this is a follow-up answer turn

    # ─── Behavioural integrity fields (NEW PATCHES) ───────────────────────
    interruption_count:    int        # Times user spoke over the AI
    end_reason:            str        # 'completed' | 'user_ended' | 'fullscreen' | 'tab_switch' | 'face_violation'
    session_duration_sec:  int        # How long the session ran

    # ─── Final summary (set by finalize, sent to frontend) ──────────────────
    summary: Dict[str, Any]          # Full report: scores, recommendations, feedback