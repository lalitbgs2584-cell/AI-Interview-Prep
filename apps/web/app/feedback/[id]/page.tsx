"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell,
  LineChart, Line, ReferenceLine,
} from "recharts";
import { useRouter } from "next/navigation";
import "../style.css";

// ── FIX: use env var instead of hard-coded localhost ──────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/* ─── design tokens ─────────────────────────────────────── */
const C = {
  accent:      "#ff5c35",
  accent2:     "#ff8162",
  positive:    "#e2a84b",
  amber:       "#f5a623",
  rose:        "#ff4d6d",
  sky:         "#38bdf8",
  violet:      "#a78bfa",
  bg:          "#080b12",
  muted:       "#6b7590",
  border:      "rgba(255,255,255,0.065)",
  borderStrong:"rgba(255,255,255,0.13)",
};

/* ─── types ──────────────────────────────────────────────────────────────────
   Must mirror UnifiedInterviewResult in resume.controller.ts.
   The feedback page only reads the snake_case fields; the camelCase aliases
   are present in the payload but not referenced here.
   ─────────────────────────────────────────────────────────────────────────── */
interface QuestionScore {
  index:      number;
  score:      number;    // 0-100
  difficulty: string;
  question:   string;
  feedback:   string;
  timestamp:  number;
}

interface HistoryEntry {
  interview_id: string;
  score:        number;
  role:         string;
  date_iso:     string;
}

interface ResultsData {
  // Metadata
  role:             string;
  interview_type:   string;
  candidate_name:   string;
  date_iso:         string;
  duration_seconds: number;
  recommendation:   string;

  // Narrative
  overall_score:   number;
  summary:         string;
  strengths:       string[];
  weaknesses:      string[];   // controller sends this key (= improvements)
  tips:            string[];

  // Charts
  skill_scores:    Record<string, number>;
  question_scores: QuestionScore[];
  history:         HistoryEntry[];
}

/* ─── helpers ───────────────────────────────────────────── */
const scoreColor = (s: number) => s >= 75 ? C.positive : s >= 55 ? C.amber : C.rose;
const scoreLabel = (s: number) => s >= 75 ? "Strong" : s >= 55 ? "Good" : "Needs Work";
const tagBg = (s: number) =>
  s >= 75 ? "rgba(226,168,75,0.1)" : s >= 55 ? "rgba(245,166,35,0.1)" : "rgba(255,77,109,0.1)";
const tagBorder = (s: number) =>
  s >= 75 ? "rgba(226,168,75,0.28)" : s >= 55 ? "rgba(245,166,35,0.28)" : "rgba(255,77,109,0.28)";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m} min ${s}s` : `${m} min`;
}
function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

const difficultyColor: Record<string, string> = {
  intro:  C.sky,
  easy:   C.positive,
  medium: C.amber,
  hard:   C.rose,
};

/* ─── hooks ─────────────────────────────────────────────── */
function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      start = Math.min(start + step, target);
      setVal(Math.floor(start));
      if (start >= target) clearInterval(id);
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

/* ─── sub-components ────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="chart-tooltip-value" style={{ color: p.color }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
};

function ScoreRing({ score, size = 140, stroke = 12 }: { score: number; size?: number; stroke?: number }) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const [dash, setDash] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setDash(circ * (score / 100)), 120);
    return () => clearTimeout(id);
  }, [circ, score]);
  const color    = scoreColor(score);
  const countVal = useCountUp(score);
  return (
    <div className="score-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)" }} />
      </svg>
      <div className="score-ring-inner">
        <span className="score-ring-number" style={{ color, fontSize: size * 0.24 }}>{countVal}</span>
        <span className="score-ring-denom">/100</span>
      </div>
    </div>
  );
}

function AnimBar({ score, delay = 0, color }: { score: number; delay?: number; color?: string }) {
  const w   = useBarWidth(score, delay);
  const col = color ?? scoreColor(score);
  return (
    <div className="anim-bar-track">
      <div className="anim-bar-fill" style={{
        width:      `${w}%`,
        background: `linear-gradient(90deg, ${col}aa, ${col})`,
        transition: "width 0.9s cubic-bezier(0.16,1,0.3,1)",
      }} />
    </div>
  );
}

/* ─── loading skeleton ──────────────────────────────────── */
function Skeleton() {
  return (
    <div className="fb-root" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "2rem" }}>
      {[180, 60, 300, 300].map((h, i) => (
        <div key={i} style={{ height: h, borderRadius: 12, background: "rgba(255,255,255,0.04)", animation: "pulse 1.5s ease-in-out infinite" }} />
      ))}
    </div>
  );
}

/* ─── page ──────────────────────────────────────────────── */
export default function FeedbackPage() {
  const router      = useRouter();
  const params      = useParams();
  const interviewId = params.id as string;

  const [data,    setData]    = useState<ResultsData | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "skills" | "timeline" | "feedback">("overview");

  // FIX: keep poll timeout in a ref so unmount cancels it (no leak)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!interviewId) return;

    const fetchResults = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/interview/${interviewId}/results`,
          { credentials: "include" },
        );

        if (res.status === 404) {
          // Results not ready yet — poll every 3 s
          pollRef.current = setTimeout(fetchResults, 3000);
          return;
        }

        // FIX: guard against non-JSON error bodies
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try { const j = await res.json(); detail = j?.message ?? detail; } catch { /* */ }
          throw new Error(detail);
        }

        let json: ResultsData;
        try { json = await res.json(); }
        catch { throw new Error("Server returned invalid JSON"); }

        // FIX: always default array fields so map/length never crash
        json.strengths       = Array.isArray(json.strengths)       ? json.strengths       : [];
        json.weaknesses      = Array.isArray(json.weaknesses)      ? json.weaknesses      : [];
        json.tips            = Array.isArray(json.tips)            ? json.tips            : [];
        json.question_scores = Array.isArray(json.question_scores) ? json.question_scores : [];
        json.history         = Array.isArray(json.history)         ? json.history         : [];
        json.skill_scores    = json.skill_scores ?? {};

        setData(json);
        setLoading(false);
      } catch (e: any) {
        setError(e.message || "Failed to load results");
        setLoading(false);
      }
    };

    fetchResults();

    // FIX: cancel any pending poll on unmount
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [interviewId]);

  if (loading) return <Skeleton />;
  if (error) return (
    <div className="fb-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ textAlign: "center", color: C.rose }}>
        <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⚠</div>
        <div>{error}</div>
        <button className="btn-ghost" style={{ marginTop: "1rem" }} onClick={() => window.location.reload()}>Retry</button>
      </div>
    </div>
  );
  if (!data) return null;

  /* ── Derived chart data ─────────────────────────────────────────────────── */

  const skillScores = Object.entries(data.skill_scores).map(([skill, score]) => ({
    skill, score, prev: 0,
    status: score >= 75 ? "high" : score >= 55 ? "medium" : "low",
  }));

  const radarData = skillScores.map((s) => ({ subject: s.skill, score: s.score, prev: s.prev }));

  // FIX: detect whether backend sends 0-based or 1-based question indices
  const indexBase = data.question_scores.length > 0 && data.question_scores[0]?.index === 0 ? 1 : 0;

  const timelineData = data.question_scores.map((q) => ({
    q:          `Q${q.index + indexBase}`,
    score:      q.score,
    difficulty: q.difficulty,
    event:      q.difficulty === "hard" ? "Hard Q" : undefined,
  }));

  // FIX: deduplicate history by interview_id (not score value)
  const historyData = data.history.map((h, i) => ({
    session:      `S${i + 1}`,
    score:        h.score,
    role:         h.role,
    interview_id: h.interview_id,
  }));
  const alreadyPresent = historyData.some((h) => h.interview_id === interviewId);
  if (!alreadyPresent) {
    historyData.push({ session: `S${historyData.length + 1}`, score: data.overall_score, role: data.role, interview_id: interviewId });
  }

  const previousScore = historyData.length >= 2
    ? historyData[historyData.length - 2]?.score ?? null
    : null;
  const scoreDelta = previousScore !== null ? data.overall_score - previousScore : null;

  const difficultyGroups = ["intro", "easy", "medium", "hard"].map((d) => ({
    phase:    d.charAt(0).toUpperCase() + d.slice(1),
    count:    data.question_scores.filter((q) => q.difficulty === d).length,
    avgScore: (() => {
      const qs = data.question_scores.filter((q) => q.difficulty === d);
      return qs.length ? Math.round(qs.reduce((s, q) => s + q.score, 0) / qs.length) : 0;
    })(),
    color: difficultyColor[d] || C.muted,
  })).filter((d) => d.count > 0);

  // FIX: safe modulo — guard empty skillScores before %
  const feedbackItems = [
    ...data.strengths.map((s, i) => ({
      id: `str-${i}`, type: "strength", icon: "✦",
      title: s.split(".")[0] || s, body: s,
      tag:   skillScores.length > 0 ? skillScores[i % skillScores.length]!.skill : "Strength",
    })),
    ...data.weaknesses.map((w, i) => ({
      id: `weak-${i}`, type: "improvement", icon: "◈",
      title: w.split(".")[0] || w, body: w,
      tag:   skillScores.length > 0
        ? skillScores[(skillScores.length - 1 - (i % skillScores.length))]!.skill
        : "Improvement",
    })),
    ...data.tips.map((t, i) => ({
      id: `tip-${i}`, type: "tip", icon: "→",
      title: t.split(".")[0] || t, body: t,
      tag:  "Pro Tip",
    })),
  ];

  const weakestSkillEntry = Object.entries(data.skill_scores).sort((a, b) => a[1] - b[1])[0];
  const weakestSkillName  = weakestSkillEntry?.[0] ?? "weak area";

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <>
      <div className="noise" />
      <div className="fb-root">

        {/* ══ TOP BAR ══ */}
        <header className="fb-topbar fade-down">
          <div className="fb-topbar-left">
            <Link href="/" className="fb-logo">Interview<span>AI</span></Link>
            <div className="fb-topbar-divider" />
            <span className="fb-topbar-title">Session Feedback</span>
          </div>
          <div className="fb-topbar-right">
            <button onClick={() => router.push("/dashboard")} className="btn-ghost">← Back to Dashboard</button>
          </div>
        </header>

        <main className="fb-main">

          {/* ══ HERO CARD ══ */}
          <section className="hero-card fade-up-0">
            <div className="hero-shine" />
            <div className="hero-body">
              <div className="hero-meta">
                <div className="hero-badge">
                  <span className="hero-badge-dot" />
                  {data.interview_type}
                </div>
                <h1 className="hero-title">{data.role} Interview</h1>
                <p className="hero-sub">
                  {formatDate(data.date_iso)} · {formatDuration(data.duration_seconds)} · InterviewAI
                </p>
                <div className="hero-delta-row">
                  {scoreDelta !== null && (
                    <span className="hero-delta-chip">
                      {scoreDelta >= 0 ? "↑" : "↓"} {scoreDelta >= 0 ? "+" : ""}{scoreDelta} pts vs last session
                    </span>
                  )}
                  {previousScore !== null && (
                    <span className="hero-prev-score">Previous: {previousScore}/100</span>
                  )}
                  <span className="hero-delta-chip" style={{
                    background: data.recommendation.includes("Strong") ? "rgba(226,168,75,0.15)"
                      : data.recommendation === "Hire"    ? "rgba(56,189,248,0.15)"
                      : data.recommendation === "No Hire" ? "rgba(255,77,109,0.15)"
                      : "rgba(167,139,250,0.15)",
                    color: data.recommendation.includes("Strong") ? C.positive
                      : data.recommendation === "Hire"    ? C.sky
                      : data.recommendation === "No Hire" ? C.rose
                      : C.violet,
                  }}>
                    {data.recommendation}
                  </span>
                </div>
              </div>

              <div className="hero-right">
                <ScoreRing score={data.overall_score} />
                <div className="hero-mini-stats">
                  {[
                    { label: "Strengths",    value: String(data.strengths.length),       cls: "stat-positive" },
                    { label: "Improvements", value: String(data.weaknesses.length),      cls: "stat-rose"     },
                    { label: "Questions",    value: String(data.question_scores.length), cls: "stat-sky"      },
                  ].map((s) => (
                    <div key={s.label} className="hero-mini-stat">
                      <span className={`hero-mini-val ${s.cls}`}>{s.value}</span>
                      <span className="hero-mini-label">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ══ TABS ══ */}
          <div className="fb-tabs fade-up-1">
            {(["overview", "skills", "timeline", "feedback"] as const).map((t) => (
              <button key={t} className={`fb-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* ══════ OVERVIEW TAB ══════ */}
          {tab === "overview" && (
            <div className="tab-grid-2 fade-up-2">

              {/* Score history */}
              <div className="panel panel-full">
                <div className="panel-shine" />
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Score History</h2>
                    <p className="panel-sub">All sessions</p>
                  </div>
                  {historyData.length >= 2 && (() => {
                    const delta = historyData[historyData.length - 1]!.score - historyData[0]!.score;
                    return <span className="chip-positive">{delta >= 0 ? "+" : ""}{delta} pts since start</span>;
                  })()}
                </div>
                {historyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={historyData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={C.accent} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={C.accent} stopOpacity={0}    />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="session" tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine y={data.overall_score} stroke="rgba(255,92,53,0.25)" strokeDasharray="4 4"
                        label={{ value: "Today", fill: C.accent2, fontSize: 10, fontFamily: "'Geist Mono',monospace" }} />
                      <Area type="monotone" dataKey="score" name="Score"
                        stroke={C.accent} strokeWidth={2.5} fill="url(#areaGrad)"
                        dot={{ fill: C.accent, strokeWidth: 0, r: 4 }}
                        activeDot={{ r: 6, fill: C.accent, stroke: C.bg, strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: "center", color: C.muted, padding: "3rem 0" }}>
                    No history yet — this is your first session!
                  </div>
                )}
              </div>

              {/* Score by difficulty */}
              <div className="panel">
                <div className="panel-shine" />
                <h2 className="panel-title">Score by Difficulty</h2>
                <p className="panel-sub" style={{ marginBottom: "1.5rem" }}>Average score per question type</p>
                {difficultyGroups.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={difficultyGroups} margin={{ top: 5, right: 5, bottom: 0, left: -25 }} barSize={28}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="phase" tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="avgScore" name="Avg Score" radius={[6, 6, 0, 0]}>
                        {/* FIX: stable key from phase name, not array index */}
                        {difficultyGroups.map((e) => <Cell key={e.phase} fill={e.color} fillOpacity={0.85} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: "center", color: C.muted, padding: "2rem 0" }}>No question data</div>
                )}
              </div>

              {/* Summary card */}
              <div className="panel">
                <div className="panel-shine" />
                <h2 className="panel-title">Interview Summary</h2>
                <p className="panel-sub" style={{ marginBottom: "1.5rem" }}>AI-generated assessment</p>
                <p style={{ color: "#b0b8cc", lineHeight: 1.7, fontSize: "0.9rem" }}>{data.summary}</p>
                {skillScores.length > 0 && (
                  <div style={{ marginTop: "1.5rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {skillScores.slice(0, 3).map(({ skill, score }) => (
                      <span key={skill} className="feedback-tag" style={{
                        border: `1px solid ${tagBorder(score)}`, background: tagBg(score),
                        color: scoreColor(score), padding: "0.25rem 0.6rem", borderRadius: "6px", fontSize: "0.75rem",
                      }}>
                        {skill}: {score}
                      </span>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ══════ SKILLS TAB ══════ */}
          {tab === "skills" && (
            <div className="tab-grid-2 fade-up-2">

              <div className="panel">
                <div className="panel-shine" />
                <h2 className="panel-title">Skill Radar</h2>
                <p className="panel-sub">Performance across all evaluated dimensions</p>
                {skillScores.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                      <PolarGrid stroke="rgba(255,255,255,0.07)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fill: "#6b7590" }} />
                      <Radar name="Score" dataKey="score" stroke={C.accent} fill={C.accent} fillOpacity={0.18} strokeWidth={2} />
                      <Tooltip content={<ChartTooltip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: "center", color: C.muted, padding: "3rem 0" }}>No skill data available</div>
                )}
              </div>

              <div className="panel">
                <div className="panel-shine" />
                <h2 className="panel-title">Score Breakdown</h2>
                <p className="panel-sub">Per-skill performance</p>
                {skillScores.length > 0 ? (
                  <div className="skill-list">
                    {skillScores.map((s, i) => (
                      <div key={s.skill} className="skill-row" style={{ animationDelay: `${i * 60}ms` }}>
                        <div className="skill-row-top">
                          <span className="skill-name">{s.skill}</span>
                          <div className="skill-row-right">
                            <span className="skill-tag" style={{ border: `1px solid ${tagBorder(s.score)}`, background: tagBg(s.score), color: scoreColor(s.score) }}>
                              {scoreLabel(s.score)}
                            </span>
                            <span className="skill-score-val" style={{ color: scoreColor(s.score) }}>{s.score}</span>
                          </div>
                        </div>
                        <AnimBar score={s.score} delay={i * 80} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", color: C.muted, padding: "2rem 0" }}>No skill data available</div>
                )}
              </div>

            </div>
          )}

          {/* ══════ TIMELINE TAB ══════ */}
          {tab === "timeline" && (
            <div className="tab-col fade-up-2">

              <div className="panel">
                <div className="panel-shine panel-shine-accent" />
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Score Per Question</h2>
                    <p className="panel-sub">Performance across the interview</p>
                  </div>
                  <span className="panel-sub">{data.question_scores.length} questions</span>
                </div>
                {timelineData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={timelineData} margin={{ top: 10, right: 20, bottom: 10, left: -20 }}>
                      <defs>
                        <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%"   stopColor={C.rose}     />
                          <stop offset="50%"  stopColor={C.amber}    />
                          <stop offset="100%" stopColor={C.positive} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="q" tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine y={75} stroke="rgba(226,168,75,0.2)" strokeDasharray="4 4"
                        label={{ value: "Target", fill: C.amber, fontSize: 10, fontFamily: "'Geist Mono',monospace" }} />
                      <Line type="monotone" dataKey="score" name="Score"
                        stroke="url(#lineGrad)" strokeWidth={3}
                        dot={(props: any) => {
                          const { cx, cy, payload } = props;
                          const color = difficultyColor[payload.difficulty] || C.accent2;
                          return <circle key={`dot-${payload.q}`} cx={cx} cy={cy} r={5} fill={color} stroke={C.bg} strokeWidth={2} />;
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: "center", color: C.muted, padding: "3rem 0" }}>No question data</div>
                )}
                <div className="event-legend">
                  {Object.entries(difficultyColor).map(([d, col]) => (
                    <div key={d} className="event-legend-item">
                      <div className="event-dot" style={{ background: col }} />
                      <span className="event-label">{d.charAt(0).toUpperCase() + d.slice(1)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-question cards */}
              <div className="phase-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                {data.question_scores.map((q) => {
                  const color = difficultyColor[q.difficulty] || C.muted;
                  return (
                    // FIX: stable key from question index, not array position
                    <div key={`q-${q.index}`} className="phase-card">
                      <div className="phase-card-top-bar" style={{ background: color }} />
                      <div className="phase-card-value" style={{ color }}>{q.score}</div>
                      <div className="phase-card-unit">/100</div>
                      <div className="phase-mini-bar-track">
                        <div className="phase-mini-bar-fill" style={{ width: `${q.score}%`, background: color }} />
                      </div>
                      <div className="phase-card-name">Q{q.index + indexBase}</div>
                      <div className="phase-card-pct" style={{ color }}>{q.difficulty}</div>
                      <div style={{
                        fontSize: "0.65rem", color: C.muted, marginTop: "0.4rem",
                        overflow: "hidden", display: "-webkit-box",
                        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        lineClamp: 2,
                      } as React.CSSProperties}>
                        {q.feedback}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════ FEEDBACK TAB ══════ */}
          {tab === "feedback" && (
            <div className="tab-col fade-up-2">

              <div className="fb-summary-pills">
                {[
                  { label: "Strengths",    count: data.strengths.length,  cls: "pill-gold" },
                  { label: "Improvements", count: data.weaknesses.length, cls: "pill-rose" },
                  { label: "Pro Tips",     count: data.tips.length,       cls: "pill-sky"  },
                ].map((p) => (
                  <div key={p.label} className={`summary-pill ${p.cls}`}>
                    <span className="summary-pill-count">{p.count}</span>
                    <span className="summary-pill-label">{p.label}</span>
                  </div>
                ))}
              </div>

              {feedbackItems.length > 0 ? feedbackItems.map((f, i) => {
                const isStrength  = f.type === "strength";
                const isTip       = f.type === "tip";
                const accentColor = isStrength ? C.positive : isTip ? C.sky : C.rose;
                const borderCol   = isStrength ? "rgba(226,168,75,0.2)"  : isTip ? "rgba(56,189,248,0.2)"  : "rgba(255,77,109,0.2)";
                const bgTint      = isStrength ? "rgba(226,168,75,0.04)" : isTip ? "rgba(56,189,248,0.04)" : "rgba(255,77,109,0.04)";
                return (
                  <div key={f.id} className="feedback-card" style={{ border: `1px solid ${borderCol}`, animationDelay: `${i * 70}ms` }}>
                    <div className="feedback-card-bg" style={{ background: bgTint }} />
                    <div className="feedback-card-bar" style={{ background: accentColor }} />
                    <div className="feedback-card-content">
                      <div className="feedback-card-header">
                        <div className="feedback-card-title-row">
                          <span className="feedback-icon" style={{ color: accentColor }}>{f.icon}</span>
                          <span className="feedback-title">{f.title}</span>
                        </div>
                        <span className="feedback-tag" style={{ border: `1px solid ${borderCol}`, background: bgTint, color: accentColor }}>
                          {f.tag}
                        </span>
                      </div>
                      <p className="feedback-body">{f.body}</p>
                    </div>
                  </div>
                );
              }) : (
                <div style={{ textAlign: "center", color: C.muted, padding: "3rem 0" }}>No feedback items available.</div>
              )}

              {/* FIX: guard empty weaknesses before accessing [0] */}
              {data.weaknesses.length > 0 && (
                <div className="cta-card">
                  <div className="cta-shine" />
                  <h3 className="cta-title">
                    Ready to improve your <span className="cta-highlight">{weakestSkillName}</span>?
                  </h3>
                  <p className="cta-sub">{data.weaknesses[0]}</p>
                  <button className="btn-cta">Start Targeted Session →</button>
                </div>
              )}

            </div>
          )}

        </main>
      </div>
    </>
  );
}