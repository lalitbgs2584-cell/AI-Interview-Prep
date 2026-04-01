from langgraph.graph import StateGraph, END

from app.graph.state.interview_creation_state import InterviewState
from app.graph.nodes.interview_creation_node import (
    load_context,
    generate_question,
    publish_question,
    wait_for_answer,
    evaluate_answer,
    store_step,
    check_continue,
    finalize,
)
from app.graph.nodes.interview_creation_node import (
    classify_answer_intent,
    generate_reference_answer,
    route_after_intent,
)


# ─────────────────────────────────────────────
# ROUTER 1: after store_step
# If evaluate_answer flagged a followup AND
# we have a followup question → ask it
# Otherwise → check if we should continue
# ─────────────────────────────────────────────


def followup_router(state: InterviewState) -> str:
    followup = state.get("followup", False)
    followup_question = state.get("followup_question", "")
    timed_out = state.get("timeout", False)

    if followup and followup_question and not timed_out:
        print("[followup_router] → followup")
        return "followup"

    print("[followup_router] → check")
    return "check"


# ─────────────────────────────────────────────
# ROUTER 2: after check_continue
# If interview_complete → finalize
# Otherwise → generate next question
# ─────────────────────────────────────────────


def continue_router(state: InterviewState) -> str:
    if state.get("interview_complete"):
        print("[continue_router] → end")
        return "end"
    print("[continue_router] → generate")
    return "generate"


# ─────────────────────────────────────────────
# ROUTER 3 (NEW): after classify_answer_intent
# Delegates to route_after_intent from answer_intent.py
#
# ANSWER       → evaluate_answer   (normal scoring path)
# META_REQUEST → wait_for_answer   (reply published, loop back)
# QUESTION     → wait_for_answer   (clarification given, loop back)
# SKIP         → generate_question (advance to next question)
# ─────────────────────────────────────────────

# route_after_intent is imported directly from answer_intent.py —
# no wrapper needed, it already reads state["intent"] and returns
# the correct node name string.


# ─────────────────────────────────────────────
# GRAPH BUILDER
# ─────────────────────────────────────────────


def build_interview_graph():
    graph = StateGraph(InterviewState)

    # ── Register all nodes ────────────────────
    graph.add_node("load_context", load_context)
    graph.add_node("generate_question", generate_question)
    graph.add_node(
        "generate_reference_answer", generate_reference_answer
    )  # NEW (NODE B)
    graph.add_node("publish_question", publish_question)
    graph.add_node("wait_for_answer", wait_for_answer)
    graph.add_node("classify_answer_intent", classify_answer_intent)  # NEW (NODE A)
    graph.add_node("evaluate_answer", evaluate_answer)
    graph.add_node("store_step", store_step)
    graph.add_node("check_continue", check_continue)
    graph.add_node("finalize", finalize)

    # ── Entry point ───────────────────────────
    graph.set_entry_point("load_context")

    # ── Main linear flow ──────────────────────

    graph.add_edge("load_context", "generate_question")

    # NODE B slots in between generate_question and publish_question
    # It generates the model reference answer while the question is hot in state
    graph.add_edge("generate_question", "generate_reference_answer")  # NEW
    graph.add_edge("generate_reference_answer", "publish_question")  # NEW
    # (replaces the old direct edge: generate_question → publish_question)

    graph.add_edge("publish_question", "wait_for_answer")

    # NODE A slots in between wait_for_answer and evaluate_answer
    # It classifies intent before scoring — non-answers never reach evaluate_answer
    graph.add_edge("wait_for_answer", "classify_answer_intent")  # NEW
    # (replaces the old direct edge: wait_for_answer → evaluate_answer)

    # NODE A conditional exit — three possible next nodes
    graph.add_conditional_edges(
        "classify_answer_intent",
        route_after_intent,
        {
            "evaluate_answer": "evaluate_answer",  # ANSWER  → score it
            "wait_for_answer": "wait_for_answer",  # META/Q  → loop back
            "generate_question": "generate_question",  # SKIP   → next question
        },
    )

    graph.add_edge("evaluate_answer", "store_step")

    # ── After store_step: followup or continue ─
    graph.add_conditional_edges(
        "store_step",
        followup_router,
        {
            "followup": "publish_question",
            "check": "check_continue",
        },
    )

    # ── After check_continue: next Q or done ──
    graph.add_conditional_edges(
        "check_continue",
        continue_router,
        {
            "generate": "generate_question",
            "end": "finalize",
        },
    )

    # ── Terminal edge ─────────────────────────
    graph.add_edge("finalize", END)

    return graph.compile()
