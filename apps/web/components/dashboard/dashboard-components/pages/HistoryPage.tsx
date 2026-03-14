"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Types (mirror the controller response shapes) ────────────────────────────

interface QuestionEvaluation {
  overallScore:  number | null;
  clarity:       number | null;
  technical:     number | null;
  confidence:    number | null;
  feedback:      string | null;
  strengths:     string | null;
  improvements:  string | null;
}

interface QuestionResult {
  order:      number | null;
  content:    string;
  difficulty: string | null;   // Prisma Difficulty enum: EASY | MEDIUM | HARD
  score:      number | null;
  evaluation: QuestionEvaluation | null;
}

// Shape returned by GET /api/interview/:id/results
interface InterviewResult {
  overallScore:        number;
  technicalScore:      number;
  communicationScore:  number;
  problemSolvingScore: number;
  confidenceScore:     number;
  strengths:           string[];
  improvements:        string[];
  summary:             string;
  questions:           QuestionResult[];  // ← always present after backend fix
}

// Shape returned by GET /api/interview/history
interface InterviewSession {
  id:       string;
  title:    string;
  type:     string;
  status:   "completed" | "terminated" | "in_progress";
  score:    number | null;
  date:     string;
  duration: number | null;
  result:   InterviewResult | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

// FIX: use env var so this works outside localhost
const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000") + "/api";

const TYPE_FILTERS = ["All", "System Design", "Coding", "Behavioral"] as const;

const TYPE_COLOR: Record<string, string> = {
  "System Design": "#8b5cf6",
  "Coding":        "#06b6d4",
  "Behavioral":    "#f59e0b",
};
const TYPE_BG: Record<string, string> = {
  "System Design": "rgba(139,92,246,0.12)",
  "Coding":        "rgba(6,182,212,0.12)",
  "Behavioral":    "rgba(245,158,11,0.12)",
};

const DIFF_COLOR: Record<string, string> = {
  EASY:   "#34d399",
  MEDIUM: "#f59e0b",
  HARD:   "#ef4444",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(n: number | null) {
  if (n === null) return "#6b7280";
  if (n >= 80)   return "#34d399";
  if (n >= 60)   return "#f59e0b";
  return "#ef4444";
}
function scoreBg(n: number | null) {
  if (n === null) return "rgba(107,114,128,0.10)";
  if (n >= 80)   return "rgba(52,211,153,0.10)";
  if (n >= 60)   return "rgba(245,158,11,0.10)";
  return "rgba(239,68,68,0.10)";
}
function fmtDuration(secs: number | null) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m} min`;
}
function fmtDate(iso: string) {
  const d    = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60)     return "Just now";
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `Today, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  if (diff < 172800) return "Yesterday";
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}
function avg(nums: number[]) {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.05)", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ height: 13, borderRadius: 6, background: "rgba(255,255,255,0.06)", width: "52%" }} />
        <div style={{ height: 10, borderRadius: 6, background: "rgba(255,255,255,0.04)", width: "28%" }} />
      </div>
      <div style={{ width: 52, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 76 }: { score: number; size?: number }) {
  const r    = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={scoreColor(score)}
          strokeWidth="6"
          strokeDasharray={`${(score / 100) * circ} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.24, fontWeight: 800, color: scoreColor(score) }}>
        {score}
      </div>
    </div>
  );
}

// ─── Metric Bar ───────────────────────────────────────────────────────────────

function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(value) }}>{value}</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, background: scoreColor(value), borderRadius: 99, transition: "width 0.7s ease" }} />
      </div>
    </div>
  );
}

// ─── Question Card (inside drawer) ───────────────────────────────────────────

function QuestionCard({ q, index }: { q: QuestionResult; index: number }) {
  const [open, setOpen] = useState(false);
  const ev = q.evaluation;

  return (
    <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", overflow: "hidden", marginBottom: 8 }}>
      <div
        onClick={() => setOpen((p) => !p)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }}
      >
        <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#8b5cf6", flexShrink: 0 }}>
          {index + 1}
        </div>
        <div style={{ flex: 1, fontSize: 13, color: "#d1d5db", lineHeight: 1.5 }}>{q.content}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {q.difficulty && (
            <span style={{ fontSize: 10, fontWeight: 600, color: DIFF_COLOR[q.difficulty] ?? "#6b7280", background: `${DIFF_COLOR[q.difficulty] ?? "#6b7280"}18`, padding: "2px 7px", borderRadius: 99 }}>
              {q.difficulty}
            </span>
          )}
          {q.score !== null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(q.score) }}>{q.score}</span>
          )}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: "#4b5563", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {open && ev && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, margin: "14px 0" }}>
            {[
              { label: "Overall",   value: ev.overallScore },
              { label: "Technical", value: ev.technical },
              { label: "Clarity",   value: ev.clarity },
            ].map(({ label, value }) =>
              value !== null ? (
                <div key={label} style={{ textAlign: "center", padding: "10px 8px", borderRadius: 8, background: scoreBg(value), border: `1px solid ${scoreColor(value)}20` }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(value) }}>{value}</div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{label}</div>
                </div>
              ) : null,
            )}
          </div>
          {ev.feedback && (
            <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.65, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
              {ev.feedback}
            </div>
          )}
        </div>
      )}
      {open && !ev && (
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 12, color: "#4b5563" }}>
          No evaluation recorded for this question.
        </div>
      )}
    </div>
  );
}

// ─── Result Drawer ────────────────────────────────────────────────────────────

function ResultDrawer({
  session,
  loading,
  onClose,
}: {
  session:  InterviewSession;
  loading:  boolean;
  onClose:  () => void;
}) {
  const r = session.result;

  // FIX: safe accessor — r.questions may be undefined if the backend
  // hasn't been updated yet or returned a legacy shape.
  const questions: QuestionResult[] = r?.questions ?? [];

  const [tab, setTab] = useState<"overview" | "questions">("overview");

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", display: "flex", justifyContent: "flex-end" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(520px,100vw)", height: "100%", background: "#0f0f13", borderLeft: "1px solid rgba(255,255,255,0.08)", overflowY: "auto", display: "flex", flexDirection: "column" }}
      >
        {/* ── Drawer header ── */}
        <div style={{ padding: "24px 28px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: TYPE_COLOR[session.type] ?? "#8b5cf6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              {session.type}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#f3f4f6", lineHeight: 1.35, marginBottom: 6 }}>
              {session.title}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span>{fmtDate(session.date)}</span>
              <span>·</span>
              <span>{fmtDuration(session.duration)}</span>
              {session.status === "terminated"  && <span style={{ color: "#ef4444", fontWeight: 600 }}>· Terminated</span>}
              {session.status === "in_progress" && <span style={{ color: "#f59e0b", fontWeight: 600 }}>· In Progress</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#9ca3af", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* ── Tabs (only when result loaded) ── */}
        {!loading && r && (
          <div style={{ display: "flex", gap: 4, padding: "16px 28px 0" }}>
            {(["overview", "questions"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                  background: tab === t ? "rgba(139,92,246,0.15)" : "transparent",
                  color:      tab === t ? "#a78bfa" : "#6b7280",
                  transition: "all 0.15s",
                }}
              >
                {/* FIX: was r.questions.length → crash when questions is undefined */}
                {t === "overview" ? "Overview" : `Questions (${questions.length})`}
              </button>
            ))}
          </div>
        )}

        <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.06)", margin: "16px 0 0" }} />

        {/* ── Loading ── */}
        {loading && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, color: "#6b7280", fontSize: 13 }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Fetching results…
          </div>
        )}

        {/* ── No result ── */}
        {!loading && !r && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 40 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path d="M9 12h6M9 16h6M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2M9 4a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ fontSize: 14, color: "#4b5563", textAlign: "center" }}>No results available for this session.</div>
          </div>
        )}

        {/* ── Overview tab ── */}
        {!loading && r && tab === "overview" && (
          <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 24 }}>

            <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "20px 22px", background: "rgba(255,255,255,0.03)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)" }}>
              <ScoreRing score={r.overallScore} size={80} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#f3f4f6", marginBottom: 6 }}>Overall Score</div>
                <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.65 }}>{r.summary}</div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
                Score Breakdown
              </div>
              <MetricBar label="Technical"        value={r.technicalScore} />
              <MetricBar label="Communication"    value={r.communicationScore} />
              <MetricBar label="Problem Solving"  value={r.problemSolvingScore} />
              <MetricBar label="Confidence"       value={r.confidenceScore} />
            </div>

            {/* FIX: was r.strengths.length — guard against undefined */}
            {(r.strengths ?? []).length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Strengths</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(r.strengths ?? []).map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.14)", borderRadius: 10 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                        <path d="M20 6L9 17l-5-5" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span style={{ fontSize: 13, color: "#d1fae5", lineHeight: 1.5 }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FIX: was r.improvements.length — guard against undefined */}
            {(r.improvements ?? []).length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Areas to Improve</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(r.improvements ?? []).map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.14)", borderRadius: 10 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                        <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span style={{ fontSize: 13, color: "#fef3c7", lineHeight: 1.5 }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Questions tab ── */}
        {!loading && r && tab === "questions" && (
          <div style={{ padding: "20px 28px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
              Per-question breakdown
            </div>
            {/* FIX: use the safe `questions` local var (never undefined) */}
            {questions.length === 0 && (
              <div style={{ fontSize: 13, color: "#4b5563", textAlign: "center", padding: "32px 0" }}>
                No question data available.
              </div>
            )}
            {questions.map((q, i) => (
              // FIX: use stable key from order field, not array index
              <QuestionCard key={q.order ?? i} q={q} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Session Row ──────────────────────────────────────────────────────────────

function SessionRow({ s, onClick }: { s: InterviewSession; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderRadius: 12, cursor: "pointer", border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", transition: "background 0.15s, border-color 0.15s", marginBottom: 8 }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.09)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.02)"; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.05)"; }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: TYPE_BG[s.type] ?? "rgba(139,92,246,0.12)", border: `1px solid ${(TYPE_COLOR[s.type] ?? "#8b5cf6")}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {s.type === "System Design" && <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke={TYPE_COLOR[s.type]} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        {s.type === "Coding"        && <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6" stroke={TYPE_COLOR[s.type]} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        {s.type === "Behavioral"    && <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke={TYPE_COLOR[s.type]} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#f3f4f6", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: TYPE_COLOR[s.type] ?? "#8b5cf6", background: TYPE_BG[s.type] ?? "rgba(139,92,246,0.1)", padding: "2px 8px", borderRadius: 99 }}>{s.type}</span>
          <span style={{ fontSize: 11, color: "#6b7280" }}>{fmtDate(s.date)}</span>
          <span style={{ fontSize: 11, color: "#374151" }}>·</span>
          <span style={{ fontSize: 11, color: "#6b7280" }}>{fmtDuration(s.duration)}</span>
          {s.status === "terminated"  && <span style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", background: "rgba(239,68,68,0.1)",   padding: "2px 8px", borderRadius: 99 }}>Terminated</span>}
          {s.status === "in_progress" && <span style={{ fontSize: 11, fontWeight: 600, color: "#f59e0b", background: "rgba(245,158,11,0.1)", padding: "2px 8px", borderRadius: 99 }}>In Progress</span>}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {s.score !== null ? (
          <div style={{ minWidth: 52, textAlign: "center", padding: "6px 12px", borderRadius: 8, background: scoreBg(s.score), border: `1px solid ${scoreColor(s.score)}22` }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(s.score), lineHeight: 1 }}>{s.score}</div>
            <div style={{ fontSize: 9, color: scoreColor(s.score), opacity: 0.65, marginTop: 2 }}>/ 100</div>
          </div>
        ) : (
          <div style={{ minWidth: 52, textAlign: "center", padding: "6px 12px", borderRadius: 8, background: "rgba(107,114,128,0.08)", border: "1px solid rgba(107,114,128,0.15)" }}>
            <div style={{ fontSize: 12, color: "#4b5563" }}>—</div>
          </div>
        )}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: "#374151" }}>
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter();

  const [sessions,     setSessions]     = useState<InterviewSession[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [search,       setSearch]       = useState("");
  const [drawerSess,   setDrawerSess]   = useState<InterviewSession | null>(null);
  const [drawerLoad,   setDrawerLoad]   = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/interview/history`, { credentials: "include" });
      if (res.status === 401) { router.push("/login"); return; }
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: InterviewSession[] = (await res.json()).map((s: any) => ({ ...s, result: null }));
      setSessions(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const openDrawer = useCallback(async (s: InterviewSession) => {
    setDrawerSess(s);
    if (s.result) return;

    setDrawerLoad(true);
    try {
      const res = await fetch(`${BASE}/interview/${s.id}/results`, { credentials: "include" });
      if (!res.ok) throw new Error("Results unavailable");
      const result: InterviewResult = await res.json();

      // FIX: always guarantee questions is an array even if the backend
      // somehow omits it (belt-and-suspenders guard alongside the backend fix)
      const safeResult: InterviewResult = {
        ...result,
        questions:    Array.isArray(result.questions)    ? result.questions    : [],
        strengths:    Array.isArray(result.strengths)    ? result.strengths    : [],
        improvements: Array.isArray(result.improvements) ? result.improvements : [],
      };

      setSessions((prev) => prev.map((p) => p.id === s.id ? { ...p, result: safeResult } : p));
      setDrawerSess((prev) => prev?.id === s.id ? { ...prev, result: safeResult } : prev);
    } catch {
      // stays null — drawer shows empty state
    } finally {
      setDrawerLoad(false);
    }
  }, []);

  const completed = sessions.filter((s) => s.status === "completed");
  const scores    = completed.map((s) => s.score).filter((x): x is number => x !== null);
  const avgScore  = avg(scores);
  const bestScore = scores.length ? Math.max(...scores) : null;
  const bestType  = bestScore !== null ? (completed.find((s) => s.score === bestScore)?.type ?? "—") : "—";
  const totalHrs  = ((sessions.reduce((a, s) => a + (s.duration ?? 0), 0)) / 3600).toFixed(1);

  const filtered = sessions.filter((s) => {
    const matchType   = activeFilter === "All" || s.type === activeFilter;
    const matchSearch = !search.trim() || s.title.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const handleExport = () => {
    const rows = [
      ["Title", "Type", "Score", "Date", "Duration", "Status"],
      ...sessions.map((s) => [s.title, s.type, s.score ?? "—", new Date(s.date).toLocaleDateString(), fmtDuration(s.duration), s.status]),
    ];
    const blob = new Blob([rows.map((r) => r.map(String).join(",")).join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "interview_history.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {drawerSess && (
        <ResultDrawer
          session={drawerSess}
          loading={drawerLoad}
          onClose={() => { setDrawerSess(null); setDrawerLoad(false); }}
        />
      )}

      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">Session <em>History</em></div>
          <div className="dash-date">
            {loading ? "Loading sessions…" : `${sessions.length} total · Avg score ${avgScore || "—"}`}
          </div>
        </div>
        <div className="topbar-actions">
          <button className="resume-action-btn" onClick={handleExport} disabled={loading || !sessions.length}>📥 Export CSV</button>
          <button className="resume-action-btn" onClick={fetchHistory} disabled={loading} style={{ opacity: loading ? 0.5 : 1 }}>{loading ? "…" : "↻ Refresh"}</button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 20, padding: "14px 20px", borderRadius: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>⚠ {error}</span>
          <button onClick={fetchHistory} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Retry</button>
        </div>
      )}

      <div className="stats-grid">
        <div className="dash-stat-card anim-0">
          <div className="dash-stat-top"><span className="stat-card-dot dot-accent" /><span className="dash-stat-label">Total Sessions</span></div>
          <div className="dash-stat-value">{loading ? <span style={{ color: "#374151" }}>—</span> : <>{sessions.length}<span className="dash-stat-unit">done</span></>}</div>
          <div className="dash-stat-delta">{completed.length} completed</div>
        </div>
        <div className="dash-stat-card anim-1">
          <div className="dash-stat-top"><span className="stat-card-dot dot-gold" /><span className="dash-stat-label">Avg Score</span></div>
          <div className="dash-stat-value">{loading ? <span style={{ color: "#374151" }}>—</span> : <>{avgScore || "—"}<span className="dash-stat-unit">/ 100</span></>}</div>
          <div className="dash-stat-delta">{scores.length} scored sessions</div>
        </div>
        <div className="dash-stat-card anim-2">
          <div className="dash-stat-top"><span className="stat-card-dot dot-violet" /><span className="dash-stat-label">Best Score</span></div>
          <div className="dash-stat-value">{loading ? <span style={{ color: "#374151" }}>—</span> : <>{bestScore ?? "—"}<span className="dash-stat-unit">/ 100</span></>}</div>
          <div className="dash-stat-delta">{bestType}</div>
        </div>
        <div className="dash-stat-card anim-3">
          <div className="dash-stat-top"><span className="stat-card-dot dot-accent" /><span className="dash-stat-label">Total Time</span></div>
          <div className="dash-stat-value">{loading ? <span style={{ color: "#374151" }}>—</span> : <>{totalHrs}<span className="dash-stat-unit">hrs</span></>}</div>
          <div className="dash-stat-delta">Across all sessions</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">All Sessions</div>
            <div className="panel-sub">{loading ? "Loading…" : `${filtered.length} result${filtered.length !== 1 ? "s" : ""}`}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.25rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
            {TYPE_FILTERS.map((f) => (
              <button key={f} className={`history-filter-btn ${activeFilter === f ? "active" : ""}`} onClick={() => setActiveFilter(f)}>{f}</button>
            ))}
          </div>
          <div style={{ position: "relative" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#4b5563", pointerEvents: "none" }}>
              <path d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text" placeholder="Search sessions…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32, paddingRight: 14, paddingTop: 8, paddingBottom: 8, fontSize: 13, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f3f4f6", outline: "none", width: 200 }}
            />
          </div>
        </div>

        <div className="session-list">
          {loading && [...Array(5)].map((_, i) => <SkeletonRow key={i} />)}

          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: "48px 0", textAlign: "center" }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto 14px", display: "block" }}>
                <path d="M9 12h6M9 16h6M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2M9 4a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{ fontSize: 14, color: "#4b5563" }}>
                {search ? `No sessions matching "${search}"` : "No interviews yet. Start your first session!"}
              </div>
            </div>
          )}

          {!loading && filtered.map((s) => (
            <SessionRow key={s.id} s={s} onClick={() => openDrawer(s)} />
          ))}
        </div>
      </div>
    </>
  );
}