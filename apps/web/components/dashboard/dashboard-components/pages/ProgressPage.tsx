"use client";

import { useEffect, useState } from "react";
import { ProgressRadarPanel } from "./progress-visuals";

// """ Types """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

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
  summary?: string;
  recommendation: string;
  overall_score: number;
  skill_scores: Record<string, number>;
  score_pillars?: Record<string, number>;
  question_scores?: Array<{
    index: number;
    score: number;
    difficulty: string;
    question: string;
    user_answer?: string;
    feedback: string;
    strengths: string[];
    weaknesses: string[];
    dimensions?: Record<string, number>;
  }>;
  analytics?: {
    filler_summary?: Record<string, any>;
    flow_summary?: Record<string, any>;
    confidence_summary?: Record<string, any>;
  };
  final_improvement_plan?: {
    top_strengths: string[];
    top_weaknesses: string[];
    practice_next: string[];
  };
  coaching_priorities?: string[];
  recovery_score?: number;
  pressure_handling_score?: number;
  conciseness_score?: number;
  strengths: string[];
  weaknesses: string[];
}

interface Milestone {
  label: string;
  sub: string;
  done: boolean;
}

interface ChecklistItem {
  label: string;
  sub: string;
  done: boolean;
}

// """ Helpers """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

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
      sub:   first ? fmtDate(first.date) : "",
      done:  completed.length > 0,
    },
    {
      label: "5-day active streak",
      sub:   streak >= 5
        ? `${streak} days active`
        : `${streak} day${streak !== 1 ? "s" : ""} active - ${5 - streak} to go`,
      done: streak >= 5,
    },
    {
      label: "Score 75+ in any session",
      sub:   best >= 75 ? `Best: ${best}` : `Best so far: ${best || 0}`,
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
        : `Latest: ${latestResult?.recommendation ?? "Not available"}`,
      done: latestResult?.recommendation === "Strong Hire",
    },
    {
      label: "Average score 80+",
      sub:   avg >= 80 ? `Avg: ${avg}` : `Currently at ${avg || 0}`,
      done:  avg >= 80,
    },
  ];
}

function buildFeatureChecklist(
  items: HistoryItem[],
  latestResult: UnifiedResult | null,
): ChecklistItem[] {
  const hasReplay = items.some(i => i.status !== "in_progress");
  const hasBreakdown = Boolean(latestResult?.score_pillars && Object.keys(latestResult.score_pillars).length > 0);
  const hasQuestionReplay = Boolean(latestResult?.question_scores?.length);
  const hasImprovementPlan = Boolean(latestResult?.final_improvement_plan?.practice_next?.length);
  const hasCoaching = Boolean(latestResult?.coaching_priorities?.length);
  const hasStrictAnalytics = Boolean(latestResult?.analytics);

  return [
    { label: "Interview replay", sub: hasQuestionReplay ? "Question-by-question review is available" : "Complete one session to unlock replay details", done: hasReplay && hasQuestionReplay },
    { label: "Rich feedback breakdown", sub: hasBreakdown ? "Content, delivery and confidence bars are live" : "Waiting for the latest scored result", done: hasBreakdown },
    { label: "Final improvement plan", sub: hasImprovementPlan ? "Top strengths, weaknesses and next practice items are ready" : "Will appear after a completed interview", done: hasImprovementPlan },
    { label: "Strict communication analytics", sub: hasStrictAnalytics ? "Filler, flow and confidence diagnostics are being tracked" : "No diagnostic payload found yet", done: hasStrictAnalytics },
    { label: "Coaching priorities", sub: hasCoaching ? "Priority actions for the next round are surfaced" : "Needs at least one narrated result", done: hasCoaching },
    { label: "Advanced recruiter analytics", sub: "Still pending - no recruiter/admin overview yet", done: false },
  ];
}

function averageValue(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function buildScoreBuckets(scores: number[]) {
  const ranges = [
    { label: "0-49", min: 0, max: 49, color: "var(--rose)" },
    { label: "50-64", min: 50, max: 64, color: "var(--amber)" },
    { label: "65-74", min: 65, max: 74, color: "var(--accent-2)" },
    { label: "75-84", min: 75, max: 84, color: "var(--positive)" },
    { label: "85-100", min: 85, max: 100, color: "var(--accent)" },
  ];
  return ranges.map((range) => ({
    ...range,
    count: scores.filter((s) => s >= range.min && s <= range.max).length,
  }));
}

function buildActivitySeries(items: HistoryItem[], days = 14) {
  const today = new Date();
  return Array.from({ length: days }).map((_, idx) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - idx));
    const key = d.toDateString();
    const count = items.filter((it) => new Date(it.date).toDateString() === key).length;
    return {
      date: d,
      count,
    };
  });
}

function sparklinePath(values: number[], width: number, height: number) {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function averageGapDays(items: HistoryItem[]) {
  if (items.length < 2) return null;
  const sorted = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const gaps = sorted.slice(1).map((item, idx) => {
    const prev = sorted[idx];
    const diffMs = new Date(item.date).getTime() - new Date(prev!.date).getTime();
    return diffMs / (1000 * 60 * 60 * 24);
  });
  return averageValue(gaps.map((g) => Math.round(g)));
}

// """ Sub-components """""""""""""""""""""""""""""""""""""""""""""""""""""""""""

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
        <span className="dash-stat-label">"</span>
      </div>
      <div className="dash-stat-value">"</div>
      <div className="dash-stat-delta">"</div>
    </div>
  );
}

// """ Main Component """""""""""""""""""""""""""""""""""""""""""""""""""""""""""

export default function ProgressPage() {
  const [items,        setItems]        = useState<HistoryItem[]>([]);
  const [latestResult, setLatestResult] = useState<UnifiedResult | null>(null);
  const [replayResult, setReplayResult] = useState<UnifiedResult | null>(null);
  const [replayTitle, setReplayTitle] = useState<string | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        // 1. Interview history " provides score, type, status, date for all panels.
        //    score here = averaged InterviewQuestion.score from DB (already computed
        //    in interviewHistory controller, no extra fetch needed).
        const histRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/interview/history`, { credentials: "include" });
        if (histRes.status === 404) {
          // No history yet " treat as empty rather than an error
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

  // "" Derived values (all computed from real fetched data) """"""""""""""""""""
  const completed   = items.filter(i => i.status === "completed");
  const scores      = items.map(i => i.score).filter((s): s is number => s !== null);
  const avg         = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const best        = scores.length ? Math.max(...scores) : null;
  const bestItem    = items.find(i => i.score === best);
  const streak      = computeStreak(completed);

  // Trend bars " up to 8 most recent completed sessions with a score, asc for L'R chart
  const trendBars   = items.filter(i => i.status === "completed" && i.score !== null).slice(0, 8).reverse();
  const maxBarScore = trendBars.length ? Math.max(...trendBars.map(i => i.score!), 1) : 1;
  const trendDir    = trendBars.length >= 2
    ? trendBars[trendBars.length - 1]?.score! > trendBars[0]?.score! ? "- Improving"
    : trendBars[trendBars.length - 1]?.score! < trendBars[0]?.score! ? "- Declining"
    : "' Stable"
    : "Latest";

  const milestones  = buildMilestones(items, latestResult);
  const doneCount   = milestones.filter(m => m.done).length;
  const featureChecklist = buildFeatureChecklist(items, latestResult);
  const completedCount = items.filter(i => i.status === "completed").length;
  const terminatedCount = items.filter(i => i.status === "terminated").length;
  const inProgressCount = items.filter(i => i.status === "in_progress").length;
  const sessionOutcomeBars = [
    { label: "Completed", value: completedCount, color: "#2bba8a" },
    { label: "Terminated", value: terminatedCount, color: "#e04040" },
    { label: "In progress", value: inProgressCount, color: "#4f8ef7" },
  ];
  const maxOutcome = Math.max(...sessionOutcomeBars.map(item => item.value), 1);
  const interviewTypeBars = ["Coding", "Behavioral", "System Design"].map((type) => ({
    label: type,
    value: items.filter(i => i.type === type).length,
    color: type === "Coding" ? "#4878d4" : type === "System Design" ? "#e09b30" : "#7a50b8",
  }));
  const maxTypeValue = Math.max(...interviewTypeBars.map(item => item.value), 1);
  const skillScores = latestResult?.skill_scores ?? {};
  const pillarScores = latestResult?.score_pillars ?? {};
  const fillerSummary = latestResult?.analytics?.filler_summary ?? {};
  const flowSummary = latestResult?.analytics?.flow_summary ?? {};
  const confidenceSummary = latestResult?.analytics?.confidence_summary ?? {};
  const scoreBuckets = buildScoreBuckets(scores);
  const activitySeries = buildActivitySeries(items, 14);
  const avgGap = averageGapDays(completed);
  const lastScore = trendBars.length ? trendBars[trendBars.length - 1]?.score ?? null : null;
  const prevScore = trendBars.length > 1 ? trendBars[trendBars.length - 2]?.score ?? null : null;
  const scoreDelta = lastScore != null && prevScore != null ? lastScore - prevScore : null;
  const sparklineVals = trendBars.map((b) => b.score ?? 0);
  const sparkline = sparklinePath(sparklineVals, 220, 64);
  const typeAverages = ["Coding", "Behavioral", "System Design"].map((type) => {
    const typeScores = items
      .filter((item) => item.type === type && item.score != null)
      .map((item) => item.score as number);
    return {
      label: type,
      avg: averageValue(typeScores),
      count: typeScores.length,
      color: type === "Coding" ? "#4878d4" : type === "System Design" ? "#e09b30" : "#7a50b8",
    };
  });
  const difficultyScores = (latestResult?.question_scores ?? []).reduce<Record<string, number[]>>((acc, q) => {
    const key = (q.difficulty ?? "").toLowerCase();
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(q.score);
    return acc;
  }, {});
  const difficultyAverages = ["easy", "medium", "hard"].map((key) => ({
    label: key,
    avg: averageValue(difficultyScores[key] ?? []),
    count: (difficultyScores[key] ?? []).length,
    color: key === "easy" ? "#2bba8a" : key === "medium" ? "#e09b30" : "#e04040",
  }));
  const radarPoints = [
    { label: "Content", value: Number(pillarScores.content_score ?? avg ?? 0), color: "#8b5cf6" },
    { label: "Delivery", value: Number(pillarScores.delivery_score ?? avg ?? 0), color: "#22c55e" },
    { label: "Confidence", value: Number(pillarScores.confidence_score ?? latestResult?.pressure_handling_score ?? 0), color: "#f97316" },
    { label: "Flow", value: Number(pillarScores.communication_flow_score ?? latestResult?.conciseness_score ?? 0), color: "#38bdf8" },
  ];

  const loadReplay = async (item: HistoryItem) => {
    try {
      setReplayLoading(true);
      setReplayTitle(item.title);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/interview/${item.id}/results`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Replay fetch failed: ${res.status}`);
      setReplayResult(await res.json());
    } catch (e: any) {
      setError(e.message ?? "Failed to load replay");
    } finally {
      setReplayLoading(false);
    }
  };

  // "" Error state """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
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

  // "" Render """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  return (
    <>
      {/* Top bar */}
      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">Your <em>Progress</em></div>
          <div className="dash-date">Track your growth over time</div>
        </div>
      </div>

      {/* "" 5 Stat cards "" */}
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
              value={best != null ? String(best) : "0"}
              delta={bestItem?.title ?? "No scores yet"}
            />
            <StatCard
              dot="dot-violet"
              label="Avg. score"
              value={avg != null ? String(avg) : "0"}
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
              value={latestResult?.recommendation ?? "Pending"}
              delta="Latest session"
            />
          </>
        )}
      </div>


      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Visual snapshot</div>
            <div className="panel-sub">A quicker read on how your latest scored session is balancing quality and pressure</div>
          </div>
          <span className="tag tag-violet">Interactive view</span>
        </div>
        <ProgressRadarPanel
          points={radarPoints}
          difficulties={difficultyAverages.filter((item) => item.count > 0)}
        />
      </div>
      {/* "" Score trend bars "" */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Score trend</div>
            <div className="panel-sub">
              {loading
                ? "Loading"
                : `Last ${trendBars.length} completed session${trendBars.length !== 1 ? "s" : ""}`}
            </div>
          </div>
          <span className="tag tag-accent">{loading ? "" : trendDir}</span>
        </div>

        {loading ? (
          <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>Loading</span>
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

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Momentum & cadence</div>
                <div className="panel-sub">Trend speed and consistency over time</div>
              </div>
              {scoreDelta != null && (
                <span className={`tag ${scoreDelta >= 0 ? "tag-gold" : "tag-rose"}`}>
                  {scoreDelta >= 0 ? `+${scoreDelta}` : scoreDelta} vs last
                </span>
              )}
            </div>

            {sparklineVals.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>No trend data yet</div>
            ) : (
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                <svg width="240" height="80" viewBox="0 0 240 80" style={{ display: "block" }}>
                  <path
                    d={sparkline}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2.5"
                  />
                  <path
                    d={`${sparkline} L 220 80 L 0 80 Z`}
                    fill="rgba(255,92,53,0.12)"
                  />
                </svg>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.6rem" }}>
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Latest score</div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{lastScore ?? 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Avg gap</div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>
                      {avgGap != null ? `${avgGap}d` : "0d"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Trend dir</div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{trendDir}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Scored sessions</div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{scores.length}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Score distribution</div>
                <div className="panel-sub">Where your scores cluster</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {scoreBuckets.map((bucket) => {
                const maxBucket = Math.max(...scoreBuckets.map((b) => b.count), 1);
                return (
                  <div key={bucket.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem" }}>
                      <span style={{ color: "var(--muted)" }}>{bucket.label}</span>
                      <span style={{ color: bucket.color, fontWeight: 700 }}>{bucket.count}</span>
                    </div>
                    <div style={{ height: 8, background: "var(--bg2)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--border)" }}>
                      <div style={{ width: `${(bucket.count / maxBucket) * 100}%`, height: "100%", background: bucket.color, borderRadius: 999 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Activity heatmap</div>
                <div className="panel-sub">Last 14 days of practice</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "0.35rem" }}>
              {activitySeries.map((day, idx) => {
                const intensity = day.count === 0
                  ? "rgba(255,255,255,0.05)"
                  : day.count <= 1
                    ? "rgba(255,92,53,0.12)"
                    : day.count <= 2
                      ? "rgba(255,92,53,0.25)"
                      : "rgba(255,92,53,0.45)";
                return (
                  <div
                    key={idx}
                    title={`${day.date.toDateString()}  ${day.count} session(s)`}
                    style={{
                      height: 22,
                      borderRadius: 6,
                      background: intensity,
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  />
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.6rem", fontSize: "0.68rem", color: "var(--muted)" }}>
              <span>{activitySeries[0]?.date ? fmtDate(activitySeries[0].date.toISOString()) : ""}</span>
              <span>{activitySeries[activitySeries.length - 1]?.date ? fmtDate(activitySeries[activitySeries.length - 1]!.date.toISOString()) : ""}</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Performance breakdown</div>
                <div className="panel-sub">By interview type and difficulty</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
              <div>
                <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>By type</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                  {typeAverages.map((item) => (
                    <div key={item.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", marginBottom: 4 }}>
                        <span style={{ color: "var(--muted)" }}>{item.label}</span>
                        <span style={{ color: item.color, fontWeight: 700 }}>
                          {item.avg != null ? item.avg : "--"} {item.count ? "(" + item.count + ")" : ""}
                        </span>
                      </div>
                      <div style={{ height: 8, background: "var(--bg2)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--border)" }}>
                        <div style={{ width: `${Math.min(100, item.avg ?? 0)}%`, height: "100%", background: item.color, borderRadius: 999 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>By difficulty (latest)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                  {difficultyAverages.map((item) => (
                    <div key={item.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", marginBottom: 4 }}>
                        <span style={{ color: "var(--muted)", textTransform: "capitalize" }}>{item.label}</span>
                        <span style={{ color: item.color, fontWeight: 700 }}>
                          {item.avg != null ? item.avg : "--"} {item.count ? "(" + item.count + ")" : ""}
                        </span>
                      </div>
                      <div style={{ height: 8, background: "var(--bg2)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--border)" }}>
                        <div style={{ width: `${Math.min(100, item.avg ?? 0)}%`, height: "100%", background: item.color, borderRadius: 999 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Session outcomes</div>
                <div className="panel-sub">How your interview attempts are resolving</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {sessionOutcomeBars.map((item) => (
                <div key={item.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginBottom: 6 }}>
                    <span style={{ color: "var(--muted)" }}>{item.label}</span>
                    <span style={{ color: item.color, fontWeight: 700 }}>{item.value}</span>
                  </div>
                  <div style={{ height: 8, background: "var(--bg2)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--border)" }}>
                    <div style={{ width: `${(item.value / maxOutcome) * 100}%`, height: "100%", background: item.color, borderRadius: 999 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Interview type mix</div>
                <div className="panel-sub">Coverage across practice formats</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "flex-end", gap: "0.75rem", height: 148 }}>
              {interviewTypeBars.map((item) => (
                <div key={item.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.45rem" }}>
                  <span style={{ fontSize: "0.68rem", color: item.color, fontWeight: 700 }}>{item.value}</span>
                  <div style={{ width: "100%", height: `${Math.max(12, (item.value / maxTypeValue) * 92)}px`, borderRadius: "var(--r-sm) var(--r-sm) 0 0", background: item.color, opacity: 0.85 }} />
                  <span style={{ fontSize: "0.68rem", color: "var(--muted)", textAlign: "center" }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* "" Skill breakdown " only shown when latest result has skill_scores "" */}
      {!loading && Object.keys(skillScores).length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Skill breakdown</div>
              <div className="panel-sub">
                {latestResult
                  ? `${latestResult.interview_type} - ${fmtDate(latestResult.date_iso)}`
                  : "Latest completed session"}
              </div>
            </div>
            <span className="tag tag-accent">{latestResult?.role ?? "General"}</span>
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

      {!loading && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Feature checklist</div>
              <div className="panel-sub">What is already handled and what is still pending</div>
            </div>
          </div>

          <div className="milestone-list">
            {featureChecklist.map((item, index) => (
              <div key={`${item.label}-${index}`} className="milestone-item">
                <div className={`milestone-check ${item.done ? "done" : "todo"}`}>
                  {item.done ? "OK" : "-"}
                </div>
                <div>
                  <div className="milestone-label" style={{ color: item.done ? "var(--text)" : "var(--text-3)" }}>
                    {item.label}
                  </div>
                  <div className="milestone-sub">{item.sub}</div>
                </div>
                <span className={item.done ? "tag tag-gold" : "tag tag-accent"} style={{ marginLeft: "auto" }}>
                  {item.done ? "Done" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && latestResult && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Strict communication diagnostics</div>
              <div className="panel-sub">Latest interview only</div>
            </div>
            <span className="tag tag-accent">{latestResult.overall_score}/100</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.8rem" }}>
            {[
              { label: "Content", value: Number(pillarScores.content_score ?? latestResult.overall_score), note: latestResult.role },
              { label: "Delivery", value: Number(pillarScores.delivery_score ?? latestResult.overall_score), note: `${flowSummary.avg_wpm ?? 0} WPM` },
              { label: "Confidence", value: Number(pillarScores.confidence_score ?? 0), note: `${confidenceSummary.hedges ?? 0} hedges` },
              { label: "Flow", value: Number(pillarScores.communication_flow_score ?? 0), note: `${flowSummary.avg_latency_ms ?? 0} ms latency` },
              { label: "Recovery", value: Number(latestResult.recovery_score ?? 0), note: "How strongly you bounced back" },
              { label: "Conciseness", value: Number(latestResult.conciseness_score ?? 0), note: `${fillerSummary.total_count ?? 0} filler words` },
            ].map((card) => (
              <div key={card.label} style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                padding: "0.9rem",
                background: "var(--bg2)",
              }}>
                <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {card.label}
                </div>
                <div style={{ fontSize: "1.7rem", fontWeight: 800, marginTop: "0.35rem", color: scoreColor(card.value) }}>
                  {card.value}
                </div>
                <div style={{ marginTop: "0.55rem", height: 6, background: "var(--bg)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, card.value)}%`, height: "100%", background: skillBarColor(card.value), borderRadius: 999 }} />
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.5rem" }}>{card.note}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && latestResult?.coaching_priorities && latestResult.coaching_priorities.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Coaching priorities</div>
              <div className="panel-sub">What to fix before the next practice session</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {latestResult.coaching_priorities.map((item, i) => (
              <div key={i} style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                padding: "0.8rem 0.9rem",
                background: "var(--bg2)",
              }}>
                <div style={{ fontSize: "0.72rem", color: "#a07010", fontWeight: 700, marginBottom: 6 }}>
                  Priority {i + 1}
                </div>
                <div style={{ fontSize: "0.82rem", lineHeight: 1.6 }}>{item}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* "" Recent interviews "" */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Recent interviews</div>
            <div className="panel-sub">{loading ? "Loading" : `${items.length} total`}</div>
          </div>
        </div>

        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: "0.8rem", padding: "0.5rem 0" }}>Loading</div>
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
                      {iv.type} - {fmtDate(iv.date)}
                    </div>
                  </div>
                  {iv.status !== "in_progress" && (
                    <button
                      onClick={() => loadReplay(iv)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        background: "var(--bg2)",
                        color: "var(--text)",
                        fontSize: "0.68rem",
                        cursor: "pointer",
                      }}
                    >
                      Replay
                    </button>
                  )}
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

      {/* "" Milestones "" */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Milestones</div>
            <div className="panel-sub">
              {loading ? "Computing" : `${doneCount} of ${milestones.length} achieved`}
            </div>
          </div>
        </div>

        <div className="milestone-list">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="milestone-item" style={{ opacity: 0.4 }}>
                  <div className="milestone-check todo">-</div>
                  <div>
                    <div className="milestone-label">"</div>
                    <div className="milestone-sub">"</div>
                  </div>
                </div>
              ))
            : milestones.map((m, i) => (
                <div key={i} className="milestone-item">
                  <div className={`milestone-check ${m.done ? "done" : "todo"}`}>
                    {m.done ? "OK" : "-"}
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
      {replayTitle && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(4,8,18,0.72)",
          backdropFilter: "blur(10px)",
          zIndex: 1200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}>
          <div style={{
            width: "min(920px, 100%)",
            maxHeight: "88vh",
            overflowY: "auto",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            padding: "1.1rem",
            boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          }}>
            <div className="panel-header" style={{ marginBottom: "1rem" }}>
              <div>
                <div className="panel-title">Interview replay</div>
                <div className="panel-sub">
                  {replayTitle}{replayResult ? ` - ${replayResult.interview_type}` : ""}
                </div>
              </div>
              <button
                onClick={() => {
                  setReplayTitle(null);
                  setReplayResult(null);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            {replayLoading && (
              <div style={{ color: "var(--muted)", padding: "1rem 0" }}>Loading replay...</div>
            )}

            {!replayLoading && replayResult && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  padding: "0.9rem",
                  background: "var(--bg2)",
                }}>
                  <div style={{ fontSize: "0.92rem", fontWeight: 600 }}>{replayResult.summary ?? "Session replay"}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.75rem", marginTop: "0.85rem" }}>
                    {[
                      { label: "Overall", value: replayResult.overall_score },
                      { label: "Verdict", value: replayResult.recommendation },
                      { label: "Questions", value: replayResult.question_scores?.length ?? 0 },
                    ].map((card) => (
                      <div key={card.label} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "0.7rem" }}>
                        <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase" }}>{card.label}</div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 700, marginTop: 4 }}>{card.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {replayResult.final_improvement_plan && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.8rem" }}>
                    {[
                      { title: "Top strengths", items: replayResult.final_improvement_plan.top_strengths, color: "#2bba8a" },
                      { title: "Top weaknesses", items: replayResult.final_improvement_plan.top_weaknesses, color: "#e04040" },
                      { title: "Practice next", items: replayResult.final_improvement_plan.practice_next, color: "#4f8ef7" },
                    ].map((group) => (
                      <div key={group.title} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "0.85rem" }}>
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: group.color, marginBottom: "0.6rem" }}>{group.title}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          {(group.items?.length ? group.items : ["No data available"]).map((item, idx) => (
                            <div key={`${group.title}-${idx}`} style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>{item}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                  {(replayResult.question_scores ?? []).map((question, idx) => (
                    <div key={`${question.index}-${idx}`} style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-md)",
                      padding: "0.95rem",
                      background: "var(--bg2)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", marginBottom: "0.75rem" }}>
                        <div>
                          <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase" }}>
                            Q{(question.index ?? idx) + 1} - {question.difficulty}
                          </div>
                          <div style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: 4 }}>{question.question}</div>
                        </div>
                        <div style={{ color: scoreColor(question.score), fontWeight: 700 }}>{question.score}</div>
                      </div>

                      <div style={{ display: "grid", gap: "0.75rem" }}>
                        <div>
                          <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>Your answer</div>
                          <div style={{ fontSize: "0.8rem", lineHeight: 1.6 }}>{question.user_answer || "No recorded answer."}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>AI feedback</div>
                          <div style={{ fontSize: "0.8rem", lineHeight: 1.6 }}>{question.feedback}</div>
                        </div>
                        {question.dimensions && Object.keys(question.dimensions).length > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.55rem" }}>
                            {Object.entries(question.dimensions).map(([label, value]) => (
                              <div key={label}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted)", marginBottom: 4 }}>
                                  <span style={{ textTransform: "capitalize" }}>{label.replace(/_/g, " ")}</span>
                                  <span>{value}/10</span>
                                </div>
                                <div style={{ height: 6, background: "var(--bg)", borderRadius: 999, overflow: "hidden" }}>
                                  <div style={{ width: `${Math.min(100, Number(value) * 10)}%`, height: "100%", background: skillBarColor(Number(value) * 10), borderRadius: 999 }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

