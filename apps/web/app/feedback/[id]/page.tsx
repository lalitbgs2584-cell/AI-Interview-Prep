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

/* ─── COLOR TOKENS (chart/SVG only — UI uses CSS vars) ───── */
const C = {
  accent:   "#ff5c35",
  accent2:  "#ff8162",
  positive: "#e2a84b",
  amber:    "#f5a623",
  rose:     "#ff4d6d",
  sky:      "#38bdf8",
  violet:   "#a78bfa",
  green:    "#4ade80",
  bg:       "#080b12",
  muted:    "#6b7590",
};

/* ─── TYPES ─────────────────────────────────────────────── */
interface WentPoint { point: string; tag: string; }

interface QuestionScore {
  index:            number;
  score:            number;
  difficulty:       "intro" | "easy" | "medium" | "hard";
  question:         string;
  user_answer?:     string;
  verdict:          string;
  feedback:         string;
  missing_concepts: string[];
  strengths:        string[];
  weaknesses:       string[];
  timestamp:        number;
  dimensions?:      Record<string, number>;
  analytics?: Record<string, any>;
  score_pillars?: Partial<ScorePillars>;
}

interface HistoryEntry {
  interview_id: string;
  score:        number;
  role:         string;
  date_iso:     string;
}

interface GapAnalysis {
  repeated_gaps:   string[];
  all_gaps:        string[];
  gap_frequency:   Record<string, number>;
  weak_dimensions: string[];
  dim_averages:    Record<string, number>;
}

interface ScorePillars {
  content_score: number;
  delivery_score: number;
  confidence_score: number;
  communication_flow_score: number;
}

interface SummaryAnalytics {
  filler_summary: {
    total_count?: number;
    average_density?: number;
    max_bursts?: number;
    strictness?: string;
  };
  flow_summary: {
    avg_wpm?: number;
    avg_pause_ratio?: number;
    long_pauses?: number;
    avg_latency_ms?: number;
    consistency?: number;
  };
  confidence_summary: {
    avg_score?: number;
    hedges?: number;
    self_corrections?: number;
    avg_vocal_stability?: number;
    avg_decisiveness?: number;
  };
  concept_coverage_trend: Array<Record<string, any>>;
}

interface ResultsData {
  role:             string;
  interview_type:   string;
  candidate_name:   string;
  date_iso:         string;
  duration_seconds: number;
  recommendation:   "Strong Hire" | "Hire" | "No Hire" | "Needs More Evaluation" | "Leaning No Hire";
  overall_score:    number;
  summary:          string;
  what_went_right:  WentPoint[];
  what_went_wrong:  WentPoint[];
  strengths:        string[];
  weaknesses:       string[];
  tips:             string[];
  skill_scores:     Record<string, number>;
  score_pillars:    ScorePillars;
  analytics:        SummaryAnalytics;
  recovery_score:   number;
  pressure_handling_score: number;
  conciseness_score: number;
  coaching_priorities: string[];
  final_improvement_plan?: {
    top_strengths: string[];
    top_weaknesses: string[];
    practice_next: string[];
  };
  question_scores:  QuestionScore[];
  history:          HistoryEntry[];
  gap_analysis?:    GapAnalysis;
}

/* ─── HELPERS ───────────────────────────────────────────── */
const scoreColor = (s: number) =>
  s >= 75 ? C.positive : s >= 55 ? C.amber : C.rose;
const scoreLabel = (s: number) =>
  s >= 75 ? "Strong" : s >= 55 ? "Good" : "Needs Work";

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

/* ─── HOOKS ─────────────────────────────────────────────── */
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

/* ─── CHART TOOLTIP ─────────────────────────────────────── */
const ChartTip = ({ active, payload, label }: any) => {
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

/* ─── SCORE RING ─────────────────────────────────────────── */
function ScoreRing({ score, size = 148, stroke = 11 }: {
  score: number; size?: number; stroke?: number;
}) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const [dash, setDash] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setDash(circ * (score / 100)), 150);
    return () => clearTimeout(id);
  }, [circ, score]);
  const color = scoreColor(score);
  const count = useCountUp(score);
  return (
    <div className="score-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 1.3s cubic-bezier(0.16,1,0.3,1)" }} />
      </svg>
      <div className="score-ring-inner">
        <span className="score-ring-number" style={{ fontSize: size * 0.22, color }}>{count}</span>
        <span className="score-ring-denom">/100</span>
      </div>
    </div>
  );
}

/* ─── ANIMATED BAR ───────────────────────────────────────── */
function AnimBar({ score, delay = 0, color }: {
  score: number; delay?: number; color?: string;
}) {
  const w   = useBarWidth(score, delay);
  const col = color ?? scoreColor(score);
  return (
    <div className="anim-bar-track">
      <div className="anim-bar-fill" style={{
        width: `${w}%`,
        background: `linear-gradient(90deg, ${col}88, ${col})`,
        transition: "width 0.9s cubic-bezier(0.16,1,0.3,1)",
      }} />
    </div>
  );
}

/* ─── SKELETON ───────────────────────────────────────────── */
function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {[180, 56, 300, 280].map((h, i) => (
        <div key={i} style={{
          height: h, borderRadius: 16,
          background: "rgba(255,255,255,0.04)",
          animation: `shimmerPass 1.8s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
    </div>
  );
}

/* ─── SKILL TAG ──────────────────────────────────────────── */
function SkillTag({ label, score }: { label: string; score: number }) {
  return (
    <span className="skill-tag" style={{
      background: score >= 75 ? "rgba(226,168,75,0.12)"
                : score >= 55 ? "rgba(56,189,248,0.1)"
                : "rgba(255,77,109,0.1)",
      color:      score >= 75 ? C.positive : score >= 55 ? C.sky : C.rose,
      border:     `0.5px solid ${score >= 75 ? "rgba(226,168,75,0.3)"
                               : score >= 55 ? "rgba(56,189,248,0.25)"
                               : "rgba(255,77,109,0.25)"}`,
    }}>{label}</span>
  );
}

/* ─── FEEDBACK TAG ───────────────────────────────────────── */
function FeedbackTag({ label, variant }: {
  label: string;
  variant: "good" | "bad" | "gap" | "neutral" | "tip";
}) {
  const map = {
    good:    { bg: "rgba(74,222,128,0.1)",  bd: "rgba(74,222,128,0.25)",  fg: C.green  },
    bad:     { bg: "rgba(255,77,109,0.1)",  bd: "rgba(255,77,109,0.25)",  fg: C.rose   },
    gap:     { bg: "rgba(255,92,53,0.1)",   bd: "rgba(255,92,53,0.25)",   fg: C.accent2},
    neutral: { bg: "rgba(255,255,255,0.06)",bd: "rgba(255,255,255,0.12)", fg: C.muted  },
    tip:     { bg: "rgba(56,189,248,0.1)",  bd: "rgba(56,189,248,0.25)",  fg: C.sky    },
  }[variant];
  return (
    <span className="feedback-tag" style={{
      background: map.bg, border: `0.5px solid ${map.bd}`, color: map.fg,
    }}>{label}</span>
  );
}

/* ─── GAP ANALYSIS PANEL ─────────────────────────────────── */
function GapAnalysisPanel({ gap }: { gap: GapAnalysis }) {
  const hasGaps = gap.repeated_gaps.length > 0;
  const hasWeak = gap.weak_dimensions.length > 0;
  const hasDims = Object.keys(gap.dim_averages).length > 0;
  if (!hasGaps && !hasWeak && !hasDims) return null;

  return (
    <div className="panel">
      <div className="panel-shine panel-shine-accent" />
      <div className="panel-header">
        <div>
          <div className="panel-title">Gap Analysis</div>
          <div className="panel-sub">Systemic patterns across all questions</div>
        </div>
      </div>

      {hasGaps && (
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{
            fontFamily: "var(--ff-mono)", fontSize: 11, color: C.muted,
            marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em",
          }}>Repeated Gaps — missed in 2+ questions</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {gap.repeated_gaps.map((g, i) => (
              <span key={i} className="feedback-tag" style={{
                background: "rgba(255,77,109,0.1)", border: "0.5px solid rgba(255,77,109,0.28)",
                color: C.rose, padding: "4px 12px",
              }}>{g}</span>
            ))}
          </div>
        </div>
      )}

      {hasWeak && (
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{
            fontFamily: "var(--ff-mono)", fontSize: 11, color: C.muted,
            marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em",
          }}>Weak Dimensions</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {gap.weak_dimensions.map((d, i) => (
              <span key={i} className="feedback-tag" style={{
                background: "rgba(255,92,53,0.1)", border: "0.5px solid rgba(255,92,53,0.28)",
                color: C.accent2, padding: "4px 12px",
              }}>{d}</span>
            ))}
          </div>
        </div>
      )}

      {hasDims && (
        <div>
          <div style={{
            fontFamily: "var(--ff-mono)", fontSize: 11, color: C.muted,
            marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.07em",
          }}>Dimension Averages (0–10)</div>
          <div className="skill-list" style={{ marginTop: 0 }}>
            {Object.entries(gap.dim_averages).map(([dim, avg], i) => (
              <div key={dim} className="skill-row" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="skill-row-top">
                  <span className="skill-name" style={{ textTransform: "capitalize" }}>
                    {dim.replace(/_/g, " ")}
                  </span>
                  <span className="skill-score-val" style={{ color: scoreColor(avg * 10) }}>
                    {avg}/10
                  </span>
                </div>
                <AnimBar score={avg * 10} delay={i * 60} color={scoreColor(avg * 10)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── MISSING CONCEPTS ───────────────────────────────────── */
function MissingConceptsChips({ concepts }: { concepts: string[] }) {
  if (!concepts.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {concepts.map((c, i) => (
        <span key={i} className="feedback-tag" style={{
          background: "rgba(255,77,109,0.07)", border: "0.5px solid rgba(255,77,109,0.18)",
          color: C.rose, fontSize: 10,
        }}>✕ {c}</span>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
export default function FeedbackPage() {
  const router      = useRouter();
  const params      = useParams();
  const interviewId = params.id as string;

  const [data,    setData]    = useState<ResultsData | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "breakdown" | "questions" | "feedback">("overview");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!interviewId) return;
    const fetchResults = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/interview/${interviewId}/results`, {
          credentials: "include",
        });
        if (res.status === 404) { pollRef.current = setTimeout(fetchResults, 3000); return; }
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try { const j = await res.json(); detail = j?.message ?? j?.error ?? detail; } catch {}
          throw new Error(detail);
        }
        let json: ResultsData;
        try { json = await res.json(); } catch { throw new Error("Invalid JSON from server"); }

        // Defensive normalisation
        json.what_went_right = Array.isArray(json.what_went_right) ? json.what_went_right : [];
        json.what_went_wrong = Array.isArray(json.what_went_wrong) ? json.what_went_wrong : [];
        json.strengths       = Array.isArray(json.strengths)       ? json.strengths       : [];
        json.weaknesses      = Array.isArray(json.weaknesses)      ? json.weaknesses      : [];
        json.tips            = Array.isArray(json.tips)            ? json.tips            : [];
        json.question_scores = Array.isArray(json.question_scores) ? json.question_scores : [];
        json.history         = Array.isArray(json.history)         ? json.history         : [];
        json.skill_scores    = json.skill_scores ?? {};
        json.score_pillars   = json.score_pillars ?? {
          content_score: json.overall_score ?? 0,
          delivery_score: json.overall_score ?? 0,
          confidence_score: json.overall_score ?? 0,
          communication_flow_score: json.overall_score ?? 0,
        };
        json.analytics = json.analytics ?? {
          filler_summary: {},
          flow_summary: {},
          confidence_summary: {},
          concept_coverage_trend: [],
        };
        json.recovery_score = Number(json.recovery_score ?? 0);
        json.pressure_handling_score = Number(json.pressure_handling_score ?? 0);
        json.conciseness_score = Number(json.conciseness_score ?? 0);
        json.coaching_priorities = Array.isArray(json.coaching_priorities) ? json.coaching_priorities : [];
        json.final_improvement_plan = json.final_improvement_plan ?? {
          top_strengths: json.strengths.slice(0, 3),
          top_weaknesses: json.weaknesses.slice(0, 3),
          practice_next: json.coaching_priorities.slice(0, 3),
        };
        json.gap_analysis    = json.gap_analysis ?? {
          repeated_gaps: [], all_gaps: [], gap_frequency: {},
          weak_dimensions: [], dim_averages: {},
        };
        json.question_scores = json.question_scores.map((q) => ({
          ...q,
          verdict:          q.verdict  || q.feedback || "No feedback available",
          feedback:         q.feedback || q.verdict  || "No feedback available",
          user_answer:      q.user_answer || "",
          dimensions:       q.dimensions ?? {},
          missing_concepts: Array.isArray(q.missing_concepts) ? q.missing_concepts : [],
          strengths:        Array.isArray(q.strengths)        ? q.strengths        : [],
          weaknesses:       Array.isArray(q.weaknesses)       ? q.weaknesses       : [],
        }));

        setData(json);
        setLoading(false);
      } catch (e: any) {
        setError(e.message || "Failed to load results");
        setLoading(false);
      }
    };
    fetchResults();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [interviewId]);

  /* ── Loading ─────────────────────────────────────────────── */
  if (loading) return (
    <div className="fb-root">
      <div className="noise" />
      <nav className="fb-topbar fade-down">
        <div className="fb-topbar-left">
          <span className="fb-logo">Interview<span>AI</span></span>
        </div>
      </nav>
      <main className="fb-main"><Skeleton /></main>
    </div>
  );

  /* ── Error ───────────────────────────────────────────────── */
  if (error) return (
    <div className="fb-root" style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="noise" />
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠</div>
        <div style={{ color: C.rose, marginBottom: 16, fontSize: "0.9rem" }}>{error}</div>
        <button className="btn-ghost" onClick={() => window.location.reload()}>Retry</button>
      </div>
    </div>
  );

  if (!data) return null;

  /* ── DERIVED DATA ────────────────────────────────────────── */
  const skillScores = Object.entries(data.skill_scores).map(([skill, score]) => ({ skill, score }));
  const pillarScores = [
    { skill: "Content", score: data.score_pillars.content_score, color: C.accent },
    { skill: "Delivery", score: data.score_pillars.delivery_score, color: C.sky },
    { skill: "Confidence", score: data.score_pillars.confidence_score, color: C.amber },
    { skill: "Flow", score: data.score_pillars.communication_flow_score, color: C.green },
  ];
  const radarData   = skillScores.map((s) => ({ subject: s.skill, score: s.score }));
  const indexBase   = data.question_scores.length > 0 && data.question_scores[0]?.index === 0 ? 1 : 0;

  const timelineData = data.question_scores.map((q) => ({
    q: `Q${q.index + indexBase}`, score: q.score, difficulty: q.difficulty,
  }));

  const historyData = data.history.map((h, i) => ({
    session: `S${i + 1}`, score: h.score, interview_id: h.interview_id,
  }));
  if (!historyData.some((h) => h.interview_id === interviewId)) {
    historyData.push({
      session: `S${historyData.length + 1}`,
      score: data.overall_score,
      interview_id: interviewId,
    });
  }

  const previousScore = historyData.length >= 2
    ? historyData[historyData.length - 2]?.score ?? null : null;
  const scoreDelta = previousScore !== null ? data.overall_score - previousScore : null;

  const difficultyGroups = ["intro", "easy", "medium", "hard"].map((d) => {
    const qs = data.question_scores.filter((q) => q.difficulty === d);
    return {
      phase:    d.charAt(0).toUpperCase() + d.slice(1),
      count:    qs.length,
      avgScore: qs.length ? Math.round(qs.reduce((s, q) => s + q.score, 0) / qs.length) : 0,
      color:    DIFF_COLOR[d] || C.muted,
    };
  }).filter((d) => d.count > 0);

  const rightItems: WentPoint[] = data.what_went_right.length > 0
    ? data.what_went_right
    : data.strengths.map((s) => ({ point: s, tag: "Strength" }));
  const wrongItems: WentPoint[] = data.what_went_wrong.length > 0
    ? data.what_went_wrong
    : data.weaknesses.map((w) => ({ point: w, tag: "Gap" }));
  const fillerSummary = data.analytics.filler_summary ?? {};
  const flowSummary = data.analytics.flow_summary ?? {};
  const confidenceSummary = data.analytics.confidence_summary ?? {};
  const coverageTrend = Array.isArray(data.analytics.concept_coverage_trend)
    ? data.analytics.concept_coverage_trend.map((point, i) => ({
        q: `Q${point.question_order ?? i + 1}`,
        coverage: Number(point.coverage_score ?? 0),
        difficulty: String(point.difficulty ?? "unknown"),
      }))
    : [];
  const avgDimension = (keys: string[], fallback = 0) => {
    const vals = data.question_scores
      .map((q) =>
        keys
          .map((key) => Number(q.dimensions?.[key] ?? NaN))
          .find((value) => Number.isFinite(value)),
      )
      .filter((value): value is number => Number.isFinite(value));
    return vals.length
      ? Math.round((vals.reduce((sum, value) => sum + value, 0) / vals.length) * 10)
      : fallback;
  };
  const richBreakdown = [
    { label: "Content", score: Number(data.score_pillars.content_score ?? data.overall_score), note: "Covers the actual core of the answer" },
    { label: "Clarity", score: avgDimension(["clarity"], Number(data.skill_scores.Clarity ?? data.skill_scores.Communication ?? 0)), note: "How clearly your ideas landed" },
    { label: "Confidence", score: Number(data.score_pillars.confidence_score ?? confidenceSummary.avg_score ?? 0), note: "Directness, decisiveness, and control" },
    { label: "Relevance", score: coverageTrend.length ? Math.round(coverageTrend.reduce((sum, point) => sum + point.coverage, 0) / coverageTrend.length) : Number(data.score_pillars.content_score ?? 0), note: "Stayed aligned with what the question asked" },
    { label: "Structure", score: avgDimension(["star_structure"], Number(data.score_pillars.delivery_score ?? 0)), note: "How well the answer followed a clean shape" },
    { label: "Communication", score: avgDimension(["communication"], Number(data.skill_scores.Communication ?? 0)), note: "Professional tone and delivery" },
  ];
  const improvementPlan = data.final_improvement_plan ?? {
    top_strengths: rightItems.slice(0, 3).map((item) => item.point),
    top_weaknesses: wrongItems.slice(0, 3).map((item) => item.point),
    practice_next: (data.coaching_priorities.length ? data.coaching_priorities : data.tips).slice(0, 3),
  };
  const insightCards = [
    { label: "Recovery", value: data.recovery_score, color: C.accent2 },
    { label: "Pressure", value: data.pressure_handling_score, color: C.rose },
    { label: "Conciseness", value: data.conciseness_score, color: C.sky },
    { label: "Confidence", value: Number(confidenceSummary.avg_score ?? data.score_pillars.confidence_score ?? 0), color: C.green },
  ];

  const TABS = [
    { id: "overview"  as const, label: "Overview"  },
    { id: "breakdown" as const, label: "Skills"    },
    { id: "questions" as const, label: "Questions" },
    { id: "feedback"  as const, label: "Feedback"  },
  ];

  /* ── REC COLOUR for hero badge ───────────────────────────── */
  const recColor =
    data.recommendation === "Strong Hire"          ? C.green   :
    data.recommendation === "Hire"                 ? C.sky     :
    data.recommendation === "No Hire"              ? C.rose    :
    data.recommendation === "Leaning No Hire"      ? C.amber   : C.violet;

  return (
    <div className="fb-root">
      <div className="noise" />

      {/* ── TOP BAR ─────────────────────────────────────────── */}
      <nav className="fb-topbar fade-down">
        <div className="fb-topbar-left">
          <Link href="/dashboard" className="fb-logo">Interview<span>AI</span></Link>
          <div className="fb-topbar-divider" />
          <span className="fb-topbar-title">Session Feedback</span>
        </div>
        <div className="fb-topbar-right">
          <button className="btn-ghost" onClick={() => router.push("/dashboard")}>
            ← Dashboard
          </button>
        </div>
      </nav>

      <main className="fb-main">

        {/* ══ HERO CARD ════════════════════════════════════════ */}
        <div className="hero-card fade-up-0">
          <div className="hero-shine" />
          <div className="hero-body">

            {/* left */}
            <div className="hero-meta">
              <div className="hero-badge">
                <div className="hero-badge-dot" />
                {data.interview_type.toUpperCase()}
                <span style={{ color: "var(--muted)", margin: "0 4px" }}>·</span>
                <span style={{ color: recColor }}>{data.recommendation}</span>
              </div>
              <h1 className="hero-title">{data.role}</h1>
              <div className="hero-sub">
                {formatDate(data.date_iso)}&nbsp;&nbsp;·&nbsp;&nbsp;{formatDuration(data.duration_seconds)}
              </div>
              <p style={{
                fontSize: "0.88rem", color: "var(--text-2)",
                lineHeight: 1.8, marginTop: "1rem", maxWidth: 500,
              }}>{data.summary}</p>

              {scoreDelta !== null && (
                <div className="hero-delta-row">
                  <span className="hero-delta-chip" style={{
                    background:   scoreDelta >= 0 ? "rgba(226,168,75,0.1)" : "rgba(255,77,109,0.1)",
                    borderColor:  scoreDelta >= 0 ? "rgba(226,168,75,0.28)" : "rgba(255,77,109,0.28)",
                    color:        scoreDelta >= 0 ? C.positive : C.rose,
                  }}>
                    {scoreDelta >= 0 ? "↑" : "↓"} {scoreDelta >= 0 ? "+" : ""}{scoreDelta} pts vs last session
                  </span>
                  {previousScore !== null && (
                    <span className="hero-prev-score">Previous: {previousScore}</span>
                  )}
                </div>
              )}
            </div>

            {/* right */}
            <div className="hero-right">
              <ScoreRing score={data.overall_score} />
              <div className="hero-mini-stats">
                <div className="hero-mini-stat">
                  <div className="hero-mini-val stat-positive">{rightItems.length}</div>
                  <div className="hero-mini-label">Strengths</div>
                </div>
                <div className="hero-mini-stat">
                  <div className="hero-mini-val stat-rose">{wrongItems.length}</div>
                  <div className="hero-mini-label">To Fix</div>
                </div>
                <div className="hero-mini-stat">
                  <div className="hero-mini-val stat-sky">{data.question_scores.length}</div>
                  <div className="hero-mini-label">Questions</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ TABS ═════════════════════════════════════════════ */}
        <div className="fb-tabs fade-up-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`fb-tab${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
            >{t.label}</button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════
            OVERVIEW TAB
        ════════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <div className="tab-col fade-up-2">

            <div className="panel">
              <div className="panel-shine panel-shine-accent" />
              <div className="panel-header">
                <div>
                  <div className="panel-title">Rich Feedback Breakdown</div>
                  <div className="panel-sub">Strict scoring across the core interview dimensions</div>
                </div>
              </div>
              <div className="skill-list">
                {richBreakdown.map((item, i) => (
                  <div key={item.label} className="skill-row" style={{ animationDelay: `${i * 0.05}s` }}>
                    <div className="skill-row-top">
                      <span className="skill-name">{item.label}</span>
                      <div className="skill-row-right">
                        <SkillTag label={scoreLabel(item.score)} score={item.score} />
                        <span className="skill-score-val" style={{ color: scoreColor(item.score) }}>{item.score}</span>
                      </div>
                    </div>
                    <AnimBar score={item.score} delay={i * 60} />
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>{item.note}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="tab-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "1rem" }}>
              {[
                { title: "Top 3 strengths", items: improvementPlan.top_strengths, color: C.green },
                { title: "Top 3 weaknesses", items: improvementPlan.top_weaknesses, color: C.rose },
                { title: "What to practice next", items: improvementPlan.practice_next, color: C.sky },
              ].map((group) => (
                <div key={group.title} className="panel">
                  <div className="panel-header">
                    <div>
                      <div className="panel-title" style={{ color: group.color }}>{group.title}</div>
                      <div className="panel-sub">Focused next-step coaching</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                    {(group.items.length ? group.items : ["No data available yet"]).map((item, i) => (
                      <div key={`${group.title}-${i}`} style={{
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: "0.75rem 0.85rem",
                        background: "rgba(255,255,255,0.03)",
                        fontSize: "0.8rem",
                        lineHeight: 1.6,
                      }}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Score History */}
            <div className="panel">
              <div className="panel-shine" />
              <div className="panel-header">
                <div>
                  <div className="panel-title">Score History</div>
                  <div className="panel-sub">Performance across all sessions</div>
                </div>
                {historyData.length >= 2 && (() => {
                  const delta = historyData[historyData.length - 1]!.score - historyData[0]!.score;
                  return (
                    <span className="chip-positive" style={{
                      color: delta >= 0 ? C.positive : C.rose,
                      background: delta >= 0 ? "rgba(226,168,75,0.1)" : "rgba(255,77,109,0.1)",
                      borderColor: delta >= 0 ? "rgba(226,168,75,0.25)" : "rgba(255,77,109,0.25)",
                    }}>
                      {delta >= 0 ? "+" : ""}{delta} pts since start
                    </span>
                  );
                })()}
              </div>
              {historyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={historyData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="agrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={C.accent} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={C.accent} stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="session" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine y={data.overall_score} stroke="rgba(255,92,53,0.2)" strokeDasharray="4 4"
                      label={{ value: "Today", fill: C.accent2, fontSize: 10 }} />
                    <Area type="monotone" dataKey="score" name="Score"
                      stroke={C.accent} strokeWidth={2.5} fill="url(#agrad)"
                      dot={{ fill: C.accent, strokeWidth: 0, r: 4 }}
                      activeDot={{ r: 6, fill: C.accent, stroke: C.bg, strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: "center", color: C.muted, padding: "3rem 0", fontFamily: "var(--ff-mono)", fontSize: 13 }}>
                  First session — history will appear here.
                </div>
              )}
            </div>

            <div className="tab-grid-2">
              <div className="panel">
                <div className="panel-shine panel-shine-accent" />
                <div className="panel-header">
                  <div>
                    <div className="panel-title">Strict Speech Signals</div>
                    <div className="panel-sub">Filler words, confidence, and flow are scored harshly</div>
                  </div>
                </div>
                <div className="skill-list">
                  {[
                    { skill: "Filler Count", score: Math.max(0, 100 - Number(fillerSummary.total_count ?? 0) * 8), meta: `${fillerSummary.total_count ?? 0} used` },
                    { skill: "Filler Density", score: Math.max(0, 100 - Number(fillerSummary.average_density ?? 0) * 8), meta: `${fillerSummary.average_density ?? 0}/100 words` },
                    { skill: "Flow Consistency", score: Number(flowSummary.consistency ?? 0), meta: `${flowSummary.avg_wpm ?? 0} WPM` },
                    { skill: "Confidence Signals", score: Number(confidenceSummary.avg_score ?? 0), meta: `${confidenceSummary.hedges ?? 0} hedges` },
                  ].map((item, i) => (
                    <div key={item.skill} className="skill-row" style={{ animationDelay: `${i * 0.06}s` }}>
                      <div className="skill-row-top">
                        <span className="skill-name">{item.skill}</span>
                        <div className="skill-row-right">
                          <span className="skill-score-val" style={{ color: scoreColor(item.score) }}>{item.score}</span>
                        </div>
                      </div>
                      <AnimBar score={item.score} delay={i * 50} />
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>{item.meta}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-shine" />
                <div className="panel-header">
                  <div>
                    <div className="panel-title">Coverage Trend</div>
                    <div className="panel-sub">How well you covered expected concepts question by question</div>
                  </div>
                </div>
                {coverageTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={190}>
                    <LineChart data={coverageTrend} margin={{ top: 8, right: 12, bottom: 8, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="q" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <ReferenceLine y={70} stroke="rgba(255,92,53,0.22)" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="coverage" name="Coverage" stroke={C.accent2} strokeWidth={2.5} dot={{ r: 4, fill: C.accent2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: "center", color: C.muted, padding: "3rem 0" }}>No coverage data</div>
                )}
              </div>
            </div>

            <div className="tab-grid-2">
              {/* Difficulty chart */}
              <div className="panel">
                <div className="panel-shine" />
                <div className="panel-header">
                  <div>
                    <div className="panel-title">Score by Difficulty</div>
                    <div className="panel-sub">Avg per question tier</div>
                  </div>
                </div>
                {difficultyGroups.length > 0 ? (
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={difficultyGroups} margin={{ top: 5, right: 5, bottom: 0, left: -25 }} barSize={28}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="phase" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="avgScore" name="Avg" radius={[6, 6, 0, 0]}>
                        {difficultyGroups.map((e) => <Cell key={e.phase} fill={e.color} fillOpacity={0.85} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: "center", color: C.muted, padding: "2rem 0" }}>No data</div>
                )}
              </div>

              {/* Skills snapshot */}
              <div className="panel">
                <div className="panel-shine" />
                <div className="panel-header">
                  <div>
                    <div className="panel-title">Skills Snapshot</div>
                    <div className="panel-sub">From this session</div>
                  </div>
                </div>
                <div className="skill-list">
                  {skillScores.slice(0, 5).map((s, i) => (
                    <div key={s.skill} className="skill-row" style={{ animationDelay: `${i * 0.07}s` }}>
                      <div className="skill-row-top">
                        <span className="skill-name">{s.skill}</span>
                        <div className="skill-row-right">
                          <SkillTag label={scoreLabel(s.score)} score={s.score} />
                          <span className="skill-score-val" style={{ color: scoreColor(s.score) }}>{s.score}</span>
                        </div>
                      </div>
                      <AnimBar score={s.score} delay={i * 80} />
                    </div>
                  ))}
                  {skillScores.length === 0 && (
                    <div style={{ textAlign: "center", color: C.muted, padding: "1rem 0", fontFamily: "var(--ff-mono)", fontSize: 12 }}>
                      No skill data
                    </div>
                  )}
                </div>
              </div>
            </div>

            {data.gap_analysis && (
              data.gap_analysis.repeated_gaps.length > 0 ||
              data.gap_analysis.weak_dimensions.length > 0 ||
              Object.keys(data.gap_analysis.dim_averages).length > 0
            ) && <GapAnalysisPanel gap={data.gap_analysis} />}
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            BREAKDOWN TAB
        ════════════════════════════════════════════════════ */}
        {tab === "breakdown" && (
          <div className="tab-col fade-up-2">
            <div className="tab-grid-2">
              {/* Radar */}
              <div className="panel">
                <div className="panel-shine panel-shine-accent" />
                <div className="panel-header">
                  <div>
                    <div className="panel-title">Skill Radar</div>
                    <div className="panel-sub">All evaluated dimensions</div>
                  </div>
                </div>
                {skillScores.length > 0 ? (
                  <ResponsiveContainer width="100%" height={290}>
                    <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                      <PolarGrid stroke="rgba(255,255,255,0.07)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: C.muted }} />
                      <Radar name="Score" dataKey="score"
                        stroke={C.accent} fill={C.accent} fillOpacity={0.15} strokeWidth={2} />
                      <Tooltip content={<ChartTip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: "center", color: C.muted, padding: "3rem 0" }}>No skill data</div>
                )}
              </div>

              {/* Skill bars */}
              <div className="panel">
                <div className="panel-shine" />
                <div className="panel-header">
                  <div>
                    <div className="panel-title">Score Breakdown</div>
                    <div className="panel-sub">Per-skill performance</div>
                  </div>
                </div>
                <div className="skill-list">
                  {skillScores.map((s, i) => (
                    <div key={s.skill} className="skill-row" style={{ animationDelay: `${i * 0.07}s` }}>
                      <div className="skill-row-top">
                        <span className="skill-name">{s.skill}</span>
                        <div className="skill-row-right">
                          <SkillTag label={scoreLabel(s.score)} score={s.score} />
                          <span className="skill-score-val" style={{ color: scoreColor(s.score) }}>{s.score}</span>
                        </div>
                      </div>
                      <AnimBar score={s.score} delay={i * 80} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="tab-grid-2">
              <div className="panel">
                <div className="panel-shine panel-shine-accent" />
                <div className="panel-header">
                  <div>
                    <div className="panel-title">Score Pillars</div>
                    <div className="panel-sub">Strict per-interview grading dimensions</div>
                  </div>
                </div>
                <div className="skill-list">
                  {pillarScores.map((item, i) => (
                    <div key={item.skill} className="skill-row" style={{ animationDelay: `${i * 0.07}s` }}>
                      <div className="skill-row-top">
                        <span className="skill-name">{item.skill}</span>
                        <span className="skill-score-val" style={{ color: item.color }}>{item.score}</span>
                      </div>
                      <AnimBar score={item.score} delay={i * 70} color={item.color} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-shine" />
                <div className="panel-header">
                  <div>
                    <div className="panel-title">Interview Insights</div>
                    <div className="panel-sub">Recovery, pressure, and tightness of communication</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  {insightCards.map((card) => (
                    <div key={card.label} style={{
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 14,
                      padding: "14px 16px",
                      background: "rgba(255,255,255,0.03)",
                    }}>
                      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{card.label}</div>
                      <div style={{ color: card.color, fontSize: 28, fontWeight: 800, lineHeight: 1.1, marginTop: 8 }}>{card.value}</div>
                      <div style={{ marginTop: 10 }}><AnimBar score={card.value} color={card.color} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {data.gap_analysis && Object.keys(data.gap_analysis.dim_averages).length > 0 && (
              <GapAnalysisPanel gap={data.gap_analysis} />
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            QUESTIONS TAB
        ════════════════════════════════════════════════════ */}
        {tab === "questions" && (
          <div className="tab-col fade-up-2">

            {/* Timeline chart */}
            <div className="panel">
              <div className="panel-shine" />
              <div className="panel-header">
                <div>
                  <div className="panel-title">Score Per Question</div>
                  <div className="panel-sub">Progression through the interview</div>
                </div>
                <span className="chip-positive">{data.question_scores.length} questions</span>
              </div>
              {timelineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={timelineData} margin={{ top: 8, right: 16, bottom: 8, left: -20 }}>
                    <defs>
                      <linearGradient id="lgrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%"   stopColor={C.rose}     />
                        <stop offset="50%"  stopColor={C.amber}    />
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
                      stroke="url(#lgrad)" strokeWidth={2.5}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        const col = DIFF_COLOR[payload.difficulty] || C.accent2;
                        return <circle key={`d-${payload.q}`} cx={cx} cy={cy} r={5}
                          fill={col} stroke={C.bg} strokeWidth={2} />;
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: "center", color: C.muted, padding: "3rem 0" }}>No question data</div>
              )}
              <div className="event-legend">
                {Object.entries(DIFF_COLOR).map(([d, col]) => (
                  <div key={d} className="event-legend-item">
                    <div className="event-dot" style={{ background: col }} />
                    <span className="event-label" style={{ textTransform: "capitalize" }}>{d}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Question cards */}
            {data.question_scores.map((q, i) => {
              const col     = DIFF_COLOR[q.difficulty] || C.muted;
              const hasGaps = q.missing_concepts.length > 0;
              const hasDets = q.strengths.length > 0 || q.weaknesses.length > 0;
              return (
                <div key={`q-${q.index}-${i}`} className="panel"
                  style={{ animationDelay: `${i * 0.04}s` }}>
                  <div className="panel-shine" />
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr auto",
                    gap: "1rem",
                    alignItems: "flex-start",
                  }}>
                    {/* Badge */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      background: `${col}15`, border: `1px solid ${col}40`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--ff-mono)", fontSize: 11, fontWeight: 700, color: col,
                    }}>Q{q.index + indexBase}</div>

                    {/* Body */}
                    <div>
                      <p style={{
                        fontSize: "0.875rem", color: "var(--text)",
                        margin: "0 0 6px", lineHeight: 1.6, fontWeight: 500,
                      }}>{q.question}</p>

                      {q.verdict && q.verdict !== "No feedback available" && (
                        <p style={{
                          fontSize: "0.8rem", color: "var(--text-3)",
                          margin: "0 0 8px", lineHeight: 1.75,
                        }}>{q.verdict}</p>
                      )}

                      {hasGaps && <MissingConceptsChips concepts={q.missing_concepts} />}

                      {hasDets && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                          {q.strengths.map((s, si) => (
                            <span key={si} className="feedback-tag" style={{
                              background: "rgba(74,222,128,0.08)",
                              border: "0.5px solid rgba(74,222,128,0.2)",
                              color: C.green, fontSize: 10,
                            }}>✓ {s}</span>
                          ))}
                          {q.weaknesses.map((w, wi) => (
                            <span key={wi} className="feedback-tag" style={{
                              background: "rgba(255,77,109,0.08)",
                              border: "0.5px solid rgba(255,77,109,0.2)",
                              color: C.rose, fontSize: 10,
                            }}>✕ {w}</span>
                          ))}
                        </div>
                      )}

                      <div style={{ marginTop: 10 }}>
                        <FeedbackTag
                          label={q.difficulty}
                          variant={q.difficulty === "hard" ? "bad"
                            : q.difficulty === "easy" || q.difficulty === "intro" ? "good"
                            : "neutral"}
                        />
                      </div>
                    </div>

                    {/* Score */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{
                        fontFamily: "var(--ff-display)", fontSize: "1.6rem",
                        fontWeight: 800, color: col, lineHeight: 1,
                      }}>{q.score}</div>
                      <div style={{ fontFamily: "var(--ff-mono)", fontSize: 10, color: C.muted }}>/100</div>
                      <div style={{
                        marginTop: 6, width: 52, height: 3, borderRadius: 2,
                        background: "rgba(255,255,255,0.07)",
                      }}>
                        <div style={{
                          height: "100%", width: `${q.score}%`, borderRadius: 2,
                          background: col, transition: "width 0.8s var(--ease-snap)",
                        }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            FEEDBACK TAB
        ════════════════════════════════════════════════════ */}
        {tab === "feedback" && (
          <div className="tab-col fade-up-2">

            {/* What went right / wrong */}
            <div className="tab-grid-2">

              {/* Right */}
              <div className="panel">
                <div className="panel-shine" />
                <div className="panel-header">
                  <div>
                    <div className="panel-title" style={{ color: C.green }}>What went right</div>
                    <div className="panel-sub">{rightItems.length} strength{rightItems.length !== 1 ? "s" : ""} identified</div>
                  </div>
                  <div className="summary-pill pill-gold">
                    <span className="summary-pill-count">{rightItems.length}</span>
                    <span className="summary-pill-label">good</span>
                  </div>
                </div>
                {rightItems.length > 0 ? rightItems.map((item, i) => (
                  <div key={i} className="feedback-card" style={{
                    marginBottom: i < rightItems.length - 1 ? 8 : 0,
                    border: "1px solid rgba(74,222,128,0.1)",
                    animationDelay: `${i * 0.06}s`,
                  }}>
                    <div className="feedback-card-bg" style={{ background: "rgba(74,222,128,0.03)" }} />
                    <div className="feedback-card-bar" style={{ background: C.green }} />
                    <div className="feedback-card-content">
                      <div className="feedback-card-header">
                        <div className="feedback-card-title-row">
                          <span className="feedback-icon" style={{ color: C.green }}>✓</span>
                          <FeedbackTag label={item.tag} variant="good" />
                        </div>
                      </div>
                      <p className="feedback-body">{item.point}</p>
                    </div>
                  </div>
                )) : (
                  <p style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "1.5rem 0" }}>
                    None identified
                  </p>
                )}
              </div>

              {/* Wrong */}
              <div className="panel">
                <div className="panel-shine" />
                <div className="panel-header">
                  <div>
                    <div className="panel-title" style={{ color: C.rose }}>What went wrong</div>
                    <div className="panel-sub">{wrongItems.length} gap{wrongItems.length !== 1 ? "s" : ""} identified</div>
                  </div>
                  <div className="summary-pill pill-rose">
                    <span className="summary-pill-count">{wrongItems.length}</span>
                    <span className="summary-pill-label">gaps</span>
                  </div>
                </div>
                {wrongItems.length > 0 ? wrongItems.map((item, i) => (
                  <div key={i} className="feedback-card" style={{
                    marginBottom: i < wrongItems.length - 1 ? 8 : 0,
                    border: "1px solid rgba(255,77,109,0.1)",
                    animationDelay: `${i * 0.06}s`,
                  }}>
                    <div className="feedback-card-bg" style={{ background: "rgba(255,77,109,0.03)" }} />
                    <div className="feedback-card-bar" style={{ background: C.rose }} />
                    <div className="feedback-card-content">
                      <div className="feedback-card-header">
                        <div className="feedback-card-title-row">
                          <span className="feedback-icon" style={{ color: C.rose }}>✕</span>
                          <FeedbackTag label={item.tag} variant="gap" />
                        </div>
                      </div>
                      <p className="feedback-body">{item.point}</p>
                    </div>
                  </div>
                )) : (
                  <p style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "1.5rem 0" }}>
                    None identified
                  </p>
                )}
              </div>
            </div>

            {/* Tips */}
            {data.tips.length > 0 && (
              <div className="panel">
                <div className="panel-shine panel-shine-accent" />
                <div className="panel-header">
                  <div>
                    <div className="panel-title" style={{ color: C.sky }}>
                      {data.tips.length} thing{data.tips.length !== 1 ? "s" : ""} to fix before your next interview
                    </div>
                    <div className="panel-sub">Actionable improvements</div>
                  </div>
                  <div className="summary-pill pill-sky">
                    <span className="summary-pill-count">{data.tips.length}</span>
                    <span className="summary-pill-label">tips</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.tips.map((tip, i) => (
                    <div key={i} className="feedback-card" style={{
                      border: "1px solid rgba(56,189,248,0.1)",
                      animationDelay: `${i * 0.06}s`,
                    }}>
                      <div className="feedback-card-bg" style={{ background: "rgba(56,189,248,0.03)" }} />
                      <div className="feedback-card-bar" style={{ background: C.sky }} />
                      <div className="feedback-card-content">
                        <div className="feedback-card-header">
                          <div className="feedback-card-title-row">
                            <span className="feedback-icon" style={{
                              color: C.sky, fontFamily: "var(--ff-mono)",
                            }}>{i + 1}.</span>
                          </div>
                        </div>
                        <p className="feedback-body">{tip}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.coaching_priorities.length > 0 && (
              <div className="panel">
                <div className="panel-shine panel-shine-accent" />
                <div className="panel-header">
                  <div>
                    <div className="panel-title">Coaching Priorities</div>
                    <div className="panel-sub">The three issues hurting your performance the most</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.coaching_priorities.map((tip, i) => (
                    <div key={i} className="feedback-card" style={{ border: "1px solid rgba(255,92,53,0.14)" }}>
                      <div className="feedback-card-bg" style={{ background: "rgba(255,92,53,0.03)" }} />
                      <div className="feedback-card-bar" style={{ background: C.accent }} />
                      <div className="feedback-card-content">
                        <div className="feedback-card-header">
                          <div className="feedback-card-title-row">
                            <span className="feedback-icon" style={{ color: C.accent }}>{i + 1}.</span>
                            <FeedbackTag label="Priority" variant="gap" />
                          </div>
                        </div>
                        <p className="feedback-body">{tip}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gap analysis */}
            {data.gap_analysis && (
              data.gap_analysis.repeated_gaps.length > 0 ||
              data.gap_analysis.weak_dimensions.length > 0 ||
              Object.keys(data.gap_analysis.dim_averages).length > 0
            ) && <GapAnalysisPanel gap={data.gap_analysis} />}

            {/* CTA */}
            <div className="cta-card">
              <div className="cta-shine" />
              <div className="cta-title">
                Ready to <span className="cta-highlight">level up?</span>
              </div>
              <p className="cta-sub">
                Practice the gaps identified above in your next session.
              </p>
              <button className="btn-cta" onClick={() => router.push("/dashboard")}>
                Start Another Interview
              </button>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
