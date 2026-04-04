"""Interview creation graph nodes and orchestration logic."""

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
from app.core.token_budget import (
    BudgetExceededError,
    check_budget,
    estimate_tokens,
    extract_total_tokens,
    increment_usage,
)
from app.graph.state.interview_creation_state import InterviewState
from app.core.mem0 import memory_client

from app.graph.nodes.interview_creation_helpers import (
    BEHAVIORAL_FALLBACKS,
    CHAT_MODEL_NAME,
    _PIVOT_THRESHOLD,
    _build_supportive_response,
    _compute_deterministic_summary,
    _invoke_chat_model,
    _is_terminated,
    _publish_event,
    _contains_abusive_language,
    _contains_non_english_script,
    _derive_answer_analytics,
    _extract_answer_payload,
    _extract_covered_topics,
    _extract_memory_focuses,
    _is_non_answer,
    _is_uncertain,
    _safe_float,
    _safe_int,
    _safe_json,
    _tokenize_words,
    apply_difficulty_scoring_cap,
    get_candidate_name,
    get_difficulty_instruction,
    is_human_round,
    parse_custom_config,
    resolve_difficulty,
    resolve_max_questions,
    handle_end_event,
    handle_interruption_event,
    publish_event,
    safe_json_parse,
    strip_custom_config,
)


# Shared clients used across the interview pipeline.

qdrant = QdrantClient(url=settings.QDRANT_URI)

neo4j_driver = GraphDatabase.driver(
    settings.NEO4J_URI,
    auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
)

# Use a bit of variance when generating new questions.
llm = ChatOpenAI(model="gpt-4.1", temperature=0.7, api_key=settings.OPENAI_API_KEY)
llm_ref = ChatOpenAI(model="gpt-4.1", temperature=0.0, api_key=settings.OPENAI_API_KEY)
# Keep answer evaluation consistent across runs.
llm_eval = ChatOpenAI(model="gpt-4.1", temperature=0.0, api_key=settings.OPENAI_API_KEY)

# Keep summary narration grounded in computed facts.
llm_summary = ChatOpenAI(
    model="gpt-4.1", temperature=0.0, api_key=settings.OPENAI_API_KEY
)

embeddings = OpenAIEmbeddings(
    model="text-embedding-3-small", api_key=settings.OPENAI_API_KEY
)

QDRANT_COLLECTION = "resumes"
def load_context(state: InterviewState) -> dict:
    """Load resume context and session settings for an interview run."""
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

    # Qdrant " resume chunks
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

    # Neo4j " skills graph
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

    # Mem0 " past interview memories
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
        # "" PATCH 2: Initialize new integrity fields """"""""""""""""""""""
        "interruption_count": 0,
        "end_reason": "user_ended",
        "session_duration_sec": 0,
    }


# """""""""""""""""""""""""""""""""""""""""""""
# NODE 2: GENERATE QUESTION  (+ expected answer)
# """""""""""""""""""""""""""""""""""""""""""""


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
        print("[generate_question] >" Terminated " skipping")
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

    # "" PSYCHOLOGICAL CHECK """"""""""""""""""""""""""""""""""""""""""""""""
    last_question = question_history[-1].get("question", "") if question_history else ""

    if index > 0 and _is_uncertain(last_answer):
        new_struggles = consecutive_struggles + 1
        print(
            f"[generate_question]    Uncertainty detected " struggle #{new_struggles}"
        )

        supportive_text = _build_supportive_response(
            last_question=last_question,
            last_answer=last_answer,
            consecutive_struggles=new_struggles,
            difficulty=state.get("difficulty", "medium"),
            interview_type=interview_type,
            candidate_name=candidate_name,
            user_id=state["user_id"],
            llm_client=llm,
            invoke_chat_model=_invoke_chat_model,
            interview_id=state.get("interview_id"),
        )
        is_pivot = new_struggles >= _PIVOT_THRESHOLD
        print(
            f"[generate_question] {'Pivoting' if is_pivot else 'Scaffolding'}: {supportive_text[:80]}"
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

    # "" NORMAL QUESTION GENERATION """"""""""""""""""""""""""""""""""""""""
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

    # "" Build prompt " returns JSON with question + expected_answer """""""""
    if human_round:
        system_prompt = f"""You are a strict {interview_type.upper()} interviewer for a {role} position.

Candidate: {candidate_name}
Resume (background only " NO technical questions):
\"\"\"{resume_text[:1500]}\"\"\"

Memories: {memories_text[:400]}
{extra_context_block}
{memory_focus_block}
{covered_topics_block}
{adaptive_instruction_block}
Previous questions (do NOT repeat themes): {prev_qa_summary or "None yet."}

TASK " Question #{index + 1} of {max_questions} | {difficulty.upper()}
{difficulty_instruction}

ABSOLUTE RULES:
1. ZERO technical content " no code, algorithms, systems, APIs, frameworks, databases.
2. Output ONLY valid JSON " no markdown, no commentary, no preamble.
3. The expected_answer must be specific to THIS question, not generic.
4. The interview is English-only. Ask the question in English and expect the candidate to answer in English.
5. Professional conduct is mandatory. Abusive language is a policy violation.

Return ONLY this JSON:
{{
  "question": "<the exact question to ask " one sentence, no numbering>",
  "expected_answer": {{
    "key_concepts": ["<concept 1>", "<concept 2>", "<concept 3>"],
    "reasoning_steps": ["<STAR step 1>", "<STAR step 2>", "<STAR step 3>", "<STAR step 4>"],
    "ideal_structure": "<what an ideal answer looks like " 1 sentence>",
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

TASK " Question #{index + 1} of {max_questions} | {difficulty.upper()}
{difficulty_instruction}

RULES:
1. Output ONLY valid JSON " no markdown, no commentary, no preamble.
2. The expected_answer must be specific to THIS question.
3. key_concepts must be the EXACT technical concepts a correct answer requires.
4. common_mistakes must name real misconceptions, not generic advice.
5. The interview is English-only. Ask the question in English and expect the candidate to answer in English.
6. Professional conduct is mandatory. Abusive language is a policy violation.

Return ONLY this JSON:
{{
  "question": "<the exact question to ask " one sentence, no numbering>",
  "expected_answer": {{
    "key_concepts": ["<required concept 1>", "<required concept 2>", "<required concept 3>"],
    "reasoning_steps": ["<step 1>", "<step 2>", "<step 3>"],
    "ideal_structure": "<what a complete, correct answer covers " 1 sentence>",
    "common_mistakes": ["<mistake 1>", "<mistake 2>", "<mistake 3>"]
  }}
}}"""

    question = ""
    expected_answer = {}

    try:
        response_text = _invoke_chat_model(
            llm_client=llm,
            prompt=system_prompt,
            user_id=state["user_id"],
            model_name=CHAT_MODEL_NAME,
            interview_id=state.get("interview_id"),
        ).content.strip()
        parsed = safe_json_parse(response_text)
        question = str(parsed.get("question", "")).strip()
        expected_answer = parsed.get("expected_answer", {})

        # Behavioral guard " re-generate if technical leakage detected
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
                    "[generate_question]    Technical leakage detected " regenerating"
                )
                retry_prompt = (
                    f"{system_prompt}\n\n"
                    "   Previous attempt leaked technical content. "
                    "Regenerate a purely behavioral question with ZERO engineering concepts."
                )
                response_text = _invoke_chat_model(
                    llm_client=llm,
                    prompt=retry_prompt,
                    user_id=state["user_id"],
                    model_name=CHAT_MODEL_NAME,
                    interview_id=state.get("interview_id"),
                ).content.strip()
                parsed = safe_json_parse(response_text)
                question = str(parsed.get("question", "")).strip()
                expected_answer = parsed.get("expected_answer", {})

    except BudgetExceededError:
        raise
    except Exception as e:
        print(f"[generate_question] LLM/parse error: {e}")
        # Deterministic fallback " question only; expected_answer is minimal
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

    entry = {
        "question": question,
        "expected_answer": expected_answer,
        "answer": "",
        "index": index,
        "difficulty": difficulty,
        "timestamp": int(time.time()),
    }

    print(f"[generate_question] Q#{index+1} ({difficulty}): {question[:100]}")

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


# """""""""""""""""""""""""""""""""""""""""""""
# NODE 3: PUBLISH QUESTION
# """""""""""""""""""""""""""""""""""""""""""""


def publish_question(state: InterviewState) -> dict:
    print("[publish_question] started")

    if _is_terminated(state):
        print("[publish_question] >" Terminated " skipping")
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


# """""""""""""""""""""""""""""""""""""""""""""
# NODE 4: WAIT FOR ANSWER
# """""""""""""""""""""""""""""""""""""""""""""


def wait_for_answer(state: InterviewState) -> dict:
    print("[wait_for_answer] started")

    if _is_terminated(state):
        print("[wait_for_answer] >" Already terminated " returning immediately")
        return {"user_answer": "", "timeout": True}

    interview_id = state.get("interview_id")
    answer_key = f"interview:{interview_id}:latest_answer"
    end_key = f"interview:{interview_id}:ended"
    ready_channel = f"interview:{interview_id}:answer_ready"
    timeout = 240

    # Check persistent end flag before subscribing (race-condition guard)
    if client.exists(end_key):
        print("[wait_for_answer] >" End flag already set")
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
                print("[wait_for_answer] >" End flag detected during poll")
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
                    return {"user_answer": "", "timeout": True}
                print(f"[wait_for_answer] Answer received: {answer[:80]}")
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


# """""""""""""""""""""""""""""""""""""""""""""
# NODE 5: EVALUATE ANSWER  (comparative, strict)
# """""""""""""""""""""""""""""""""""""""""""""


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
            "weaknesses": [
                "You answered in a non-English language during an English-only interview."
            ],
            "verdict": "You violated the interview language policy by answering in a non-English language.",
            "feedback": "You violated the interview language policy by answering in a non-English language.",
        }

    if _contains_abusive_language(answer):
        return {
            **_empty,
            "missing_concepts": expected_answer.get("key_concepts", []) or [],
            "weaknesses": [
                "You used abusive language instead of giving a professional answer."
            ],
            "verdict": "You violated interview conduct policy by using abusive language.",
            "feedback": "You violated interview conduct policy by using abusive language.",
        }

    # Support turns are live UX responses " never scored
    if is_support_turn:
        print("[evaluate_answer] Skipping " support turn")
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

    # "" DIFFICULTY SCORING RULES """""""""""""""""""""""""""""""""""""""""""
    difficulty_rules = {
        "intro": (
            "This is an intro/self-introduction question. "
            "Score 8-10 if the candidate gave a reasonable self-introduction. "
            "Score below 6 only if the answer is completely off-topic or blank."
        ),
        "easy": (
            "STRICT " easy questions test fundamentals. "
            "If ANY key concept from the expected answer is absent ' score cannot exceed 3. "
            "A complete, correct answer deserves at most 7 (easy questions have a ceiling of 7). "
            "Do not give 9 or 10 for an easy question."
        ),
        "medium": (
            "MODERATE " medium questions require applied knowledge. "
            "If more than half the key concepts are missing ' score cannot exceed 5. "
            "Partial credit allowed up to 6 for answers that cover core concepts but lack depth."
        ),
        "hard": (
            "LENIENT ON PARTIAL " hard questions are genuinely difficult. "
            "Award partial credit generously if the candidate demonstrates correct reasoning "
            "even without the complete answer. Full marks (9-10) only for truly complete answers. "
            "If any core concept is missing, cap at 6"7."
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
- Use "you" " never "the candidate".
- missing_concepts must list EXACTLY which key concepts were absent from the answer.
- If the answer is vague and hits no concrete STAR element ' score  4.
- A score of 7+ requires clear Situation, Task, Action, AND Result with measurable impact.
- If the answer is not in English, treat it as a policy violation and score it 0.
- If the answer contains abusive or harsh language, treat it as a conduct violation and score it 0.

Dimensions for behavioral evaluation:
- star_structure (0-10): How well the STAR format was followed
- self_awareness (0-10): Reflection on own role, mistakes, growth
- clarity (0-10): How clearly and concisely the story was told
- communication (0-10): Professional tone, structured delivery

Return ONLY valid JSON " no markdown, no extra keys:
{{
  "score": <integer 0-10>,
  "confidence": <float 0.0-1.0 " your confidence this score is accurate>,
  "dimensions": {{
    "star_structure": <0-10>,
    "self_awareness": <0-10>,
    "clarity": <0-10>,
    "communication": <0-10>
  }},
  "missing_concepts": ["<concept absent from the answer>", ...],
  "incorrect_points": ["<anything factually wrong or misleading>", ...],
  "strengths": ["<specific thing done well " under 15 words>", ...],
  "weaknesses": ["<specific gap " name what was missing " under 15 words>", ...],
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
- Use "you" " never "the candidate".
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

Return ONLY valid JSON " no markdown, no extra keys:
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
  "strengths": ["<specific correct thing " under 15 words>", ...],
  "weaknesses": ["<specific gap or error " name the concept " under 15 words>", ...],
  "verdict": "<1 sentence brutally honest summary>",
  "followup": <true if a probing technical follow-up would add signal>,
  "followup_question": "<specific follow-up, or empty string>"
}}"""

    try:
        result_text = _invoke_chat_model(
            llm_client=llm_eval,
            prompt=eval_prompt,
            user_id=state["user_id"],
            model_name=CHAT_MODEL_NAME,
            interview_id=state.get("interview_id"),
        ).content
        parsed = safe_json_parse(result_text)

        # "" DETERMINISTIC POST-PROCESSING """""""""""""""""""""""""""""""""
        raw_score = max(0, min(10, int(parsed.get("score", 0))))
        missing_concepts = [str(c) for c in parsed.get("missing_concepts", []) if c]

        # Apply difficulty-aware cap " LLM cannot override this
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
            if (
                "Answer was too thin to evaluate meaningfully."
                not in result["weaknesses"]
            ):
                result["weaknesses"].append(
                    "Answer was too thin to evaluate meaningfully."
                )
            result["strengths"] = []
            result["missing_concepts"] = list(
                {
                    *result["missing_concepts"],
                    *[str(c) for c in expected_answer.get("key_concepts", []) if c],
                }
            )
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

    except BudgetExceededError:
        raise
    except Exception as e:
        print(f"[evaluate_answer] Parse error: {e}")
        result = {
            "score": 0,
            "confidence": 0.0,
            "dimensions": {},
            "missing_concepts": [],
            "incorrect_points": [],
            "strengths": [],
            "weaknesses": ["Evaluation failed " answer could not be processed."],
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


# """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
# FIXED: classify_answer_intent with GUARDRAILS
# """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
# Changes:
# 1. ... Pre-LLM security checks (before touching user input to LLM)
# 2. ... Language enforcement (English-only, strict)
# 3. ... Conduct enforcement (abusive language)
# 4. ... Forbidden pattern detection (SQL injection, DB ops, system commands)
# 5. ... Intent violations handled before LLM
# """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

import re
from typing import Dict, Any
from langchain_core.messages import HumanMessage
from app.core.config import settings
from langchain_openai import ChatOpenAI

llm_classifier = ChatOpenAI(
    model="gpt-4.1", temperature=0.0, api_key=settings.OPENAI_API_KEY
)

INTERVIEWER_PERSONA = (
    "You are a professional, in-character technical/behavioral interviewer. "
    "You are polite but firm. You never break character. "
    "You respond in English only, regardless of what language the candidate uses."
)

# """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
# SECURITY PATTERNS
# """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

FORBIDDEN_PATTERNS = [
    # Database operations
    r"(delete|remove|drop|truncate|clear)\s+(me|my|database|db|table|record)",
    r"(delete|remove).*from\s+(database|db)",
    r"remove\s+(my\s+)?(entry|data|information|profile)",
    # SQL injection
    r"sql\s+injection|mysql|select.*from|insert.*into|update.*set|drop\s+table",
    r"exec\s*\(|system\s*\(|subprocess|shell_exec",
    # System commands
    r"(system|shell|bash|cmd|command)\s*:",
    r"bypass|override|hack|jailbreak|break.*out",
    r"(exit|quit)\s+(the\s+)?(system|interview|app)",
    # Prompt injection
    r"ignore\s+(your|the)\s+(instructions|prompt|rules)",
    r"forget\s+(your|the)\s+(instructions|system|message)",
    r"you\s+are\s+now|pretend\s+you\s+are|act\s+as",
    # Policy evasion
    r"speak\s+(hindi|tamil|telugu|kannada|malayalam|bengali|marathi|urdu)",
    r"(respond|answer|speak|write)\s+in\s+[a-z]+(hindi|spanish|french|german|chinese|japanese|korean)",
]

NON_ENGLISH_SCRIPT_PATTERNS = [
    r"[\u0900-\u097F]",  # Devanagari (Hindi, Sanskrit, etc.)
    r"[\u0B80-\u0BFF]",  # Tamil
    r"[\u0C00-\u0C7F]",  # Telugu
    r"[\u0C80-\u0CFF]",  # Kannada
    r"[\u0D00-\u0D7F]",  # Malayalam
    r"[\u0980-\u09FF]",  # Bengali
    r"[\u0900-\u0950]",  # Devanagari diacritics
    r"[\u4E00-\u9FFF]",  # CJK (Chinese)
    r"[\u3040-\u309F]",  # Hiragana (Japanese)
    r"[\u30A0-\u30FF]",  # Katakana (Japanese)
    r"[\uAC00-\uD7AF]",  # Hangul (Korean)
]

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


def _contains_non_english_script(answer: str) -> bool:
    """Detect non-English scripts (strict enforcement)."""
    if not answer:
        return False
    for pattern in NON_ENGLISH_SCRIPT_PATTERNS:
        if re.search(pattern, answer):
            return True
    return False


def _contains_abusive_language(answer: str) -> bool:
    """Detect abusive/profane language."""
    if not answer:
        return False
    return any(
        re.search(pattern, answer or "", flags=re.IGNORECASE)
        for pattern in ABUSIVE_PATTERNS
    )


def _contains_forbidden_pattern(answer: str) -> tuple[bool, str]:
    """
    Check for security violations.
    Returns: (is_violation, violation_type)
    """
    if not answer:
        return False, ""

    lower_answer = answer.lower()

    for pattern in FORBIDDEN_PATTERNS:
        if re.search(pattern, lower_answer, flags=re.IGNORECASE):
            # Categorize the violation
            if "delete" in pattern or "remove" in pattern or "drop" in pattern:
                return True, "database_tampering"
            elif "sql" in pattern or "inject" in pattern:
                return True, "sql_injection"
            elif "system" in pattern or "bash" in pattern or "cmd" in pattern:
                return True, "system_command"
            elif "bypass" in pattern or "hack" in pattern or "jailbreak" in pattern:
                return True, "prompt_injection"
            elif "hindi" in pattern or "spanish" in pattern or "french" in pattern:
                return True, "language_evasion"
            else:
                return True, "policy_violation"

    return False, ""


# """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
# MAIN FUNCTION
# """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""


def classify_answer_intent(state: dict) -> dict:
    """
    NODE A " Classifies candidate's response with GUARDRAILS.

    GUARD SEQUENCE (all pre-LLM):
    1. Empty answer ' treat as answer (evaluate_answer will score 0)
    2. Non-English script ' language_violation
    3. Abusive language ' conduct_violation
    4. Forbidden patterns ' security_violation
    5. THEN call LLM to classify actual intent

    Returns:
        intent: one of: answer, meta_request, skip, question, language_violation,
                        conduct_violation, security_violation
        intent_reply: interviewer response (empty for answer intent)
        skip_requested: True only when intent == "skip"
    """
    print("[classify_answer_intent] started")

    if state.get("timeout"):
        print("[classify_answer_intent] >" Terminated " skipping")
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

    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    # GUARD 1: Empty answer
    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    if not answer:
        print("[classify_answer_intent] Empty answer ' treating as answer")
        return {
            "intent": "answer",
            "intent_reply": "",
            "skip_requested": False,
        }

    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    # GUARD 2: Non-English script (strict enforcement)
    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    if _contains_non_english_script(answer):
        print("[classify_answer_intent]    Non-English script detected")
        reply = (
            "This interview is conducted in English only. "
            "Please provide your answer in English."
        )
        return {
            "intent": "language_violation",
            "intent_reply": reply,
            "skip_requested": False,
        }

    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    # GUARD 3: Abusive/profane language (conduct violation)
    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    if _contains_abusive_language(answer):
        print("[classify_answer_intent]    Abusive language detected")
        reply = (
            "Professional conduct is required during this interview. "
            "Please rephrase your response appropriately."
        )
        return {
            "intent": "conduct_violation",
            "intent_reply": reply,
            "skip_requested": False,
        }

    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    # GUARD 4: Forbidden patterns (security violations)
    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    is_violation, violation_type = _contains_forbidden_pattern(answer)
    if is_violation:
        print(f"[classify_answer_intent]  Security violation: {violation_type}")

        violation_replies = {
            "database_tampering": (
                "I cannot process requests to modify your interview data. "
                "Please focus on answering the interview question."
            ),
            "sql_injection": (
                "Invalid request format. Please answer the interview question."
            ),
            "system_command": (
                "System-level commands are not permitted. Please answer the question."
            ),
            "prompt_injection": (
                "I cannot modify my behavior or instructions during the interview. "
                "Please answer the question as asked."
            ),
            "language_evasion": (
                "This interview is English-only. I cannot conduct it in other languages."
            ),
            "policy_violation": (
                "That request violates interview policy. Please answer the question."
            ),
        }

        reply = violation_replies.get(
            violation_type, "Invalid request. Please answer the question."
        )

        return {
            "intent": "security_violation",
            "intent_reply": reply,
            "skip_requested": False,
        }

    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    # All guards passed ' call LLM for actual intent classification
    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

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
  ANSWER        " The candidate is genuinely attempting to answer the question.
                  Even a partial, wrong, or very short answer still counts.
                  Even if they mention they don't know but try to reason ' ANSWER.
  META_REQUEST  " The candidate is NOT answering. Instead they are making a
                  request that changes how the interview runs:
                    - asking to switch language ("speak Hindi", "respond in French")
                    - asking to change the format ("can you type instead of speak")
                    - asking about scoring rules ("how will this be graded")
                    - any request that is about the interview process itself
  SKIP          " The candidate explicitly says they want to skip or pass:
                    - "skip", "pass", "next question", "I want to skip this",
                      "can we move on", "skip karein"
  QUESTION      " The candidate is asking a clarifying question about the
                  interview question itself (not about the process):
                    - "what do you mean by X?"
                    - "are you asking about Y or Z?"
                    - "can you give me an example?"
 
CLASSIFICATION RULES:
  1. If there is ANY genuine attempt to address the question topic, prefer ANSWER.
  2. Only use META_REQUEST if the response contains zero answer content AND is
     clearly a request to change something about how the interview works.
  3. Language-switch requests ("reply in Hindi") are always META_REQUEST.
  4. "I don't know" alone is ANSWER (a valid but weak answer).
  5. Combine meta + attempt ' classify as ANSWER (the attempt wins).
 
After classifying, write a SHORT in-character interviewer reply for non-ANSWER
intents. The reply must:
  - Be 1"3 sentences maximum.
  - Stay strictly in English regardless of what language the candidate used.
  - For META_REQUEST: politely but FIRMLY decline. Do NOT apologize excessively.
    State clearly this is not possible and redirect to the question.
  - For SKIP: acknowledge, say you will move to the next question.
  - For QUESTION: answer the clarification concisely, then re-invite the answer.
  - For ANSWER: leave reply as empty string "".
 
Return ONLY valid JSON:
{{
  "intent": "<ANSWER|META_REQUEST|SKIP|QUESTION>",
  "reply": "<in-character reply for non-ANSWER " empty string for ANSWER>"
}}"""

    intent = "answer"
    intent_reply = ""

    try:
        raw = _invoke_chat_model(
            llm_client=llm_classifier,
            prompt=classification_prompt,
            user_id=state["user_id"],
            model_name=CHAT_MODEL_NAME,
            interview_id=interview_id,
        ).content.strip()
        parsed = _safe_json(raw)

        raw_intent = str(parsed.get("intent", "ANSWER")).strip().upper()
        if raw_intent not in {"ANSWER", "META_REQUEST", "SKIP", "QUESTION"}:
            raw_intent = "ANSWER"

        intent = raw_intent.lower()
        intent_reply = str(parsed.get("reply", "")).strip()

        print(
            f"[classify_answer_intent] intent={intent} | "
            f"reply={intent_reply[:80] if intent_reply else '(none)'}"
        )

    except BudgetExceededError:
        raise
    except Exception as e:
        print(f"[classify_answer_intent] LLM/parse error: {e} " defaulting to ANSWER")
        intent = "answer"
        intent_reply = ""

    # Publish intent reply if needed
    if intent != "answer" and intent_reply and interview_id:
        from app.graph.nodes.interview_creation_node import _publish_event

        index = state.get("current_index", 1) - 1
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


# """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
# NODE B: GENERATE REFERENCE ANSWER
# """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""


def generate_reference_answer(state: InterviewState) -> dict:
    """
    NODE B " Generates a clean, human-readable model answer for the current
    question. Runs AFTER generate_question, BEFORE publish_question.

    The reference answer is stored in state['reference_answer'] and is
    included in:
      - store_step() " persisted per question in Redis
      - finalize() " included in question_scores for frontend feedback display

    It is NOT shown during the interview " only in the post-interview report.

    Returns:
        reference_answer: str " a 150-300 word model answer in plain English
    """
    print("[generate_reference_answer] started")

    if _is_terminated(state):
        print("[generate_reference_answer] >" Terminated " skipping")
        return {"reference_answer": ""}

    question = state.get("current_question", "")
    expected_answer = state.get("expected_answer") or {}
    role = state.get("role", "Software Engineer")
    interview_type = state.get("interview_type", "technical")
    difficulty = state.get("difficulty", "medium")
    candidate_name = state.get("candidate_name") or "the candidate"
    skills = [str(s) for s in (state.get("skills") or []) if s is not None]
    resume_chunks = [
        str(c) for c in (state.get("resume_context") or []) if c is not None
    ]

    def _summarize_resume(chunks: List[str], max_chars: int = 700) -> str:
        if not chunks:
            return ""
        text = " ".join(chunks)
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) <= max_chars:
            return text
        trimmed = text[:max_chars].rsplit(" ", 1)[0].strip()
        return f"{trimmed}..."

    # Support turns have no scoreable question " skip
    if state.get("is_support_turn", False):
        print("[generate_reference_answer] Skipping " support turn")
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
            "Make it concrete " invent a realistic professional scenario. "
            "Include a measurable outcome in the Result section."
        )
    else:
        format_note = (
            "Structure the answer clearly: start with a direct answer, "
            "explain the reasoning, cover edge cases or trade-offs if relevant. "
            "Use plain English " no code unless essential."
        )

    resume_excerpt = _summarize_resume(resume_chunks)
    skills_text = ", ".join(skills[:8]) if skills else "Not specified"

    ref_prompt = f"""You are an expert {role} being asked a {difficulty.upper()} {interview_type} interview question.
 
QUESTION:
{question}

CONTEXT ABOUT THE CANDIDATE:
Name: {candidate_name}
Target role: {role}
Top skills: {skills_text}
Resume context (verbatim, may be partial): {resume_excerpt or "Not available"}
 
WHAT A COMPLETE ANSWER MUST COVER:
Key concepts: {json.dumps(key_concepts)}
Reasoning steps: {json.dumps(reasoning_steps)}
Ideal structure: {ideal_structure}
Common mistakes to avoid: {json.dumps(common_mistakes)}
 
YOUR TASK:
Write a model answer that a strong candidate would give. This answer will be shown
to the candidate AFTER the interview as a reference " not during.
 
FORMAT RULES:
- {format_note}
- 150"300 words. No more.
- Write in first person ("I would...", "In my experience...").
- Do NOT use bullet points or numbered lists " write in flowing prose.
- Do NOT start with "Certainly", "Sure", "Great question", or any preamble.
- Start directly with the answer content.
- Cover all key concepts naturally within the prose.
- Make it feel specific to {candidate_name} applying for the {role} role.
- If you mention background or projects, only use details supported by the resume context above; do not invent facts.
 
Write only the model answer. Nothing else."""

    reference_answer = ""

    try:
        reference_answer = _invoke_chat_model(
            llm_client=llm_ref,
            prompt=ref_prompt,
            user_id=state["user_id"],
            model_name=CHAT_MODEL_NAME,
            interview_id=state.get("interview_id"),
        ).content.strip()
        print(
            f"[generate_reference_answer] Generated {(reference_answer)} "
            f"for Q: {question[:60]}"
        )
    except BudgetExceededError:
        raise
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
                f"The ideal reasoning path is: {' ' '.join(reasoning_steps[:3])}. "
            )
        if ideal_structure:
            reference_answer += ideal_structure
        reference_answer = reference_answer.strip() or (
            "No reference answer could be generated for this question."
        )

    question_history = state.get("question_history", [])
    updated_history = list(question_history)
    if updated_history and updated_history[-1].get("question") == question:
        updated_history[-1]["reference_answer"] = reference_answer

    return {
        "reference_answer": reference_answer,
        "question_history": updated_history,
    }


# """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
# LANGGRAPH ROUTER  (add this to your graph builder)
# """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""# """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
# FIXED: route_after_intent + NEW store_intent_verdict node
# """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
# Changes:
# 1. ... Added store_intent_verdict() node to record non-answers
# 2. ... Updated router to send non-answers through verdict storage
# 3. ... Ensures question_history is complete even for skips/violations
# """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

from app.graph.state.interview_creation_state import InterviewState
import json
import time
from app.core.redis_client import client


def route_after_intent(state: InterviewState) -> str:
    """
    Conditional edge after classify_answer_intent.

    Routes based on intent:
    - ANSWER ' evaluate_answer (normal scoring flow)
    - SKIP, META_REQUEST, QUESTION, or violations ' store_intent_verdict
      (record the non-answer with appropriate verdict before routing next)
    """
    intent = (state.get("intent") or "answer").lower()

    # Normal scoring path
    if intent == "answer":
        return "evaluate_answer"

    # All non-answers go through verdict storage FIRST
    # This ensures question_history is complete
    return "store_intent_verdict"


def store_intent_verdict(state: InterviewState) -> dict:
    """
    NODE: Store non-answer verdicts before routing.

    Ensures that skips, policy violations, clarifying questions, and meta
    requests are all recorded in the question history with appropriate verdicts.

    This prevents the question_history from being incomplete/fragmented.
    """
    print("[store_intent_verdict] started")

    intent = (state.get("intent") or "answer").lower()
    interview_id = state.get("interview_id")
    question_history = state.get("question_history", [])
    current_index = state.get("current_index", 1)
    is_support_turn = state.get("is_support_turn", False)

    # Support turns are not scored " skip storage
    if is_support_turn:
        print("[store_intent_verdict] Skipping " support turn")
        return {
            "question_history": question_history,
            "current_index": current_index,
        }

    # Timeout " don't store
    if state.get("timeout"):
        print("[store_intent_verdict] >" Terminated " skipping")
        return {
            "question_history": question_history,
            "current_index": current_index,
        }

    if intent == "answer":
        print(
            "[store_intent_verdict] Skipping " answer intent (should go to evaluate_answer)"
        )
        return {
            "question_history": question_history,
            "current_index": current_index,
        }

    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    # Build verdict for this non-answer intent
    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

    verdict_map = {
        "skip": "Candidate chose to skip this question.",
        "meta_request": "Candidate requested a policy exception (not permitted).",
        "question": "Candidate asked a clarifying question; answer was deferred.",
        "language_violation": "Language policy violation " non-English response detected.",
        "conduct_violation": "Professional conduct violation " abusive language detected.",
        "security_violation": "Security policy violation " forbidden request pattern detected.",
    }

    verdict = verdict_map.get(intent, f"Non-answer intent: {intent}")

    # For policy/security violations, score is 0 (no credit)
    # For skip/clarification, also 0 (no evaluation yet)
    score = 0

    history_index = current_index - 1
    entry = {
        "index": history_index,
        "question": state.get("current_question", ""),
        "expected_answer": state.get("expected_answer", {}),
        "reference_answer": "",  # No reference for non-answers
        "user_answer": state.get("user_answer", ""),
        "answer_text": state.get("user_answer", ""),
        "intent": intent,  # Store which type of non-answer this was
        "score": score,
        "confidence": 0.0,
        "dimensions": {},
        "missing_concepts": [],
        "incorrect_points": [verdict],  # Store verdict as an incorrect point
        "strengths": [],
        "weaknesses": [verdict],
        "verdict": verdict,
        "feedback": verdict,  # Alias
        "difficulty": state.get("difficulty", "unknown"),
        "followup": False,
        "followup_question": "",
        "timestamp": int(time.time()),
        "answer_analytics": {},
        "score_pillars": {
            "content_score": 0,
            "delivery_score": 0,
            "confidence_score": 0,
            "communication_flow_score": 0,
        },
        "is_non_answer": True,  # Flag for finalize() to handle differently
    }

    # Persist to Redis (same format as evaluate_answer stores)
    if interview_id:
        try:
            client.rpush(
                f"interview:{interview_id}:history",
                json.dumps(entry),
            )
            print(
                f"[store_intent_verdict] Stored {intent} verdict for Q#{history_index} " "
                f"score={score}, verdict={verdict[:60]}"
            )
        except Exception as e:
            print(f"[store_intent_verdict] Redis error: {e}")

    # Update in-memory history
    updated_history = list(question_history)
    if updated_history and updated_history[-1].get("index") == history_index:
        updated_history[-1].update(
            {
                "answer": entry["user_answer"],
                "score": score,
                "verdict": verdict,
                "intent": intent,
            }
        )

    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    # Determine next node based on intent
    # """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

    if intent == "skip":
        # Advance to next question
        print(f"[store_intent_verdict] ' advancing (skip)")
        return {
            "question_history": updated_history,
            "current_index": current_index + 1,  # Advance
            "skip_intent": True,
        }
    else:
        # For clarifications, meta_requests, violations ' loop back to wait_for_answer
        # to get another response from the candidate
        print(f"[store_intent_verdict] ' looping back (intent={intent})")
        return {
            "question_history": updated_history,
            "current_index": current_index,  # Don't advance
            "skip_intent": False,
        }


# """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
# UPDATED ROUTER FOR STORE_INTENT_VERDICT
# """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""


def route_after_intent_verdict(state: InterviewState) -> str:
    """
    Routes after store_intent_verdict based on the original intent.
    """
    intent = (state.get("intent") or "answer").lower()

    if intent == "skip":
        # Move to next question
        return "generate_question"
    else:
        # Clarifications, meta_requests, violations ' get another answer
        return "wait_for_answer"


# """""""""""""""""""""""""""""""""""""""""""""
# NODE 6: STORE STEP  (full structured data)
# """""""""""""""""""""""""""""""""""""""""""""


def store_step(state: InterviewState) -> dict:
    """
    NODE 6: Stores the FULL structured interview step " not just score + feedback.
    Includes expected_answer, dimensional breakdown, and comparative analysis.
    """
    print("[store_step] started")

    interview_id = state.get("interview_id")
    question_history = state.get("question_history", [])
    current_index = state.get("current_index", 1)
    is_support_turn = state.get("is_support_turn", False)

    if is_support_turn:
        print("[store_step] Skipping " support turn")
        return {
            "question_history": question_history,
            "followup": False,
            "followup_question": "",
            "current_index": current_index,
            "is_support_turn": False,
        }

    if _is_terminated(state):
        print("[store_step] >" Terminated " skipping")
        return {
            "question_history": question_history,
            "followup": False,
            "followup_question": "",
            "current_index": current_index,
            "is_support_turn": False,
            "timeout": True,
        }

    history_index = current_index - 1

    # Full structured entry " every field the evaluation produced
    entry = {
        "index": history_index,
        "question": state.get("current_question", ""),
        "expected_answer": state.get("expected_answer", {}),
        "reference_answer": state.get("reference_answer", ""),
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
                "expected_answer": entry.get("expected_answer", {}),
                "reference_answer": entry.get("reference_answer", ""),
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


# """""""""""""""""""""""""""""""""""""""""""""
# NODE 7: CHECK CONTINUE
# """""""""""""""""""""""""""""""""""""""""""""


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
        print("[check_continue] ' max questions reached, finalizing")
        return {"interview_complete": True, "timeout": False}

    print(f"[check_continue] ' continuing, next Q#{current_index + 1}")
    return {"interview_complete": False, "timeout": False}


# """""""""""""""""""""""""""""""""""""""""""""
# NODE 8: FINALIZE  (deterministic step 1 + LLM step 2)
# """""""""""""""""""""""""""""""""""""""""""""

def finalize(state: InterviewState) -> dict:
    """
    NODE 8: PATCH 5 " Read integrity fields from Redis.
    PATCH 6 " Include them in narration_prompt.
    PATCH 8 " Pass interruption_count to _compute_deterministic_summary.
    PATCH 9 " Include end_reason + interruption note in Mem0 memory text.
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

    # "" PATCH 5: Read integrity fields from Redis """"""""""""""""""""""""""
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
    # with whatever the frontend reported " it's more accurate.
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
            # "" PATCH 5: Add integrity fields to empty-history branch """"""
            "end_reason": end_reason,
            "is_early_exit": True,
            "interruption_count": 0,
        }
    else:
        # """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
        # STEP 1 " DETERMINISTIC COMPUTATION
        # """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
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

        # """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
        # STEP 2 " LLM NARRATION (facts only, no invention)
        # The LLM receives the computed facts and NARRATES them.
        # It cannot change scores, invent strengths, or hallucinate gaps.
        # """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

        # Build compact Q&A block with verdicts for the LLM to reference
        qa_block = ""
        for i, h in enumerate(history):
            qa_block += (
                f"Q{i+1} [{h.get('difficulty','?')}]: {h.get('question','')}\n"
                f"Answer: {h.get('user_answer','(no answer)')}\n"
                f"Score: {h.get('score',0)}/10 | Verdict: {h.get('verdict','')}\n"
                f"Missing: {', '.join(h.get('missing_concepts',[]) or []) or 'none'}\n\n"
            )

        # "" PATCH 6: Include end_reason + interruptions in narration_prompt """"
        narration_prompt = f"""You are writing a post-interview report for a candidate.
You MUST narrate ONLY the facts provided below. Do NOT invent, inflate, or soften anything.
Use "you" when addressing the candidate. Be direct. No filler phrases.

COMPUTED FACTS (authoritative " do not contradict):
- Overall score: {overall_100}/100
- Weighted average (0-10): {facts['weighted_avg']}
- Recommendation: {recommendation}
- Top strengths: {json.dumps(facts['top_strengths'])}
- Top weaknesses: {json.dumps(facts['top_weaknesses'])}
- Repeated gaps (missed in 2+ questions): {json.dumps(facts['repeated_gaps'])}
- Weak dimensions (avg < 5): {json.dumps(facts['weak_dimensions'])}
- Dimension averages: {json.dumps(facts['dim_averages'])}
- End reason: {end_reason}{"     EARLY EXIT " candidate left before completing all questions." if is_early_exit else ""}
- AI interruptions: {interruption_count} times the candidate spoke over the AI mid-answer
{extra_context}

Full Q&A with verdicts:
{qa_block[:4000]}

Return ONLY valid JSON " no markdown, no extra keys:
{{
  "summary": "<2 sentences. First: what you demonstrated overall (reference actual answers). Second: your single biggest gap (name the concept).>",
  "what_went_right": [
    {{"point": "<specific thing from the actual answers " under 20 words>", "tag": "<Core|Clarity|Structure|STAR|Design>"}},
    {{"point": "<specific thing>", "tag": "<tag>"}},
    {{"point": "<specific thing>", "tag": "<tag>"}}
  ],
  "what_went_wrong": [
    {{"point": "<specific gap " name the missing concept " under 20 words>", "tag": "<Gap|Depth|Structure|STAR|Pace>"}},
    {{"point": "<specific gap>", "tag": "<tag>"}},
    {{"point": "<specific gap>", "tag": "<tag>"}}
  ],
  "tips": [
    "<actionable fix starting with a verb " under 20 words>",
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
            result_text = _invoke_chat_model(
                llm_client=llm_summary,
                prompt=narration_prompt,
                user_id=user_id,
                model_name=CHAT_MODEL_NAME,
                interview_id=interview_id,
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

            summary_payload = {
                "role": role,
                "interview_type": interview_type,
                "candidate_name": candidate_name,
                "date_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "duration_seconds": duration_seconds,
                # "" Scores from deterministic step " LLM cannot touch these ""
                "overall_score": overall_100,
                "plain_avg": facts["plain_avg"],
                "weighted_avg": facts["weighted_avg"], 
                "recommendation": recommendation,
                "skill_scores": skill_scores,
                "question_scores": question_scores,
                "score_pillars": facts["score_pillars"],
                "analytics": facts["analytics"],
                "recovery_score": facts["recovery_score"],
                "pressure_handling_score": facts["pressure_handling_score"],
                "conciseness_score": facts["conciseness_score"],
                "coaching_priorities": facts["coaching_priorities"],
                # "" Narrated content from LLM step """""""""""""""""""""""""""
                "summary": str(narrated.get("summary", "")),
                "what_went_right": what_went_right,
                "what_went_wrong": what_went_wrong,
                "tips": [str(t) for t in narrated.get("tips", []) if t],
                # "" Backward-compat aliases """""""""""""""""""""""""""""""""""
                "strengths": [p["point"] for p in what_went_right],
                "weaknesses": [p["point"] for p in what_went_wrong],
                # "" PATCH 5: Integrity fields in normal branch """""""""""""""
                "end_reason": end_reason,
                "is_early_exit": is_early_exit,
                "interruption_count": interruption_count,
                # "" Gap analysis (deterministic, always included) """""""""""""
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
            # Fall back to deterministic-only summary " no LLM needed
            summary_payload = {
                "role": role,
                "interview_type": interview_type,
                "candidate_name": candidate_name,
                "date_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "duration_seconds": duration_seconds,
                "overall_score": overall_100,
                "plain_avg": facts["plain_avg"],      
                "weighted_avg": facts["weighted_avg"], 
                "recommendation": recommendation,
                "skill_scores": skill_scores,
                "question_scores": question_scores,
                "score_pillars": facts["score_pillars"],
                "analytics": facts["analytics"],
                "recovery_score": facts["recovery_score"],
                "pressure_handling_score": facts["pressure_handling_score"],
                "conciseness_score": facts["conciseness_score"],
                "coaching_priorities": facts["coaching_priorities"],
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
    # "" PATCH 9: Include end_reason + interruption note """"""""""""""""""""
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
            f"Score {summary_payload['overall_score']}/100 " {recommendation}. "
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




