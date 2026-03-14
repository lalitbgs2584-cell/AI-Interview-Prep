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

llm      = ChatOpenAI(model="gpt-4.1", temperature=0.7, api_key=settings.OPENAI_API_KEY)
llm_eval = ChatOpenAI(model="gpt-4.1", temperature=0.2, api_key=settings.OPENAI_API_KEY)

embeddings = OpenAIEmbeddings(model="text-embedding-3-small", api_key=settings.OPENAI_API_KEY)

QDRANT_COLLECTION     = "resumes"
DEFAULT_MAX_QUESTIONS = 10

HUMAN_INTERVIEW_TYPES = {"behavioral", "hr"}


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


def is_human_round(interview_type: str) -> bool:
    """Returns True for behavioral / HR rounds that must stay non-technical."""
    return (interview_type or "").strip().lower() in HUMAN_INTERVIEW_TYPES


def _is_terminated(state: InterviewState) -> bool:
    """
    Returns True when the interview has already been ended — either by the
    user clicking "End Interview" (timeout=True from __END__ signal) or by a
    genuine wait timeout.  Any node can call this to short-circuit its work.
    """
    return bool(state.get("timeout", False))


# -----------------------------
# Description parsing helpers
# -----------------------------

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


# -----------------------------
# DIFFICULTY CONFIG
# -----------------------------

DEFAULT_DIFFICULTY_MAP = {
    0: "intro",
    1: "easy",  2: "easy",  3: "easy",
    4: "medium", 5: "medium", 6: "medium", 7: "medium",
    8: "hard",  9: "hard",
}

CUSTOM_DIFFICULTY_MAPS = {
    "easy": {i: ("intro" if i == 0 else "easy") for i in range(15)},
    "medium": {
        0: "intro", 1: "easy", 2: "easy",
        **{i: "medium" for i in range(3, 15)},
    },
    "hard": {
        0: "intro", 1: "easy", 2: "medium",
        **{i: "hard" for i in range(3, 15)},
    },
}

DIFFICULTY_INSTRUCTIONS_TECHNICAL = {
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

DIFFICULTY_INSTRUCTIONS_BEHAVIORAL = {
    "intro": (
        "This is the OPENING question. Ask the candidate to introduce themselves — "
        "their background, career journey, and what excites them about this opportunity. "
        "Keep it warm and conversational. Do NOT ask anything technical."
    ),
    "easy": (
        "Ask a straightforward behavioral question using the STAR format "
        "(Situation, Task, Action, Result). Focus on communication, teamwork, or work style. "
        "Example themes: collaboration, time management, receiving feedback. "
        "ABSOLUTELY NO technical or coding questions."
    ),
    "medium": (
        "Ask a behavioral question probing leadership, conflict resolution, or adaptability. "
        "The candidate should demonstrate self-awareness and interpersonal skills. "
        "Use realistic workplace scenarios. "
        "ABSOLUTELY NO technical or coding questions."
    ),
    "hard": (
        "Ask a challenging behavioral question about high-stakes situations — "
        "leading through ambiguity, handling failure, driving influence without authority, "
        "or navigating difficult stakeholder dynamics. "
        "ABSOLUTELY NO technical or coding questions."
    ),
}


def get_difficulty_instruction(difficulty: str, interview_type: str) -> str:
    if is_human_round(interview_type):
        return DIFFICULTY_INSTRUCTIONS_BEHAVIORAL.get(difficulty, DIFFICULTY_INSTRUCTIONS_BEHAVIORAL["medium"])
    return DIFFICULTY_INSTRUCTIONS_TECHNICAL.get(difficulty, DIFFICULTY_INSTRUCTIONS_TECHNICAL["medium"])


def resolve_difficulty(index: int, description: str) -> str:
    config   = parse_custom_config(description or "")
    override = config.get("difficulty_override", "")
    dmap     = CUSTOM_DIFFICULTY_MAPS.get(override, DEFAULT_DIFFICULTY_MAP)
    return dmap.get(index, "hard")


def resolve_max_questions(description: str) -> int:
    config = parse_custom_config(description or "")
    raw    = config.get("max_questions")
    if raw is not None:
        try:
            return max(3, min(15, int(raw)))
        except (TypeError, ValueError):
            pass
    return DEFAULT_MAX_QUESTIONS


BEHAVIORAL_FALLBACKS = {
    "intro":  "Could you start by walking me through your background and what excites you about this opportunity?",
    "easy":   "Tell me about a time you had to collaborate closely with a teammate who had a very different working style. How did you handle it?",
    "medium": "Describe a situation where you had to manage a conflict within your team. What steps did you take and what was the outcome?",
    "hard":   "Tell me about a time you had to drive an important initiative without having direct authority. How did you build alignment and what was the result?",
}


# ─────────────────────────────────────────────
# PSYCHOLOGICAL AWARENESS LAYER
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
_PIVOT_THRESHOLD    = 3


def _is_uncertain(answer: str) -> bool:
    """True if the answer looks like a struggle — explicit or implicit."""
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
    human_round = is_human_round(interview_type)
    is_pivot    = consecutive_struggles >= _PIVOT_THRESHOLD

    context_hint = (
        "behavioral / HR interview focused on communication and interpersonal skills"
        if human_round else
        f"technical interview for a software engineering role (difficulty: {difficulty})"
    )

    scaffold_hint = (
        "Ask them to recall any situation — even a small or informal one — "
        "that relates to the theme of the original question."
        if human_round else
        "Try breaking the question into a simpler sub-concept, or invite them "
        "to reason through a general approach even without the exact answer."
    )

    pivot_note = (
        "\nThis is their 3rd consecutive struggle. "
        "Acknowledge it's a tough area, reassure them warmly, and gently say "
        "you'll move on to something different — WITHOUT asking another question yet."
    ) if is_pivot else ""

    no_tech_note = (
        "\nABSOLUTE RULE: Zero technical content — this is a behavioral round."
        if human_round else ""
    )

    prompt = f"""You are a warm, psychologically aware interviewer conducting a {context_hint}.

The candidate ({candidate_name}) just responded to this question:
"{last_question}"

Their response was:
"{last_answer}"

They appear uncertain or stuck (consecutive struggle #{consecutive_struggles}).
{pivot_note}
{no_tech_note}

Generate a SHORT interviewer response that:
1. Acknowledges their difficulty without being condescending.
2. Reduces pressure — remind them it is completely okay.
3. {"Gently say you are moving on to something new." if is_pivot else scaffold_hint}
4. {"Do NOT ask another question — just close this topic warmly." if is_pivot else "End with a simpler / reframed version of the question, or invite them to think aloud."}

Tone: warm, encouraging, professional — like a senior interviewer who genuinely wants the candidate to succeed.

Output ONLY what the interviewer says. No labels, no preamble. Under 4 sentences."""

    try:
        return llm.invoke([HumanMessage(content=prompt)]).content.strip()
    except Exception as e:
        print(f"[_build_supportive_response] LLM error: {e}")
        if is_pivot:
            return (
                f"That's completely fine, {candidate_name} — this is a genuinely tough area "
                "and it's okay if it's not your strongest topic right now. "
                "Let's move on and keep the conversation going."
            )
        if consecutive_struggles == 2:
            return (
                "No worries at all — let's try a different angle. "
                "Even if you haven't seen this exact scenario before, "
                "what would your general instinct or first step be?"
            )
        return (
            "That's okay — take your time. "
            "Even a rough thought or partial approach is great to hear. "
            "What comes to mind first?"
        )


# ─────────────────────────────────────────────
# NODE 1: LOAD CONTEXT
# ─────────────────────────────────────────────

def load_context(state: InterviewState) -> dict:
    print("[load_context] started")
    user_id        = state.get("user_id")
    role           = state.get("role") or "Software Engineer"
    description    = state.get("description") or ""
    interview_type = state.get("interview_type", "technical")

    custom_config = parse_custom_config(description)
    is_custom     = bool(custom_config)
    print(
        f"[load_context] session_type={'custom' if is_custom else 'simple'}, "
        f"interview_type={interview_type}, config={custom_config}"
    )

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

    graph_skills: List[str] = []
    if not is_human_round(interview_type):
        try:
            with neo4j_driver.session(database="neo4j") as session:
                result = session.run(
                    "MATCH (u:Candidate {user_id: $user_id})-[:HAS_SKILL]->(s:Skill) RETURN s.name AS skill",
                    user_id=user_id,
                )
                graph_skills = [str(r["skill"]) for r in result if r["skill"] is not None]
        except Exception as e:
            print(f"[load_context] Neo4j error: {e}")

    mem_query = role
    if custom_config.get("topics"):
        mem_query = f"{role} {', '.join(custom_config['topics'][:3])}"
    try:
        raw = memory_client.search(query=mem_query, user_id=user_id, limit=10)
        memories = raw.get("results", []) if isinstance(raw, dict) else (raw if isinstance(raw, list) else [])
    except Exception as e:
        print(f"[load_context] Mem0 error: {e}")
        memories = []

    candidate_name = get_candidate_name(resume_chunks)

    print(
        f"[load_context] Skills: {len(graph_skills)}, Chunks: {len(resume_chunks)}, "
        f"Memories: {len(memories)}, MaxQ: {resolve_max_questions(description)}"
    )

    return {
        "resume_context":        resume_chunks,
        "skills":                graph_skills,
        "memories":              memories,
        "candidate_name":        candidate_name,
        "current_index":         0,
        "question_history":      [],
        "start_time":            int(time.time()),
        "consecutive_struggles": 0,
        "is_support_turn":       False,
        "timeout":               False,
    }


# ─────────────────────────────────────────────
# NODE 2: GENERATE QUESTION
# ─────────────────────────────────────────────

def generate_question(state: InterviewState) -> dict:
    print("[generate_question] started")

    index                 = state.get("current_index", 0)
    role                  = state.get("role") or "Software Engineer"
    interview_type        = state.get("interview_type", "technical")
    candidate_name        = state.get("candidate_name") or "the candidate"
    question_history      = state.get("question_history") or []
    description           = state.get("description") or ""
    last_answer           = state.get("user_answer", "")
    consecutive_struggles = state.get("consecutive_struggles", 0)

    skills        = [str(s) for s in (state.get("skills") or []) if s is not None]
    resume_chunks = [str(c) for c in (state.get("resume_context") or []) if c is not None]
    raw_memories  = [m for m in (state.get("memories") or []) if m is not None]

    # If the interview has already been terminated, skip everything and
    # propagate timeout so check_continue can finalize cleanly.
    if _is_terminated(state):
        print("[generate_question] ⛔ Interview terminated — skipping question generation")
        return {
            "current_question":      "",
            "question_history":      question_history,
            "current_index":         index,
            "difficulty":            state.get("difficulty", "medium"),
            "followup":              False,
            "followup_question":     "",
            "consecutive_struggles": 0,
            "is_support_turn":       False,
            "timeout":               True,
        }

    custom_config     = parse_custom_config(description)
    is_custom         = bool(custom_config)
    clean_description = strip_custom_config(description)
    custom_topics: List[str] = custom_config.get("topics", [])

    human_round = is_human_round(interview_type)

    print(
        f"[generate_question] index={index}, interview_type={interview_type}, "
        f"human_round={human_round}, consecutive_struggles={consecutive_struggles}"
    )

    # ─────────────────────────────────────────────────────────────────────────
    # PSYCHOLOGICAL CHECK
    # ─────────────────────────────────────────────────────────────────────────
    last_question = question_history[-1].get("question", "") if question_history else ""

    if index > 0 and _is_uncertain(last_answer):
        new_struggles = consecutive_struggles + 1
        print(f"[generate_question] ⚠️  Uncertainty detected — struggle #{new_struggles}")

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
            f"[generate_question] {'Pivoting' if is_pivot else 'Scaffolding'} "
            f"(struggle {new_struggles}/{_PIVOT_THRESHOLD}): {supportive_text[:100]}…"
        )

        return {
            "current_question":      supportive_text,
            "question_history":      question_history,
            "current_index":         index + 1 if is_pivot else index,
            "difficulty":            state.get("difficulty", "medium"),
            "followup":              True,
            "followup_question":     supportive_text,
            "consecutive_struggles": 0 if is_pivot else new_struggles,
            "is_support_turn":       True,
            "timeout":               False,
        }

    # Candidate answered confidently — reset struggle counter
    new_struggles = 0

    # ─────────────────────────────────────────────────────────────────────────
    # Normal question generation
    # ─────────────────────────────────────────────────────────────────────────
    difficulty             = resolve_difficulty(index, description)
    difficulty_instruction = get_difficulty_instruction(difficulty, interview_type)

    prev_qa_summary = ""
    if question_history:
        lines = []
        for entry in question_history[-3:]:
            lines.append(f"Q: {entry.get('question', '')}")
            lines.append(f"A: {entry.get('answer', '(no answer yet)')}")
        prev_qa_summary = "\n".join(lines)

    resume_text   = "\n\n".join(resume_chunks[:4])
    max_questions = resolve_max_questions(description)

    memories_text = json.dumps(
        [m.get("memory", str(m)) if isinstance(m, dict) else str(m) for m in raw_memories[:5]],
        indent=2,
    )

    topic_constraint = ""
    if is_custom and custom_topics and not human_round:
        topic_constraint = (
            f"\nFOCUS TOPICS (prioritise these): {', '.join(custom_topics)}.\n"
            "Your question MUST relate to one of these topics unless this is the intro question.\n"
        )

    extra_context_block = (
        f"\nAdditional context for this session:\n\"\"\"\n{clean_description[:1500]}\n\"\"\"\n"
        if clean_description else ""
    )

    if human_round:
        system_prompt = f"""You are an expert {interview_type.upper()} interviewer conducting a people-skills and culture-fit assessment for a {role} position.

Candidate name: {candidate_name}

Resume excerpt (for background context ONLY — do NOT ask about technical details):
\"\"\"
{resume_text[:1500]}
\"\"\"

Past interview memories (if any):
{memories_text[:600]}
{extra_context_block}
Previous questions asked (avoid repeating themes):
{prev_qa_summary or "None yet."}

---
CURRENT TASK — Question #{index + 1} of {max_questions} | Difficulty: {difficulty.upper()}

{difficulty_instruction}

ABSOLUTE RULES — violating these disqualifies the question:
1. ZERO technical content. Do not mention code, algorithms, data structures, system design,
   databases, APIs, programming languages, frameworks, or any engineering concept.
2. Every question must use the STAR behavioral format as the expected answer structure
   (Situation, Task, Action, Result) unless this is the intro question.
3. Output ONE question only — no preamble, no numbering, no explanation.
4. Do not say "Sure" or "Here is your question" — just the question itself.
5. Ground the question in real workplace situations (teamwork, leadership, communication,
   conflict, growth, motivation, feedback, ambiguity).
"""
    else:
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

        if human_round:
            tech_keywords = [
                "algorithm", "code", "implement", "function", "database", "sql",
                "api", "rest", "graphql", "system design", "data structure",
                "big o", "complexity", "framework", "language", "runtime",
                "deploy", "docker", "kubernetes", "cloud", "microservice",
                "async", "thread", "cache", "index", "query", "schema",
            ]
            if any(kw in question.lower() for kw in tech_keywords):
                print(f"[generate_question] ⚠️  Technical content detected in behavioral question — regenerating")
                rejection_prompt = (
                    f"{system_prompt}\n\n"
                    "⚠️  Your previous attempt contained technical content. "
                    "That is NOT allowed. Generate a purely behavioral STAR-format question. "
                    "Absolutely no mention of code, systems, or engineering concepts."
                )
                response = llm.invoke([HumanMessage(content=rejection_prompt)])
                question = response.content.strip()

    except Exception as e:
        print(f"[generate_question] LLM error: {e}")
        if human_round:
            question = BEHAVIORAL_FALLBACKS.get(difficulty, BEHAVIORAL_FALLBACKS["easy"])
        elif difficulty == "intro":
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
        "question":   question,
        "answer":     "",
        "index":      index,
        "difficulty": difficulty,
        "timestamp":  int(time.time()),
    }

    print(f"[generate_question] Q#{index + 1} ({difficulty}, {interview_type}): {question[:120]}...")

    return {
        "current_question":      question,
        "question_history":      [*question_history, entry],
        "current_index":         index + 1,
        "difficulty":            difficulty,
        "followup":              False,
        "followup_question":     "",
        "consecutive_struggles": new_struggles,
        "is_support_turn":       False,
        "timeout":               False,
    }


# ─────────────────────────────────────────────
# NODE 3: PUBLISH QUESTION
# ─────────────────────────────────────────────

def publish_question(state: InterviewState) -> dict:
    print("[publish_question] started")

    if _is_terminated(state):
        print("[publish_question] ⛔ Interview terminated — skipping publish")
        return {}

    interview_id = state.get("interview_id")
    index        = state.get("current_index", 1) - 1
    difficulty   = state.get("difficulty", "intro")

    is_followup       = state.get("followup", False)
    followup_question = state.get("followup_question", "")
    is_support_turn   = state.get("is_support_turn", False)
    question          = followup_question if is_followup and followup_question else state.get("current_question", "")

    print(f"[publish_question] is_followup={is_followup}, is_support={is_support_turn}, question={question[:80]}...")

    publish_event(
        f"interview:{interview_id}:events",
        {
            "type":            "question",
            "index":           index,
            "difficulty":      difficulty,
            "question":        question,
            "is_followup":     is_followup,
            "is_support_turn": is_support_turn,
            "time":            int(time.time() * 1000),
        },
    )
    return {}


# ─────────────────────────────────────────────
# NODE 4: WAIT FOR ANSWER  (race-condition fix)
# ─────────────────────────────────────────────

def wait_for_answer(state: InterviewState) -> dict:
    print("[wait_for_answer] started")

    # If already terminated, return immediately — don't block for 240s.
    if _is_terminated(state):
        print("[wait_for_answer] ⛔ Already terminated — returning immediately")
        return {"user_answer": "", "timeout": True}

    interview_id  = state.get("interview_id")
    answer_key    = f"interview:{interview_id}:latest_answer"
    end_key       = f"interview:{interview_id}:ended"   # persistent flag set by Node server
    ready_channel = f"interview:{interview_id}:answer_ready"
    timeout       = 240

    # ── RACE-CONDITION FIX ────────────────────────────────────────────────────
    # Redis pubsub does NOT queue messages — if __END__ was published before we
    # subscribe, it's silently lost and the node blocks for the full 240 s.
    #
    # Solution: the Node server ALSO sets a persistent Redis key
    # `interview:{id}:ended` (with EX 3600) when the user clicks "End Interview".
    # We check this key BEFORE subscribing and once per second inside the loop,
    # so the worst-case unblock latency is ~1 second regardless of pubsub timing.
    # ─────────────────────────────────────────────────────────────────────────

    # Check persistent end flag — covers the case where __END__ arrived before
    # this function even started running.
    if client.exists(end_key):
        print("[wait_for_answer] ⛔ End flag already set — returning immediately")
        return {"user_answer": "", "timeout": True}

    # Drain any answer that was set before we subscribed (avoids a missed wakeup).
    raw = client.get(answer_key)
    if raw:
        client.delete(answer_key)
        answer = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        if answer == "__END__":
            print("[wait_for_answer] __END__ found in answer key before subscribe")
            return {"user_answer": "", "timeout": True}
        print(f"[wait_for_answer] Answer found in key before subscribe: {answer[:80]}...")
        return {"user_answer": answer, "timeout": False}

    # Subscribe then poll with a 1-second tick so we can check end_key each loop.
    sub   = client.pubsub()
    sub.subscribe(ready_channel)
    start = time.time()

    try:
        while True:
            elapsed = time.time() - start
            if elapsed > timeout:
                break

            # Poll the persistent end flag every second — this is the fallback
            # that guarantees termination even if the pubsub message was missed.
            if client.exists(end_key):
                print("[wait_for_answer] ⛔ End flag detected during poll")
                return {"user_answer": "", "timeout": True}

            # Non-blocking get_message with a 1-second timeout per iteration.
            # Unlike sub.listen() this doesn't block indefinitely between messages.
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
                    print("[wait_for_answer] __END__ received via pubsub — interview ended by user")
                    return {"user_answer": "", "timeout": True}
                print(f"[wait_for_answer] Answer received: {answer[:80]}...")
                return {"user_answer": answer, "timeout": False}

    finally:
        try:
            sub.unsubscribe(ready_channel)
            sub.close()
        except Exception:
            pass

    print("[wait_for_answer] Timed out after 240s")
    return {"user_answer": "", "timeout": True}


# ─────────────────────────────────────────────
# NODE 5: EVALUATE ANSWER
# ─────────────────────────────────────────────

def evaluate_answer(state: InterviewState) -> dict:
    print("[evaluate_answer] started")
    question        = state.get("current_question", "")
    answer          = state.get("user_answer", "")
    role            = state.get("role") or "Software Engineer"
    difficulty      = state.get("difficulty", "medium")
    interview_type  = state.get("interview_type", "technical")
    skills          = [str(s) for s in (state.get("skills") or []) if s is not None]
    timed_out       = state.get("timeout", False)
    is_support_turn = state.get("is_support_turn", False)

    if timed_out or not answer.strip():
        return {
            "score":             0,
            "confidence":        0.0,
            "feedback":          "No answer was provided within the time limit.",
            "followup":          False,
            "followup_question": "",
        }

    # Support turns are interviewer dialogue — don't score them.
    if is_support_turn:
        print("[evaluate_answer] Skipping — support turn, no scoring.")
        return {
            "score":             state.get("score", 5),
            "confidence":        state.get("confidence", 0.5),
            "feedback":          "",
            "followup":          False,
            "followup_question": "",
        }

    human_round = is_human_round(interview_type)

    if human_round:
        prompt = f"""You are evaluating a candidate's response in a {interview_type.upper()} interview for a {role} position.

Question (Difficulty: {difficulty.upper()}):
{question}

Candidate's Answer:
{answer}

Evaluate using BEHAVIORAL criteria ONLY (STAR framework, communication, self-awareness, leadership, interpersonal skills).
Do NOT evaluate technical knowledge.

Return ONLY valid JSON:
{{
  "score": <integer 0-10>,
  "confidence": <float 0.0-1.0>,
  "feedback": "<constructive 1-2 sentence feedback on communication and STAR structure>",
  "followup": <true if a clarifying behavioral follow-up would add value, otherwise false>,
  "followup_question": "<short behavioral follow-up question, or empty string>"
}}

Scoring guide (behavioral):
- 0-2: Off-topic, evasive, or blank
- 3-4: Vague, missing most STAR elements
- 5-6: Adequate — hits most STAR elements but lacks depth
- 7-8: Strong — clear situation, actions, and measurable result
- 9-10: Exceptional — compelling narrative, strong self-awareness, clear impact

Return only the JSON. No markdown, no explanation.
"""
    else:
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
        parsed["score"]      = max(0, min(10, int(parsed.get("score", 5))))
        parsed["confidence"] = max(0.0, min(1.0, float(parsed.get("confidence", 0.5))))
        parsed.setdefault("followup", False)
        parsed.setdefault("followup_question", "")
        parsed.setdefault("feedback", "")
    except Exception as e:
        print(f"[evaluate_answer] Parse error: {e}")
        parsed = {
            "score":             5,
            "confidence":        0.5,
            "feedback":          "Could not evaluate this answer automatically.",
            "followup":          False,
            "followup_question": "",
        }

    print(f"[evaluate_answer] Score: {parsed['score']}/10 | Followup: {parsed['followup']}")
    return parsed


# ─────────────────────────────────────────────
# NODE 6: STORE STEP
# ─────────────────────────────────────────────

def store_step(state: InterviewState) -> dict:
    print("[store_step] started")
    interview_id     = state.get("interview_id")
    question_history = state.get("question_history", [])
    current_index    = state.get("current_index", 1)
    is_support_turn  = state.get("is_support_turn", False)

    # Support turns are interviewer dialogue — don't write them as Q&A entries.
    if is_support_turn:
        print("[store_step] Skipping — support turn.")
        return {
            "question_history":  question_history,
            "followup":          False,
            "followup_question": "",
            "current_index":     current_index,
            "is_support_turn":   False,
        }

    # Don't write an empty/junk step when the interview was terminated.
    if _is_terminated(state):
        print("[store_step] ⛔ Interview terminated — skipping step storage.")
        return {
            "question_history":  question_history,
            "followup":          False,
            "followup_question": "",
            "current_index":     current_index,
            "is_support_turn":   False,
            "timeout":           True,
        }

    history_index = current_index - 1

    entry = {
        "index":             history_index,
        "question":          state.get("current_question", ""),
        "answer":            state.get("user_answer", ""),
        "score":             state.get("score", 0),
        "confidence":        state.get("confidence", 0.0),
        "feedback":          state.get("feedback", ""),
        "difficulty":        state.get("difficulty", "unknown"),
        "followup":          state.get("followup", False),
        "followup_question": state.get("followup_question", ""),
        "timestamp":         int(time.time()),
    }

    client.rpush(f"interview:{interview_id}:history", json.dumps(entry))

    updated_history = list(question_history)
    if updated_history and updated_history[-1].get("index") == history_index:
        updated_history[-1]["answer"] = entry["answer"]
        updated_history[-1]["score"]  = entry["score"]

    print(f"[store_step] Stored step #{history_index} | current_index stays at {current_index}")

    return {
        "question_history":  updated_history,
        "followup":          False,
        "followup_question": "",
        "current_index":     current_index,
        "is_support_turn":   False,
    }


# ─────────────────────────────────────────────
# NODE 7: CHECK CONTINUE
# ─────────────────────────────────────────────

def check_continue(state: InterviewState) -> dict:
    print("[check_continue] started")

    current_index   = state.get("current_index", 0)
    description     = state.get("description") or ""
    max_questions   = resolve_max_questions(description)
    is_support_turn = state.get("is_support_turn", False)
    timed_out       = bool(state.get("timeout"))

    print(
        f"[check_continue] current_index={current_index}, "
        f"max={max_questions}, timeout={timed_out}, support_turn={is_support_turn}"
    )

    # HARD TERMINATION — interview was ended manually or timed out
    if timed_out:
        print("[check_continue] ⛔ Interview terminated — moving to finalize")
        return {
            "interview_complete": True,
            "timeout":            True,
        }

    # Support turns do NOT count as a real question
    if is_support_turn:
        print("[check_continue] → support turn, looping back")
        return {
            "interview_complete": False,
            "timeout":            False,
        }

    # Normal completion condition
    if current_index >= max_questions:
        print("[check_continue] → max questions reached, finalizing")
        return {
            "interview_complete": True,
            "timeout":            False,
        }

    print(f"[check_continue] → continuing, next question #{current_index + 1}")
    return {
        "interview_complete": False,
        "timeout":            False,
    }


# ─────────────────────────────────────────────
# NODE 8: FINALIZE
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


def finalize(state: InterviewState) -> dict:
    print("[finalize] started")
    interview_id     = state.get("interview_id")
    user_id          = state.get("user_id")
    role             = state.get("role") or "Software Engineer"
    interview_type   = state.get("interview_type", "technical")
    candidate_name   = state.get("candidate_name", "the candidate")
    start_time       = state.get("start_time", int(time.time()))
    description      = state.get("description") or ""
    duration_seconds = int(time.time()) - start_time

    human_round              = is_human_round(interview_type)
    custom_config            = parse_custom_config(description)
    custom_topics: List[str] = custom_config.get("topics", [])
    difficulty_override: str = custom_config.get("difficulty_override", "")
    skill_dimensions         = get_skill_dimensions(interview_type)

    raw_history = client.lrange(f"interview:{interview_id}:history", 0, -1)
    history     = [json.loads(h) for h in raw_history]

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
        raw_scores    = [h.get("score", 0) for h in history]
        avg_score_10  = round(sum(raw_scores) / len(raw_scores), 1) if raw_scores else 0
        avg_score_100 = round(avg_score_10 * 10)

        extra_context_lines = ""
        if custom_topics and not human_round:
            extra_context_lines += f"\nFocus topics tested: {', '.join(custom_topics)}."
        if difficulty_override:
            extra_context_lines += f"\nSession difficulty setting: {difficulty_override}."
        clean_description = strip_custom_config(description)
        if clean_description:
            extra_context_lines += f"\nSession context: {clean_description[:400]}"

        skill_scores_schema = ",\n    ".join(
            f'"{dim}": <integer 0-100>' for dim in skill_dimensions
        )

        evaluation_criteria = (
            "Evaluate purely on BEHAVIORAL and interpersonal dimensions. "
            "Do NOT mention technical skills. Focus on communication quality, "
            "self-awareness, use of STAR structure, leadership, and culture fit."
            if human_round else
            "Evaluate on technical accuracy, depth, communication, and problem-solving."
        )

        prompt = f"""You are summarizing a completed {interview_type} interview for role: {role}.
Candidate: {candidate_name}
{extra_context_lines}

{evaluation_criteria}

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
    {skill_scores_schema}
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
                "overall_score":    max(
                    0,
                    min(
                        100,
                        round(float(parsed.get("overall_score", avg_score_100)))
                        if "overall_score" in parsed
                        else avg_score_100,
                    ),
                ),
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

    client.set(
        f"interview:{interview_id}:summary",
        json.dumps(summary_payload),
        ex=60 * 60 * 24 * 7,
    )

    publish_event(
        f"interview:{interview_id}:events",
        {"type": "interview_complete", "summary": summary_payload},
    )

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