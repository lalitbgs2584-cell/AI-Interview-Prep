"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell,
  LineChart, Line, ReferenceLine,
} from "recharts";
import "../style.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/* ─── tokens ─────────────────────────────────────────────── */
const C = {
  accent: "#ff5c35",
  accent2: "#ff8162",
  positive: "#e2a84b",
  amber: "#f5a623",
  rose: "#ff4d6d",
  sky: "#38bdf8",
  violet: "#a78bfa",
  green: "#4ade80",
  bg: "#080b12",
  card: "#0d1117",
  card2: "#111827",
  muted: "#6b7590",
  border: "rgba(255,255,255,0.065)",
  borderStrong: "rgba(255,255,255,0.13)",
};

/* ─── types ──────────────────────────────────────────────── */
interface WentPoint { point: string; tag: string; }

interface QuestionScore {
  index: number;
  score: number;
  difficulty: string;
  question: string;
  feedback: string;
  verdict: string;
  timestamp: number;
  answer:string;
}

interface HistoryEntry {
  interview_id: string;
  score: number;
  role: string;
  date_iso: string;
}

interface ResultsData {
  role: string;
  interview_type: string;
  candidate_name: string;
  date_iso: string;
  duration_seconds: number;
  recommendation: string;
  overall_score: number;
  summary: string;
  what_went_right: WentPoint[];
  what_went_wrong: WentPoint[];
  strengths: string[];
  weaknesses: string[];
  tips: string[];
  skill_scores: Record<string, number>;
  question_scores: QuestionScore[];
  history: HistoryEntry[];
}

/* ─── helpers ────────────────────────────────────────────── */
const scoreColor = (s: number) => s >= 75 ? C.positive : s >= 55 ? C.amber : C.rose;
const scoreLabel = (s: number) => s >= 75 ? "Strong" : s >= 55 ? "Good" : "Needs Work";

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

const DIFF_COLOR: Record<string, string> = {
  intro: C.sky, easy: C.positive, medium: C.amber, hard: C.rose,
};

const REC_STYLE: Record<string, { bg: string; color: string }> = {
  "Strong Hire": { bg: "rgba(74,222,128,0.12)", color: C.green },
  "Hire": { bg: "rgba(56,189,248,0.12)", color: C.sky },
  "No Hire": { bg: "rgba(255,77,109,0.12)", color: C.rose },
  "Needs More Evaluation": { bg: "rgba(167,139,250,0.12)", color: C.violet },
};

/* ─── hooks ─────────────────────────────────────────────── */
function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let cur = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      cur = Math.min(cur + step, target);
      setVal(Math.floor(cur));
      if (cur >= target) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [target, duration]);
  return val;
}

function useBarWidth(score: number, delay = 0) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setW(score), delay + 200);
    return () => clearTimeout(id);
  }, [score, delay]);
  return w;
}

/* ─── sub-components ─────────────────────────────────────── */
const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.card2, border: `1px solid ${C.borderStrong}`, borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: C.muted, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

function ScoreRing({ score, size = 140, stroke = 11 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const [dash, setDash] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setDash(circ * (score / 100)), 150);
    return () => clearTimeout(id);
  }, [circ, score]);
  const color = scoreColor(score);
  const count = useCountUp(score);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 1.3s cubic-bezier(0.16,1,0.3,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.24, fontWeight: 700, color, lineHeight: 1 }}>{count}</span>
        <span style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>/100</span>
      </div>
    </div>
  );
}

function AnimBar({ score, delay = 0, color }: { score: number; delay?: number; color?: string }) {
  const w = useBarWidth(score, delay);
  const col = color ?? scoreColor(score);
  return (
    <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${w}%`, borderRadius: 99,
        background: `linear-gradient(90deg, ${col}99, ${col})`,
        transition: "width 0.9s cubic-bezier(0.16,1,0.3,1)",
      }} />
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {[180, 56, 300, 300].map((h, i) => (
        <div key={i} style={{ height: h, borderRadius: 12, background: "rgba(255,255,255,0.04)", animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${i * 0.1}s` }} />
      ))}
    </div>
  );
}

/* tag pill */
function Tag({ label, variant }: { label: string; variant: "good" | "bad" | "tip" | "neutral" }) {
  const styles = {
    good: { bg: "rgba(74,222,128,0.1)", border: "rgba(74,222,128,0.25)", color: C.green },
    bad: { bg: "rgba(255,77,109,0.1)", border: "rgba(255,77,109,0.25)", color: C.rose },
    tip: { bg: "rgba(56,189,248,0.1)", border: "rgba(56,189,248,0.25)", color: C.sky },
    neutral: { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)", color: C.muted },
  }[variant];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
      background: styles.bg, border: `0.5px solid ${styles.border}`, color: styles.color,
      letterSpacing: "0.04em", flexShrink: 0,
    }}>{label}</span>
  );
}

/* panel wrapper */
function Panel({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: "1.25rem 1.5rem", position: "relative", overflow: "hidden",
      ...style,
    }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, transparent 60%)", pointerEvents: "none" }} />
      {children}
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 14, fontWeight: 600, color: "#e8eaf0", margin: "0 0 4px" }}>{children}</h2>;
}

function PanelSub({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <p
      style={{
        fontSize: 12,
        color: C.muted,
        margin: "0 0 1.25rem",
        ...style, // ✅ merge external styles
      }}
    >
      {children}
    </p>
  );
}

/* ─── MAIN PAGE ──────────────────────────────────────────── */
export default function FeedbackPage() {
  const router = useRouter();
  const params = useParams();
  const interviewId = params.id as string;

  const [data, setData] = useState<ResultsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "breakdown" | "questions" | "feedback">("overview");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!interviewId) return;
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/interview/${interviewId}/results`, { credentials: "include" });
        if (res.status === 404) { pollRef.current = setTimeout(fetch_, 3000); return; }
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try { const j = await res.json(); detail = j?.message ?? detail; } catch { }
          throw new Error(detail);
        }
        let json: ResultsData;
        try { json = await res.json(); } catch { throw new Error("Invalid JSON from server"); }

        // Defensive defaults
        json.what_went_right = Array.isArray(json.what_went_right) ? json.what_went_right : [];
        json.what_went_wrong = Array.isArray(json.what_went_wrong) ? json.what_went_wrong : [];
        json.strengths = Array.isArray(json.strengths) ? json.strengths : [];
        json.weaknesses = Array.isArray(json.weaknesses) ? json.weaknesses : [];
        json.tips = Array.isArray(json.tips) ? json.tips : [];
        json.question_scores = Array.isArray(json.question_scores) ? json.question_scores : [];
        json.history = Array.isArray(json.history) ? json.history : [];
        json.skill_scores = json.skill_scores ?? {};

        setData(json);
        setLoading(false);
      } catch (e: any) {
        setError(e.message || "Failed to load results");
        setLoading(false);
      }
    };
    fetch_();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [interviewId]);

  if (loading) return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ padding: "1.25rem 1.5rem", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
            Interview<span style={{ color: C.accent }}>AI</span>
          </span>
        </div>
        <Skeleton />
      </div>
    </div>
  );

  if (error) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠</div>
        <div style={{ color: C.rose, marginBottom: 16 }}>{error}</div>
        <button onClick={() => window.location.reload()} style={{ padding: "8px 20px", border: `1px solid ${C.borderStrong}`, borderRadius: 8, background: "none", color: "#fff", cursor: "pointer", fontSize: 13 }}>Retry</button>
      </div>
    </div>
  );

  if (!data) return null;

  /* ── derived ─────────────────────────────────────────── */
  const skillScores = Object.entries(data.skill_scores).map(([skill, score]) => ({ skill, score }));
  const radarData = skillScores.map(s => ({ subject: s.skill, score: s.score }));

  const indexBase = data.question_scores.length > 0 && data.question_scores[0]?.index === 0 ? 1 : 0;
  const timelineData = data.question_scores.map(q => ({
    q: `Q${q.index + indexBase}`, score: q.score, difficulty: q.difficulty,
  }));

  // history dedup
  const historyData = data.history.map((h, i) => ({
    session: `S${i + 1}`, score: h.score, interview_id: h.interview_id,
  }));
  if (!historyData.some(h => h.interview_id === interviewId)) {
    historyData.push({ session: `S${historyData.length + 1}`, score: data.overall_score, interview_id: interviewId });
  }

  const previousScore = historyData.length >= 2 ? historyData[historyData.length - 2]?.score ?? null : null;
  const scoreDelta = previousScore !== null ? data.overall_score - previousScore : null;

  const difficultyGroups = ["intro", "easy", "medium", "hard"].map(d => {
    const qs = data.question_scores.filter(q => q.difficulty === d);
    return {
      phase: d.charAt(0).toUpperCase() + d.slice(1),
      count: qs.length,
      avgScore: qs.length ? Math.round(qs.reduce((s, q) => s + q.score, 0) / qs.length) : 0,
      color: DIFF_COLOR[d] || C.muted,
    };
  }).filter(d => d.count > 0);

  const weakestSkill = Object.entries(data.skill_scores).sort((a, b) => a[1] - b[1])[0];
  const recStyle = REC_STYLE[data.recommendation] ?? { bg: "rgba(255,255,255,0.06)", color: C.muted };

  const TABS = [
    { id: "overview" as const, label: "Overview" },
    { id: "breakdown" as const, label: "Skills" },
    { id: "questions" as const, label: "Questions" },
    { id: "feedback" as const, label: "Feedback" },
  ];

  /* ── shared styles ───────────────────────────────────── */
  const S = {
    root: {
      background: C.bg,
      minHeight: "100vh",
      color: "#e8eaf0",
      fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
    } as React.CSSProperties,
    wrap: { maxWidth: 940, margin: "0 auto" } as React.CSSProperties,
    topbar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "1rem 1.5rem",
      borderBottom: `1px solid ${C.border}`,
      position: "sticky" as const,
      top: 0,
      background: "rgba(8,11,18,0.92)",
      backdropFilter: "blur(12px)",
      zIndex: 100,
    },
  };

  return (
    <div style={S.root}>
      <div style={S.wrap}>

        {/* ── TOPBAR ── */}
        <header style={S.topbar}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/" style={{ fontSize: 17, fontWeight: 800, color: "#fff", textDecoration: "none", letterSpacing: "-0.02em" }}>
              Interview<span style={{ color: C.accent }}>AI</span>
            </Link>
            <span style={{ width: 1, height: 16, background: C.border }} />
            <span style={{ fontSize: 12, color: C.muted }}>Session Feedback</span>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            style={{ fontSize: 12, color: C.muted, background: "none", border: `0.5px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}
          >
            ← Dashboard
          </button>
        </header>

        <main style={{ padding: "1.5rem" }}>

          {/* ══ HERO ══ */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: "1.5rem", marginBottom: "1.25rem", position: "relative", overflow: "hidden",
          }}>
            {/* shine */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,92,53,0.06) 0%, transparent 55%)", pointerEvents: "none" }} />

            <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5rem", flexWrap: "wrap" }}>
              {/* left */}
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
                    padding: "3px 10px", borderRadius: 999,
                    background: "rgba(255,92,53,0.12)", border: "0.5px solid rgba(255,92,53,0.3)", color: C.accent2,
                  }}>{data.interview_type}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                    background: recStyle.bg, color: recStyle.color,
                    border: `0.5px solid ${recStyle.color}44`,
                  }}>{data.recommendation}</span>
                </div>

                <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                  {data.role} Interview
                </h1>
                <p style={{ fontSize: 12, color: C.muted, margin: "0 0 12px" }}>
                  {formatDate(data.date_iso)} · {formatDuration(data.duration_seconds)}
                </p>

                {/* 2-sentence summary */}
                <p style={{ fontSize: 13.5, color: "#9ba5bc", lineHeight: 1.7, margin: "0 0 14px", maxWidth: 480 }}>
                  {data.summary}
                </p>

                {/* delta chip */}
                {scoreDelta !== null && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
                    padding: "4px 12px", borderRadius: 999,
                    background: scoreDelta >= 0 ? "rgba(74,222,128,0.1)" : "rgba(255,77,109,0.1)",
                    border: `0.5px solid ${scoreDelta >= 0 ? "rgba(74,222,128,0.3)" : "rgba(255,77,109,0.3)"}`,
                    color: scoreDelta >= 0 ? C.green : C.rose,
                  }}>
                    {scoreDelta >= 0 ? "↑" : "↓"} {scoreDelta >= 0 ? "+" : ""}{scoreDelta} pts vs last session
                  </span>
                )}
              </div>

              {/* right */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <ScoreRing score={data.overall_score} size={130} />
                <div style={{ display: "flex", gap: 16 }}>
                  {[
                    { label: "Good", val: data.what_went_right.length || data.strengths.length, color: C.green },
                    { label: "To Fix", val: data.what_went_wrong.length || data.weaknesses.length, color: C.rose },
                    { label: "Questions", val: data.question_scores.length, color: C.sky },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ══ TABS ══ */}
          <div style={{ display: "flex", gap: 4, marginBottom: "1.25rem", background: C.card, borderRadius: 10, padding: 4, border: `1px solid ${C.border}` }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: tab === t.id ? "rgba(255,92,53,0.15)" : "none",
                color: tab === t.id ? C.accent2 : C.muted,
                transition: "all 0.15s",
              }}>{t.label}</button>
            ))}
          </div>

          {/* ══════ OVERVIEW TAB ══════ */}
          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

              {/* Score history */}
              <Panel>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                  <div>
                    <PanelTitle>Score History</PanelTitle>
                    <PanelSub style={{ margin: 0 }}>Performance across all sessions</PanelSub>
                  </div>
                  {historyData.length >= 2 && (() => {
                    const delta = historyData[historyData.length - 1]!.score - historyData[0]!.score;
                    return (
                      <span style={{
                        fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
                        background: delta >= 0 ? "rgba(74,222,128,0.1)" : "rgba(255,77,109,0.1)",
                        color: delta >= 0 ? C.green : C.rose, border: `0.5px solid ${delta >= 0 ? "rgba(74,222,128,0.3)" : "rgba(255,77,109,0.3)"}`
                      }}>
                        {delta >= 0 ? "+" : ""}{delta} pts since start
                      </span>
                    );
                  })()}
                </div>
                {historyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={190}>
                    <AreaChart data={historyData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.accent} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="session" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <ReferenceLine y={data.overall_score} stroke="rgba(255,92,53,0.2)" strokeDasharray="4 4"
                        label={{ value: "Today", fill: C.accent2, fontSize: 10 }} />
                      <Area type="monotone" dataKey="score" name="Score"
                        stroke={C.accent} strokeWidth={2.5} fill="url(#ag)"
                        dot={{ fill: C.accent, strokeWidth: 0, r: 4 }}
                        activeDot={{ r: 6, fill: C.accent, stroke: C.bg, strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: "center", color: C.muted, padding: "3rem 0", fontSize: 13 }}>
                    First session — history will appear here.
                  </div>
                )}
              </Panel>

              {/* 2-col: score by difficulty + quick skill snapshot */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>

                <Panel>
                  <PanelTitle>Score by Difficulty</PanelTitle>
                  <PanelSub>Avg per question tier</PanelSub>
                  {difficultyGroups.length > 0 ? (
                    <ResponsiveContainer width="100%" height={170}>
                      <BarChart data={difficultyGroups} margin={{ top: 5, right: 5, bottom: 0, left: -25 }} barSize={26}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis dataKey="phase" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTip />} />
                        <Bar dataKey="avgScore" name="Avg" radius={[6, 6, 0, 0]}>
                          {difficultyGroups.map(e => <Cell key={e.phase} fill={e.color} fillOpacity={0.85} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ textAlign: "center", color: C.muted, padding: "2rem 0" }}>No data</div>
                  )}
                </Panel>

                <Panel>
                  <PanelTitle>Top Skills Snapshot</PanelTitle>
                  <PanelSub>Scores from this session</PanelSub>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {skillScores.slice(0, 5).map((s, i) => (
                      <div key={s.skill}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12 }}>
                          <span style={{ color: "#b0b8cc" }}>{s.skill}</span>
                          <span style={{ color: scoreColor(s.score), fontWeight: 600 }}>{s.score}</span>
                        </div>
                        <AnimBar score={s.score} delay={i * 80} />
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {/* ══════ BREAKDOWN (SKILLS) TAB ══════ */}
          {tab === "breakdown" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>

              <Panel>
                <PanelTitle>Skill Radar</PanelTitle>
                <PanelSub>All evaluated dimensions</PanelSub>
                {skillScores.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                      <PolarGrid stroke="rgba(255,255,255,0.07)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: C.muted }} />
                      <Radar name="Score" dataKey="score" stroke={C.accent} fill={C.accent} fillOpacity={0.18} strokeWidth={2} />
                      <Tooltip content={<ChartTip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: "center", color: C.muted, padding: "3rem 0" }}>No skill data</div>
                )}
              </Panel>

              <Panel>
                <PanelTitle>Score Breakdown</PanelTitle>
                <PanelSub>Per-skill performance</PanelSub>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {skillScores.map((s, i) => (
                    <div key={s.skill}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: "#b0b8cc" }}>{s.skill}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Tag label={scoreLabel(s.score)} variant={s.score >= 75 ? "good" : s.score >= 55 ? "neutral" : "bad"} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(s.score) }}>{s.score}</span>
                        </div>
                      </div>
                      <AnimBar score={s.score} delay={i * 80} />
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {/* ══════ QUESTIONS TAB ══════ */}
          {tab === "questions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

              {/* Score-per-question line chart */}
              <Panel>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
                  <div>
                    <PanelTitle>Score Per Question</PanelTitle>
                    <PanelSub style={{ margin: 0 }}>How you progressed through the interview</PanelSub>
                  </div>
                  <span style={{ fontSize: 12, color: C.muted }}>{data.question_scores.length} questions</span>
                </div>
                {timelineData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={timelineData} margin={{ top: 8, right: 16, bottom: 8, left: -20 }}>
                      <defs>
                        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={C.rose} />
                          <stop offset="50%" stopColor={C.amber} />
                          <stop offset="100%" stopColor={C.positive} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="q" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <ReferenceLine y={75} stroke="rgba(226,168,75,0.2)" strokeDasharray="4 4"
                        label={{ value: "Target", fill: C.amber, fontSize: 10 }} />
                      <Line type="monotone" dataKey="score" name="Score"
                        stroke="url(#lg)" strokeWidth={2.5}
                        dot={(props: any) => {
                          const { cx, cy, payload } = props;
                          const col = DIFF_COLOR[payload.difficulty] || C.accent2;
                          return <circle key={`d-${payload.q}`} cx={cx} cy={cy} r={5} fill={col} stroke={C.bg} strokeWidth={2} />;
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: "center", color: C.muted, padding: "3rem 0" }}>No question data</div>
                )}
                {/* legend */}
                <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
                  {Object.entries(DIFF_COLOR).map(([d, col]) => (
                    <div key={d} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: col }} />
                      <span style={{ fontSize: 11, color: C.muted, textTransform: "capitalize" }}>{d}</span>
                    </div>
                  ))}
                </div>
              </Panel>

              {/* Per-question verdict cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.question_scores.map((q, i) => {
                  const col = DIFF_COLOR[q.difficulty] || C.muted;
                  return (
                    <Panel key={`q-${q.index}`} style={{ padding: "1rem 1.25rem" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", gap: 12, alignItems: "flex-start" }}>
                        {/* Q number */}
                        <div style={{
                          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                          background: `${col}18`, border: `1px solid ${col}44`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700, color: col,
                        }}>Q{q.index + indexBase}</div>

                        {/* body */}
                        <div>
                          <p style={{ fontSize: 13, color: "#d1d5db", margin: "0 0 6px", lineHeight: 1.5 }}>
                            {q.question}
                            </p>
                          {/* verdict — the key new field */}
                          {q.verdict ? (
                            <p style={{ fontSize: 12, color: "#8b96b0", margin: "0 0 6px", lineHeight: 1.6 }}>{q.verdict}</p>
                          ) : q.feedback ? (
                            <p style={{ fontSize: 12, color: "#8b96b0", margin: "0 0 6px", lineHeight: 1.6 }}>{q.feedback}</p>
                          ) : null}
                          <Tag label={q.difficulty} variant={q.difficulty === "hard" ? "bad" : q.difficulty === "easy" || q.difficulty === "intro" ? "good" : "neutral"} />
                        </div>

                        {/* score */}
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: col, lineHeight: 1 }}>{q.score}</div>
                          <div style={{ fontSize: 10, color: C.muted }}>/100</div>
                          <div style={{ marginTop: 6, width: 48, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
                            <div style={{ height: "100%", width: `${q.score}%`, borderRadius: 2, background: col, transition: "width 0.8s" }} />
                          </div>
                        </div>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════ FEEDBACK TAB ══════ */}
          {tab === "feedback" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

              {/* What went right vs wrong — 2 col */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>

                {/* GOOD */}
                <Panel>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: "1rem" }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(74,222,128,0.1)", border: "0.5px solid rgba(74,222,128,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17l-5-5" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>What went right</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {(data.what_went_right.length > 0 ? data.what_went_right : data.strengths.map(s => ({ point: s, tag: "Strength" }))).map((item, i) => {
                      const point = typeof item === "string" ? item : item.point;
                      const tag = typeof item === "string" ? "Strength" : item.tag;
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 0", borderBottom: i < (data.what_went_right.length || data.strengths.length) - 1 ? `1px solid ${C.border}` : "none" }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0, marginTop: 6 }} />
                          <p style={{ fontSize: 12.5, color: "#b0b8cc", margin: 0, lineHeight: 1.6, flex: 1 }}>{point}</p>
                          <Tag label={tag} variant="good" />
                        </div>
                      );
                    })}
                    {data.what_went_right.length === 0 && data.strengths.length === 0 && (
                      <p style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "1rem 0" }}>None identified</p>
                    )}
                  </div>
                </Panel>

                {/* BAD */}
                <Panel>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: "1rem" }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(255,77,109,0.1)", border: "0.5px solid rgba(255,77,109,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke={C.rose} strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.rose }}>What went wrong</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {(data.what_went_wrong.length > 0 ? data.what_went_wrong : data.weaknesses.map(w => ({ point: w, tag: "Gap" }))).map((item, i) => {
                      const point = typeof item === "string" ? item : item.point;
                      const tag = typeof item === "string" ? "Gap" : item.tag;
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 0", borderBottom: i < (data.what_went_wrong.length || data.weaknesses.length) - 1 ? `1px solid ${C.border}` : "none" }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.rose, flexShrink: 0, marginTop: 6 }} />
                          <p style={{ fontSize: 12.5, color: "#b0b8cc", margin: 0, lineHeight: 1.6, flex: 1 }}>{point}</p>
                          <Tag label={tag} variant="bad" />
                        </div>
                      );
                    })}
                    {data.what_went_wrong.length === 0 && data.weaknesses.length === 0 && (
                      <p style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "1rem 0" }}>None identified</p>
                    )}
                  </div>
                </Panel>
              </div>

              {/* Tips */}
              <Panel>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: "1rem" }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(56,189,248,0.1)", border: "0.5px solid rgba(56,189,248,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.sky }}>→</div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.sky }}>3 things to fix before your next interview</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.tips.length > 0 ? data.tips.map((tip, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: "rgba(56,189,248,0.04)", border: "0.5px solid rgba(56,189,248,0.12)", borderRadius: 10 }}>
                      <span style={{ fontSize: 13, color: C.sky, flexShrink: 0, fontWeight: 700, marginTop: 1 }}>{i + 1}</span>
                      <p style={{ fontSize: 13, color: "#b0b8cc", margin: 0, lineHeight: 1.6 }}>{tip}</p>
                    </div>
                  )) : (
                    <p style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "1rem 0" }}>No tips available</p>
                  )}
                </div>
              </Panel>

              
            </div>
          )}

        </main>
      </div>
    </div>
  );
}