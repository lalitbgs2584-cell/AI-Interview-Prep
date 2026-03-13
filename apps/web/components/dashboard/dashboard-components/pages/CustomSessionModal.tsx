"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type InterviewType = "TECHNICAL" | "HR" | "SYSTEM_DESIGN" | "BEHAVIORAL";
type Difficulty    = "easy" | "medium" | "hard";

interface Props {
  isOpen:  boolean;
  onClose: () => void;
}

// ─── Static data ──────────────────────────────────────────────────────────────

const INTERVIEW_TYPES: { value: InterviewType; label: string; desc: string }[] = [
  { value: "TECHNICAL",     label: "Technical",     desc: "DSA, coding, algorithms" },
  { value: "SYSTEM_DESIGN", label: "System Design", desc: "Architecture & scalability" },
  { value: "BEHAVIORAL",    label: "Behavioral",    desc: "STAR-method, culture fit" },
  { value: "HR",            label: "HR Round",      desc: "Salary, career, soft skills" },
];

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "easy",   label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard",   label: "Hard" },
];

const TOPIC_SUGGESTIONS: Record<InterviewType, string[]> = {
  TECHNICAL: [
    "Arrays","Strings","Two Pointers","Sliding Window","Linked Lists",
    "Binary Trees","BST","Tries","Graphs","BFS","DFS","Topological Sort",
    "Union Find","Dynamic Programming","Recursion","Backtracking","Memoization",
    "Sorting","Binary Search","Hash Maps","Heaps","Stacks","Queues",
    "Bit Manipulation","Greedy","Intervals","Monotonic Stack",
  ],
  SYSTEM_DESIGN: [
    "URL Shortener","Rate Limiter","Chat App","News Feed","Notification Service",
    "Search Autocomplete","Pastebin","Load Balancer","CDN","Caching",
    "Distributed Cache","SQL vs NoSQL","Database Sharding","Replication",
    "Twitter Clone","YouTube","Uber / Ride Sharing","Google Drive",
    "Payment System","E-commerce Platform","API Gateway","Message Queue",
    "Microservices vs Monolith","CAP Theorem","Consistent Hashing",
    "Event-Driven Architecture",
  ],
  BEHAVIORAL: [
    "Leadership","Taking Initiative","Ownership & Accountability",
    "Mentoring Others","Conflict Resolution","Disagreeing with a Manager",
    "Cross-team Collaboration","Dealing with Difficult Teammates",
    "Failure & Learnings","Handling Ambiguity","Adaptability",
    "Working Under Pressure","Meeting a Tight Deadline","Biggest Achievement",
    "Going Beyond Your Role","Improving a Process","Teamwork",
    "Giving Feedback","Receiving Feedback",
  ],
  HR: [
    "Why This Company","Why This Role","Career Goals",
    "Where Do You See Yourself in 5 Years","Company Culture",
    "Strengths","Weaknesses","What Makes You Unique",
    "How Do You Handle Criticism","Work Style","Salary Negotiation",
    "Notice Period","Relocation","Work-Life Balance",
    "Remote vs On-site Preference","How Do You Prioritize Tasks",
    "Handling Multiple Deadlines","How Do You Stay Updated in Your Field",
  ],
};

// ─── Description builder ──────────────────────────────────────────────────────
//
// The Python node reads state.description and looks for a machine-readable
// config block packed at the front, followed by human-readable context.
//
// Block format:
//   __CUSTOM_CONFIG__{"max_questions":8,"difficulty_override":"hard","topics":["Redis"]}__END_CONFIG__
//   Focus topics: Redis.
//   Candidate notes: <notes>
//   Job Description:
//   <jd>

function buildDescription(
  topics:        string[],
  notes:         string,
  jdText:        string,
  difficulty:    Difficulty,
  questionCount: number,
): string {
  // 1. Machine-readable config block (parsed by Python's parse_custom_config)
  const configBlock =
    `__CUSTOM_CONFIG__${JSON.stringify({
      max_questions:      questionCount,
      difficulty_override: difficulty,
      topics,
    })}__END_CONFIG__`;

  // 2. Human-readable context (used verbatim in prompts)
  const parts: string[] = [configBlock];
  if (topics.length > 0) parts.push(`Focus topics: ${topics.join(", ")}.`);
  if (notes.trim())      parts.push(`Candidate notes: ${notes.trim()}`);
  if (jdText.trim())     parts.push(`Job Description:\n${jdText.trim()}`);

  return parts.join("\n\n");
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function CustomSessionModal({ isOpen, onClose }: Props) {
  const router = useRouter();

  const [step,          setStep]          = useState<1 | 2 | 3>(1);
  const [title,         setTitle]         = useState("");
  const [type,          setType]          = useState<InterviewType | "">("");
  const [difficulty,    setDifficulty]    = useState<Difficulty | "">("");
  const [questionCount, setQuestionCount] = useState(10);
  const [topics,        setTopics]        = useState<string[]>([]);
  const [customTopic,   setCustomTopic]   = useState("");
  const [notes,         setNotes]         = useState("");
  const [jdText,        setJdText]        = useState("");

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  if (!isOpen) return null;

  const suggestions = type ? TOPIC_SUGGESTIONS[type as InterviewType] : [];
  const extraTopics = topics.filter((t) => !suggestions.includes(t));

  const toggleTopic = (t: string) =>
    setTopics((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  const addCustomTopic = () => {
    const trimmed = customTopic.trim();
    if (trimmed && !topics.includes(trimmed)) setTopics((prev) => [...prev, trimmed]);
    setCustomTopic("");
  };

  const canNext   = type !== "" && difficulty !== "";
  const canSubmit = canNext && title.trim() !== "";

  const handleStartInterview = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!canSubmit || loading || !difficulty) return;
    setError("");
    setLoading(true);

    try {
      const description = buildDescription(
        topics,
        notes,
        jdText,
        difficulty as Difficulty,
        questionCount,
      );

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/start-interview`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // ── Maps directly to InterviewState fields ─────────────────────
            interviewTitle: title.trim(),   // → state.role
            interviewType:  type,           // → state.interview_type
            description,                   // → state.description (carries config + context)
          }),
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message ?? "Failed to start interview");
      }

      const result = await response.json();
      const interviewId = result.data.id;

      router.push(
        `/waiting-room?type=${encodeURIComponent(type)}&title=${encodeURIComponent(title.trim())}&id=${encodeURIComponent(interviewId)}`
      );
    } catch (err: any) {
      console.error("[start-interview]", err);
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="csm-backdrop" onClick={onClose} />

      <div className="csm-container" role="dialog" aria-modal="true" aria-label="Custom Session Setup">

        {/* ── Header ── */}
        <div className="csm-header">
          <div>
            <div className="csm-title">Custom Session</div>
            <div className="csm-subtitle">Configure your interview practice</div>
          </div>
          <button className="csm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Step indicators ── */}
        <div className="csm-steps" role="list" aria-label="Steps">
          {(["Setup", "Topics", "Job Description"] as const).map((label, idx) => {
            const n = idx + 1 as 1 | 2 | 3;
            return (
              <div key={n} style={{ display: "flex", alignItems: "center", flex: idx < 2 ? 1 : "none" }}>
                <div className={`csm-step ${step >= n ? "active" : ""}`} role="listitem">
                  <span className="csm-step-num">{n}</span>
                  <span className="csm-step-label">{label}</span>
                </div>
                {idx < 2 && <div className="csm-step-line" />}
              </div>
            );
          })}
        </div>

        {/* ── Body ── */}
        <div className="csm-body">

          {/* ────────────── Step 1: Setup ────────────── */}
          {step === 1 && (
            <div className="csm-step-content">

              <div className="csm-field">
                <label className="csm-label">Role / Session Title</label>
                <input
                  className="csm-input"
                  placeholder="e.g. Senior Software Engineer at Google"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="csm-field">
                <label className="csm-label">Interview Type</label>
                <div className="csm-type-grid">
                  {INTERVIEW_TYPES.map((t) => (
                    <button
                      key={t.value}
                      className={`csm-type-card ${type === t.value ? "selected" : ""}`}
                      onClick={() => { setType(t.value); setTopics([]); }}
                    >
                      <span className="csm-type-name">{t.label}</span>
                      <span className="csm-type-desc">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="csm-field">
                <label className="csm-label">Difficulty</label>
                <div className="csm-diff-row">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.value}
                      className={`csm-diff-btn csm-diff-${d.value} ${difficulty === d.value ? "selected" : ""}`}
                      onClick={() => setDifficulty(d.value)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="csm-field">
                <label className="csm-label">
                  Number of Questions&nbsp;
                  <span className="csm-count-badge">{questionCount}</span>
                </label>
                <input
                  type="range" min={3} max={15} step={1}
                  value={questionCount}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setQuestionCount(v);
                    e.target.style.setProperty("--val", `${((v - 3) / 12) * 100}%`);
                  }}
                  style={{ "--val": `${((questionCount - 3) / 12) * 100}%` } as React.CSSProperties}
                  className="csm-range"
                />
                <div className="csm-range-labels">
                  <span>3</span><span>9</span><span>15</span>
                </div>
              </div>
            </div>
          )}

          {/* ────────────── Step 2: Topics ────────────── */}
          {step === 2 && (
            <div className="csm-step-content">

              <div className="csm-field">
                <label className="csm-label">
                  Focus Topics <span className="csm-optional">(optional — helps AI prioritise)</span>
                </label>
                <div className="csm-chips">
                  {suggestions.map((t) => (
                    <button
                      key={t}
                      className={`csm-chip ${topics.includes(t) ? "selected" : ""}`}
                      onClick={() => toggleTopic(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="csm-field">
                <label className="csm-label">Add Custom Topic</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    className="csm-input"
                    placeholder="e.g. Kafka, Redis, Segment Trees…"
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustomTopic()}
                  />
                  <button
                    className="csm-btn-primary"
                    style={{ padding: "0 16px", flexShrink: 0, boxShadow: "none" }}
                    onClick={addCustomTopic}
                    disabled={!customTopic.trim()}
                  >
                    Add
                  </button>
                </div>
              </div>

              {extraTopics.length > 0 && (
                <div className="csm-field">
                  <label className="csm-label">Your Custom Topics</label>
                  <div className="csm-chips">
                    {extraTopics.map((t) => (
                      <button
                        key={t}
                        className="csm-chip selected"
                        onClick={() => setTopics((prev) => prev.filter((x) => x !== t))}
                        style={{ display: "flex", alignItems: "center", gap: "5px" }}
                      >
                        {t}
                        <span style={{ opacity: 0.5, fontSize: "0.65rem" }}>✕</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="csm-field">
                <label className="csm-label">
                  Candidate Notes <span className="csm-optional">(optional)</span>
                </label>
                <textarea
                  className="csm-textarea"
                  placeholder="Weak points, specific areas to focus on, anything the AI should know about you…"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ────────────── Step 3: JD + Review ────────────── */}
          {step === 3 && (
            <div className="csm-step-content">

              <div className="csm-field">
                <label className="csm-label">
                  Job Description <span className="csm-optional">(optional)</span>
                </label>
                <p className="csm-jd-hint">
                  AI reads the JD and automatically tailors every question to this specific role and company.
                </p>
                <textarea
                  className="csm-textarea"
                  placeholder="Paste the full job description here…"
                  rows={6}
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                />
              </div>

              <div className="csm-field">
                <label className="csm-label">Session Summary</label>
                <div className="csm-summary">
                  <div className="csm-summary-row">
                    <span>Role</span>
                    <span>{title}</span>
                  </div>
                  <div className="csm-summary-row">
                    <span>Type</span>
                    <span>{INTERVIEW_TYPES.find((t) => t.value === type)?.label ?? type}</span>
                  </div>
                  <div className="csm-summary-row">
                    <span>Difficulty</span>
                    <span style={{
                      color: difficulty === "easy" ? "#4ade80"
                           : difficulty === "hard" ? "#f87171"
                           : "#fbbf24",
                    }}>
                      {difficulty ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1) : "—"}
                    </span>
                  </div>
                  <div className="csm-summary-row">
                    <span>Questions</span>
                    <span>{questionCount}</span>
                  </div>
                  {topics.length > 0 && (
                    <div className="csm-summary-row">
                      <span>Topics</span>
                      <span style={{ maxWidth: "60%", lineHeight: 1.5 }}>{topics.join(", ")}</span>
                    </div>
                  )}
                  {notes.trim() && (
                    <div className="csm-summary-row">
                      <span>Notes</span>
                      <span style={{ color: "#4ade80" }}>✓ Added</span>
                    </div>
                  )}
                  {jdText.trim() && (
                    <div className="csm-summary-row">
                      <span>Job Description</span>
                      <span style={{ color: "#4ade80" }}>✓ Added</span>
                    </div>
                  )}
                </div>
              </div>

              {error && <div className="csm-error">{error}</div>}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="csm-footer">
          {step > 1 && (
            <button
              className="csm-btn-back"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              disabled={loading}
            >
              ← Back
            </button>
          )}
          {step < 3 ? (
            <button
              className="csm-btn-primary"
              disabled={step === 1 ? !canNext : false}
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
            >
              Next →
            </button>
          ) : (
            <button
              className="csm-btn-primary"
              disabled={!canSubmit || loading}
              onClick={handleStartInterview}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
                    <path d="M12 2a10 10 0 0110 10" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  Starting…
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </span>
              ) : "Start Session →"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}