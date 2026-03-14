"use client";

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryItem {
  id: string;
  title: string;
  type: string;         // "Coding" | "Behavioral" | "System Design"
  status: string;       // "completed" | "in_progress" | "terminated"
  score: number | null;
  date: string;         // ISO
  duration: number | null;
}

interface UnifiedResult {
  role: string;
  interview_type: string;
  date_iso: string;
  recommendation: string;
  overall_score: number;
  skill_scores: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
}

interface Milestone {
  label: string;
  sub: string;
  done: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function dayLabel(iso: string) {
  return ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][new Date(iso).getDay()];
}

function scoreColor(s: number | null): string {
  if (s == null) return "var(--muted)";
  if (s >= 75) return "#2bba8a";
  if (s >= 50) return "#e09b30";
  return "#e04040";
}

function barGradient(s: number): string {
  if (s >= 75) return "linear-gradient(180deg,#2bba8a,#1a7a50)";
  if (s >= 50) return "linear-gradient(180deg,#e09b30,#b07010)";
  return "linear-gradient(180deg,#e04040,#a02020)";
}

function skillBarColor(s: number): string {
  if (s >= 75) return "#2bba8a";
  if (s >= 50) return "#4f8ef7";
  return "#e09b30";
}

function iconMeta(type: string): { label: string; bg: string; color: string } {
  if (type === "Coding")        return { label: "DEV", bg: "rgba(79,142,247,.14)",  color: "#4878d4" };
  if (type === "System Design") return { label: "SYS", bg: "rgba(224,155,48,.14)",  color: "#a07010" };
  return                               { label: "BEH", bg: "rgba(155,109,219,.14)", color: "#7a50b8" };
}

function computeStreak(completed: HistoryItem[]): number {
  if (!completed.length) return 0;
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toDateString();
    if (completed.some(iv => new Date(iv.date).toDateString() === ds)) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function buildMilestones(
  items: HistoryItem[],
  latestResult: UnifiedResult | null,
): Milestone[] {
  const completed = items.filter(i => i.status === "completed");
  const scores    = items.map(i => i.score).filter((s): s is number => s !== null);
  const avg       = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const best      = scores.length ? Math.max(...scores) : 0;
  const types     = new Set(completed.map(i => i.type));
  const streak    = computeStreak(completed);
  const first     = completed[completed.length - 1]; // history is desc-ordered

  return [
    {
      label: "First session completed",
      sub:   first ? fmtDate(first.date) : "—",
      done:  completed.length > 0,
    },
    {
      label: "5-day active streak",
      sub:   streak >= 5
        ? `${streak} days active`
        : `${streak} day${streak !== 1 ? "s" : ""} active — ${5 - streak} to go`,
      done: streak >= 5,
    },
    {
      label: "Score 75+ in any session",
      sub:   best >= 75 ? `Best: ${best}` : `Best so far: ${best || "—"}`,
      done:  best >= 75,
    },
    {
      label: "10 sessions completed",
      sub:   completed.length >= 10 ? `${completed.length} done` : `${completed.length} of 10`,
      done:  completed.length >= 10,
    },
    {
      label: "Try all 3 interview types",
      sub:   `${types.size} of 3 covered`,
      done:  types.size >= 3,
    },
    {
      label: '"Strong Hire" recommendation',
      sub:   latestResult?.recommendation === "Strong Hire"
        ? "Achieved!"
        : `Latest: ${latestResult?.recommendation ?? "—"}`,
      done: latestResult?.recommendation === "Strong Hire",
    },
    {
      label: "Average score 80+",
      sub:   avg >= 80 ? `Avg: ${avg}` : `Currently at ${avg || "—"}`,
      done:  avg >= 80,
    },
  ];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  dot, label, value, delta,
}: {
  dot: string; label: string; value: string; delta: string;
}) {
  return (
    <div className="dash-stat-card">
      <div className="dash-stat-top">
        <span className={`stat-card-dot ${dot}`} />
        <span className="dash-stat-label">{label}</span>
      </div>
      <div className="dash-stat-value">{value}</div>
      <div className="dash-stat-delta">{delta}</div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="dash-stat-card" style={{ opacity: 0.45 }}>
      <div className="dash-stat-top">
        <span className="stat-card-dot dot-accent" />
        <span className="dash-stat-label">—</span>
      </div>
      <div className="dash-stat-value">—</div>
      <div className="dash-stat-delta">—</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProgressPage() {
  const [items,        setItems]        = useState<HistoryItem[]>([]);
  const [latestResult, setLatestResult] = useState<UnifiedResult | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        // 1. Interview history — provides score, type, status, date for all panels.
        //    score here = averaged InterviewQuestion.score from DB (already computed
        //    in interviewHistory controller, no extra fetch needed).
        const histRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/interview/history`, { credentials: "include" });
        if (histRes.status === 404) {
          // No history yet — treat as empty rather than an error
          setItems([]);
          return;
        }
        if (!histRes.ok) throw new Error(`History fetch failed: ${histRes.status}`);
        const data: HistoryItem[] = await histRes.json();
        setItems(data);

        // 2. Full UnifiedInterviewResult for the latest completed session only.
        //    Used for: skill_scores (breakdown panel), recommendation (verdict card),
        //    role + interview_type + date_iso (breakdown panel header).
        const latestCompleted = data.find(i => i.status === "completed");
        if (latestCompleted) {
          const resRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/interview/${latestCompleted.id}/results`, {
            credentials: "include",
          });
          if (resRes.ok) setLatestResult(await resRes.json());
        }
      } catch (e: any) {
        setError(e.message ?? "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Derived values (all computed from real fetched data) ────────────────────
  const completed   = items.filter(i => i.status === "completed");
  const scores      = items.map(i => i.score).filter((s): s is number => s !== null);
  const avg         = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const best        = scores.length ? Math.max(...scores) : null;
  const bestItem    = items.find(i => i.score === best);
  const streak      = computeStreak(completed);

  // Trend bars — up to 8 most recent completed sessions with a score, asc for L→R chart
  const trendBars   = items.filter(i => i.status === "completed" && i.score !== null).slice(0, 8).reverse();
  const maxBarScore = trendBars.length ? Math.max(...trendBars.map(i => i.score!), 1) : 1;
  const trendDir    = trendBars.length >= 2
    ? trendBars[trendBars.length - 1]?.score! > trendBars[0]?.score! ? "▲ Improving"
    : trendBars[trendBars.length - 1]?.score! < trendBars[0]?.score! ? "▼ Declining"
    : "→ Stable"
    : "Latest";

  const milestones  = buildMilestones(items, latestResult);
  const doneCount   = milestones.filter(m => m.done).length;
  const skillScores = latestResult?.skill_scores ?? {};

  // ── Error state ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <>
        <div className="dash-topbar">
          <div>
            <div className="dash-greeting">Your <em>Progress</em></div>
            <div className="dash-date">Track your growth over time</div>
          </div>
        </div>
        <div className="panel" style={{ textAlign: "center", padding: "2rem" }}>
          <div style={{ color: "var(--rose)", fontWeight: 500, marginBottom: 8 }}>Failed to load</div>
          <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{error}</div>
        </div>
      </>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Top bar */}
      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">Your <em>Progress</em></div>
          <div className="dash-date">Track your growth over time</div>
        </div>
      </div>

      {/* ── 5 Stat cards ── */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              dot="dot-accent"
              label="Sessions"
              value={String(completed.length)}
              delta={`${items.length} total`}
            />
            <StatCard
              dot="dot-gold"
              label="Best score"
              value={best != null ? String(best) : "—"}
              delta={bestItem?.title ?? "No scores yet"}
            />
            <StatCard
              dot="dot-violet"
              label="Avg. score"
              value={avg != null ? String(avg) : "—"}
              delta={`${scores.length} scored session${scores.length !== 1 ? "s" : ""}`}
            />
            <StatCard
              dot="dot-teal"
              label="Streak"
              value={`${streak}d`}
              delta="Consecutive days"
            />
            <StatCard
              dot="dot-rose"
              label="Verdict"
              value={latestResult?.recommendation ?? "—"}
              delta="Latest session"
            />
          </>
        )}
      </div>

      {/* ── Score trend bars ── */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Score trend</div>
            <div className="panel-sub">
              {loading
                ? "Loading…"
                : `Last ${trendBars.length} completed session${trendBars.length !== 1 ? "s" : ""}`}
            </div>
          </div>
          <span className="tag tag-accent">{loading ? "…" : trendDir}</span>
        </div>

        {loading ? (
          <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>Loading…</span>
          </div>
        ) : trendBars.length === 0 ? (
          <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>No completed sessions yet</span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "0.65rem", alignItems: "flex-end", height: 120, padding: "0 0.25rem" }}>
            {trendBars.map((b, i) => {
              const h = Math.max(8, Math.round((b.score! / maxBarScore) * 88));
              return (
                <div
                  key={i}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}
                >
                  <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.6rem", color: "var(--muted)" }}>
                    {b.score}
                  </span>
                  <div style={{
                    width: "100%",
                    borderRadius: "var(--r-sm) var(--r-sm) 0 0",
                    height: `${h}px`,
                    background: barGradient(b.score!),
                    opacity: 0.88,
                    transition: "height 0.7s var(--ease-snap)",
                  }} />
                  <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.6rem", color: "var(--muted)" }}>
                    {dayLabel(b.date)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Skill breakdown — only shown when latest result has skill_scores ── */}
      {!loading && Object.keys(skillScores).length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Skill breakdown</div>
              <div className="panel-sub">
                {latestResult
                  ? `${latestResult.interview_type} · ${fmtDate(latestResult.date_iso)}`
                  : "Latest completed session"}
              </div>
            </div>
            <span className="tag tag-accent">{latestResult?.role ?? "—"}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {Object.entries(skillScores).map(([name, score]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                <span style={{ fontSize: "0.73rem", color: "var(--muted)", width: 130, flexShrink: 0 }}>
                  {name}
                </span>
                <div style={{
                  flex: 1, height: 6,
                  background: "var(--bg2)",
                  borderRadius: 99, overflow: "hidden",
                  border: "1px solid var(--border)",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, score)}%`,
                    background: skillBarColor(score),
                    borderRadius: 99,
                    transition: "width 0.8s ease",
                  }} />
                </div>
                <span style={{
                  fontSize: "0.72rem", fontWeight: 500,
                  width: 28, textAlign: "right",
                  color: skillBarColor(score),
                }}>
                  {score}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent interviews ── */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Recent interviews</div>
            <div className="panel-sub">{loading ? "Loading…" : `${items.length} total`}</div>
          </div>
        </div>

        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: "0.8rem", padding: "0.5rem 0" }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: "0.8rem", padding: "0.5rem 0", textAlign: "center" }}>
            No history found
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {items.slice(0, 7).map(iv => {
              const ic = iconMeta(iv.type);
              return (
                <div
                  key={iv.id}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.7rem",
                    padding: "0.55rem 0.65rem",
                    borderRadius: "var(--r-md)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: ic.bg, color: ic.color,
                    fontSize: "0.62rem", fontWeight: 600,
                  }}>
                    {ic.label}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "0.8rem", fontWeight: 500,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {iv.title}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>
                      {iv.type} · {fmtDate(iv.date)}
                    </div>
                  </div>
                  {iv.score != null ? (
                    <span style={{
                      marginLeft: "auto", padding: "2px 9px", borderRadius: 99,
                      fontSize: "0.68rem", fontWeight: 600, flexShrink: 0,
                      background: iv.score >= 75 ? "rgba(43,186,138,.13)"
                        : iv.score >= 50 ? "rgba(224,155,48,.13)"
                        : "rgba(220,60,60,.13)",
                      color: scoreColor(iv.score),
                    }}>
                      {iv.score}
                    </span>
                  ) : (
                    <span style={{
                      marginLeft: "auto", padding: "2px 9px", borderRadius: 99,
                      fontSize: "0.62rem", fontWeight: 500, flexShrink: 0,
                      background: "var(--bg2)", color: "var(--muted)",
                      border: "1px solid var(--border)",
                    }}>
                      {iv.status === "completed" ? "N/A" : iv.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Milestones ── */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Milestones</div>
            <div className="panel-sub">
              {loading ? "Computing…" : `${doneCount} of ${milestones.length} achieved`}
            </div>
          </div>
        </div>

        <div className="milestone-list">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="milestone-item" style={{ opacity: 0.4 }}>
                  <div className="milestone-check todo">○</div>
                  <div>
                    <div className="milestone-label">—</div>
                    <div className="milestone-sub">—</div>
                  </div>
                </div>
              ))
            : milestones.map((m, i) => (
                <div key={i} className="milestone-item">
                  <div className={`milestone-check ${m.done ? "done" : "todo"}`}>
                    {m.done ? "✓" : "○"}
                  </div>
                  <div>
                    <div
                      className="milestone-label"
                      style={{ color: m.done ? "var(--text)" : "var(--text-3)" }}
                    >
                      {m.label}
                    </div>
                    <div className="milestone-sub">{m.sub}</div>
                  </div>
                  {m.done && (
                    <span className="tag tag-gold" style={{ marginLeft: "auto" }}>Done</span>
                  )}
                </div>
              ))}
        </div>
      </div>
    </>
  );
}