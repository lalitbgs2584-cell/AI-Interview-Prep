"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell,
  LineChart, Line, ReferenceLine,
} from "recharts";
import "../style.css";

/* ─── design tokens (JS-side only for Recharts colours) ─── */
const C = {
  accent:   "#ff5c35",
  accent2:  "#ff8162",
  accent3:  "#ff3010",
  positive: "#e2a84b",
  amber:    "#f5a623",
  rose:     "#ff4d6d",
  sky:      "#38bdf8",
  violet:   "#a78bfa",
  bg:       "#080b12",
  card2:    "#161c28",
  text2:    "#b0b8cc",
  text3:    "#6b7590",
  muted:    "#6b7590",
  border:       "rgba(255,255,255,0.065)",
  borderStrong: "rgba(255,255,255,0.13)",
};

/* ─── mock data ─────────────────────────────────────────── */
const sessionMeta = {
  title: "System Design: URL Shortener",
  type: "System Design",
  date: "Feb 15, 2026 · 2:30 PM",
  duration: "42 min",
  overallScore: 78,
  previousScore: 72,
  interviewer: "PrepAI GPT-o3",
};

const skillScores = [
  { skill: "Communication",      score: 82, prev: 74, status: "high"   },
  { skill: "Technical Depth",    score: 74, prev: 68, status: "medium" },
  { skill: "Problem Solving",    score: 85, prev: 80, status: "high"   },
  { skill: "Clarity",            score: 70, prev: 65, status: "medium" },
  { skill: "System Thinking",    score: 79, prev: 70, status: "high"   },
  { skill: "Trade-off Analysis", score: 60, prev: 55, status: "low"    },
];

const radarData    = skillScores.map(s => ({ subject: s.skill, score: s.score, prev: s.prev }));

const timelineData = [
  { min: "0",  score: 45, event: "Start"        },
  { min: "5",  score: 58                        },
  { min: "10", score: 65, event: "Requirements" },
  { min: "15", score: 70                        },
  { min: "20", score: 74, event: "Schema Design"},
  { min: "25", score: 71                        },
  { min: "30", score: 79, event: "Scalability"  },
  { min: "35", score: 82                        },
  { min: "42", score: 78, event: "Wrap-up"      },
];

const historyData = [
  { session: "S1", score: 52 }, { session: "S2", score: 61 },
  { session: "S3", score: 58 }, { session: "S4", score: 67 },
  { session: "S5", score: 71 }, { session: "S6", score: 69 },
  { session: "S7", score: 74 }, { session: "S8", score: 72 },
  { session: "S9", score: 78 },
];

const feedbackItems = [
  {
    id: 1, type: "strength", icon: "✦",
    title: "Clear requirements gathering",
    body:  "You immediately clarified functional vs non-functional requirements and confirmed the 100:1 read/write ratio — this shows strong product sense and sets a great foundation.",
    tag:   "Communication",
  },
  {
    id: 2, type: "strength", icon: "✦",
    title: "Scalability reasoning",
    body:  "Your justification for a NoSQL store based on the scale requirements was well-articulated. You correctly identified that we need horizontal scaling above 10M users.",
    tag:   "System Thinking",
  },
  {
    id: 3, type: "improvement", icon: "◈",
    title: "Trade-off analysis needs depth",
    body:  "When proposing consistent hashing, you didn't compare it against alternatives like range-based partitioning. Always show you've considered 2–3 options before committing.",
    tag:   "Trade-off Analysis",
  },
  {
    id: 4, type: "improvement", icon: "◈",
    title: "Deeper on failure modes",
    body:  "You mentioned replication but skipped failure scenarios entirely. Interviewers at FAANG expect you to proactively discuss what happens when the cache layer goes down.",
    tag:   "Technical Depth",
  },
  {
    id: 5, type: "tip", icon: "→",
    title: "Structure your answer in 3 parts",
    body:  "Use: (1) State your approach, (2) Walk through trade-offs, (3) Commit and refine. This pattern makes your thinking predictable in a good way.",
    tag:   "Clarity",
  },
];

const timeSpent = [
  { phase: "Requirements", minutes: 6,  color: C.sky      },
  { phase: "API Design",   minutes: 5,  color: C.violet   },
  { phase: "DB Schema",    minutes: 10, color: C.accent    },
  { phase: "Scalability",  minutes: 12, color: C.positive  },
  { phase: "Wrap-up",      minutes: 9,  color: C.amber     },
];

/* ─── helpers ───────────────────────────────────────────── */
const scoreColor = (s: number) => s >= 75 ? C.positive : s >= 60 ? C.amber : C.rose;
const scoreLabel = (s: number) => s >= 75 ? "Strong"   : s >= 60 ? "Good"  : "Needs Work";
const tagBg      = (s: number) =>
  s >= 75 ? "rgba(226,168,75,0.1)" : s >= 60 ? "rgba(245,166,35,0.1)" : "rgba(255,77,109,0.1)";
const tagBorder  = (s: number) =>
  s >= 75 ? "rgba(226,168,75,0.28)" : s >= 60 ? "rgba(245,166,35,0.28)" : "rgba(255,77,109,0.28)";

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
      <div
        className="anim-bar-fill"
        style={{
          width: `${w}%`,
          background: `linear-gradient(90deg, ${col}aa, ${col})`,
          transition: `width 0.9s cubic-bezier(0.16,1,0.3,1)`,
        }}
      />
    </div>
  );
}

/* ─── page ──────────────────────────────────────────────── */
export default function FeedbackPage() {
  const [tab, setTab] = useState<"overview" | "skills" | "timeline" | "feedback">("overview");

  return (
    <>
      <div className="noise" />

      <div className="fb-root">

        {/* ══ TOP BAR ══ */}
        <header className="fb-topbar fade-down">
          <div className="fb-topbar-left">
            <Link href="/" className="fb-logo">Prep<span>AI</span></Link>
            <div className="fb-topbar-divider" />
            <span className="fb-topbar-title">Session Feedback</span>
          </div>
          <div className="fb-topbar-right">
            <Link href="/dashboard" className="btn-ghost">← Back to Dashboard</Link>
            <Link href="/interview" className="btn-accent-pill">New Session →</Link>
          </div>
        </header>

        <main className="fb-main">

          {/* ══ HERO CARD ══ */}
          <section className="hero-card fade-up-0">
            <div className="hero-shine" />

            <div className="hero-body">
              {/* left: meta */}
              <div className="hero-meta">
                <div className="hero-badge">
                  <span className="hero-badge-dot" />
                  {sessionMeta.type}
                </div>
                <h1 className="hero-title">{sessionMeta.title}</h1>
                <p className="hero-sub">
                  {sessionMeta.date} · {sessionMeta.duration} · {sessionMeta.interviewer}
                </p>
                <div className="hero-delta-row">
                  <span className="hero-delta-chip">
                    ↑ +{sessionMeta.overallScore - sessionMeta.previousScore} pts vs last session
                  </span>
                  <span className="hero-prev-score">Previous: {sessionMeta.previousScore}/100</span>
                </div>
              </div>

              {/* right: ring + mini stats */}
              <div className="hero-right">
                <ScoreRing score={sessionMeta.overallScore} />
                <div className="hero-mini-stats">
                  {[
                    { label: "Strengths",      value: "4", cls: "stat-positive" },
                    { label: "Improvements",   value: "3", cls: "stat-rose"     },
                    { label: "Topics Covered", value: "6", cls: "stat-sky"      },
                  ].map(s => (
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
            {(["overview", "skills", "timeline", "feedback"] as const).map(t => (
              <button
                key={t}
                className={`fb-tab${tab === t ? " active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* ══════ OVERVIEW TAB ══════ */}
          {tab === "overview" && (
            <div className="tab-grid-2 fade-up-2">

              {/* Score history — full width */}
              <div className="panel panel-full">
                <div className="panel-shine" />
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Score History</h2>
                    <p className="panel-sub">Last 9 sessions across all categories</p>
                  </div>
                  <span className="chip-positive">+49% since start</span>
                </div>
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
                    <YAxis domain={[40, 100]}  tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={78} stroke="rgba(255,92,53,0.25)" strokeDasharray="4 4"
                      label={{ value: "Today", fill: C.accent2, fontSize: 10, fontFamily: "'Geist Mono',monospace" }} />
                    <Area type="monotone" dataKey="score" name="Score"
                      stroke={C.accent} strokeWidth={2.5} fill="url(#areaGrad)"
                      dot={{ fill: C.accent, strokeWidth: 0, r: 4 }}
                      activeDot={{ r: 6, fill: C.accent, stroke: C.bg, strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Time per phase */}
              <div className="panel">
                <div className="panel-shine" />
                <h2 className="panel-title">Time Per Phase</h2>
                <p className="panel-sub" style={{ marginBottom: "1.5rem" }}>Minutes spent in each interview phase</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={timeSpent} margin={{ top: 5, right: 5, bottom: 0, left: -25 }} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="phase" tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 9, fill: C.muted }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="minutes" name="Minutes" radius={[6, 6, 0, 0]}>
                      {timeSpent.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={0.85} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Current vs previous */}
              <div className="panel">
                <div className="panel-shine" />
                <h2 className="panel-title">Current vs Previous</h2>
                <p className="panel-sub" style={{ marginBottom: "1.5rem" }}>Score delta per skill</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={skillScores} margin={{ top: 5, right: 5, bottom: 0, left: -25 }} barSize={10} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="skill" tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 8, fill: C.muted }} axisLine={false} tickLine={false} />
                    <YAxis domain={[40, 100]} tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="prev"  name="Previous" fill={C.muted} fillOpacity={0.35} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="score" name="Current"  radius={[4, 4, 0, 0]}>
                      {skillScores.map((e, i) => <Cell key={i} fill={scoreColor(e.score)} fillOpacity={0.9} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

            </div>
          )}

          {/* ══════ SKILLS TAB ══════ */}
          {tab === "skills" && (
            <div className="tab-grid-2 fade-up-2">

              {/* Radar */}
              <div className="panel">
                <div className="panel-shine" />
                <h2 className="panel-title">Skill Radar</h2>
                <p className="panel-sub">Current vs previous session</p>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                    <PolarGrid stroke="rgba(255,255,255,0.07)" />
                    <PolarAngleAxis dataKey="subject"
                      tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fill: C.text3 }} />
                    <Radar name="Previous" dataKey="prev"
                      stroke={C.muted} fill={C.muted} fillOpacity={0.1}
                      strokeWidth={1.5} strokeDasharray="4 2" />
                    <Radar name="Current"  dataKey="score"
                      stroke={C.accent} fill={C.accent} fillOpacity={0.18} strokeWidth={2} />
                    <Tooltip content={<ChartTooltip />} />
                  </RadarChart>
                </ResponsiveContainer>
                <div className="radar-legend">
                  {[{ color: C.accent, label: "Current" }, { color: C.muted, label: "Previous" }].map(l => (
                    <div key={l.label} className="radar-legend-item">
                      <div className="radar-legend-line" style={{ background: l.color }} />
                      <span className="radar-legend-label">{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Score breakdown bars */}
              <div className="panel">
                <div className="panel-shine" />
                <h2 className="panel-title">Score Breakdown</h2>
                <p className="panel-sub">Animated scores per skill</p>
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
                      <div className="skill-delta">↑ +{s.score - s.prev} vs last</div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ══════ TIMELINE TAB ══════ */}
          {tab === "timeline" && (
            <div className="tab-col fade-up-2">

              {/* Score line chart */}
              <div className="panel">
                <div className="panel-shine panel-shine-accent" />
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Score Throughout Session</h2>
                    <p className="panel-sub">Minute-by-minute performance curve</p>
                  </div>
                  <span className="panel-sub">42 min total</span>
                </div>
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
                    <XAxis dataKey="min"
                      tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, fill: C.muted }}
                      axisLine={false} tickLine={false}
                      label={{ value: "min", position: "insideBottomRight", offset: -5, fill: C.muted, fontSize: 10 }} />
                    <YAxis domain={[40, 100]}
                      tick={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, fill: C.muted }}
                      axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={75} stroke="rgba(226,168,75,0.2)" strokeDasharray="4 4"
                      label={{ value: "Target", fill: C.amber, fontSize: 10, fontFamily: "'Geist Mono',monospace" }} />
                    <Line type="monotone" dataKey="score" name="Score"
                      stroke="url(#lineGrad)" strokeWidth={3}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        return payload.event
                          ? <circle key={`e-${cx}`} cx={cx} cy={cy} r={6} fill={C.accent}  stroke={C.bg} strokeWidth={2} />
                          : <circle key={`d-${cx}`} cx={cx} cy={cy} r={3} fill={C.accent2} stroke="none" />;
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                {/* event legend */}
                <div className="event-legend">
                  {timelineData.filter(d => d.event).map(d => (
                    <div key={d.event} className="event-legend-item">
                      <div className="event-dot" />
                      <span className="event-label">{d.min}min · {d.event}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Phase time cards */}
              <div className="phase-cards">
                {timeSpent.map((p, i) => {
                  const pct = Math.round((p.minutes / 42) * 100);
                  return (
                    <div key={p.phase} className="phase-card" style={{ animationDelay: `${i * 70}ms` }}>
                      <div className="phase-card-top-bar" style={{ background: p.color }} />
                      <div className="phase-card-value" style={{ color: p.color }}>{p.minutes}</div>
                      <div className="phase-card-unit">min</div>
                      <div className="phase-mini-bar-track">
                        <div className="phase-mini-bar-fill" style={{ width: `${pct}%`, background: p.color }} />
                      </div>
                      <div className="phase-card-name">{p.phase}</div>
                      <div className="phase-card-pct">{pct}% of time</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════ FEEDBACK TAB ══════ */}
          {tab === "feedback" && (
            <div className="tab-col fade-up-2">

              {/* summary pills */}
              <div className="fb-summary-pills">
                {[
                  { label: "Strengths",    count: 2, cls: "pill-gold" },
                  { label: "Improvements", count: 2, cls: "pill-rose" },
                  { label: "Pro Tips",     count: 1, cls: "pill-sky"  },
                ].map(p => (
                  <div key={p.label} className={`summary-pill ${p.cls}`}>
                    <span className="summary-pill-count">{p.count}</span>
                    <span className="summary-pill-label">{p.label}</span>
                  </div>
                ))}
              </div>

              {/* feedback cards */}
              {feedbackItems.map((f, i) => {
                const isStrength = f.type === "strength";
                const isTip      = f.type === "tip";
                const accentColor = isStrength ? C.positive : isTip ? C.sky    : C.rose;
                const borderCol   = isStrength ? "rgba(226,168,75,0.2)" : isTip ? "rgba(56,189,248,0.2)"  : "rgba(255,77,109,0.2)";
                const bgTint      = isStrength ? "rgba(226,168,75,0.04)" : isTip ? "rgba(56,189,248,0.04)" : "rgba(255,77,109,0.04)";
                return (
                  <div
                    key={f.id}
                    className="feedback-card"
                    style={{
                      border: `1px solid ${borderCol}`,
                      animationDelay: `${i * 70}ms`,
                    }}
                  >
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
              })}

              {/* CTA */}
              <div className="cta-card">
                <div className="cta-shine" />
                <h3 className="cta-title">
                  Ready to improve your <span className="cta-highlight">Trade-off Analysis</span>?
                </h3>
                <p className="cta-sub">Your weakest area this session. I've prepared a focused 20-min drill session.</p>
                <button className="btn-cta">Start Targeted Session →</button>
              </div>

            </div>
          )}

        </main>
      </div>
    </>
  );
}