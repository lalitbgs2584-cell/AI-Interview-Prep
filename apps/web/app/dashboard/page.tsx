"use client";

import { useState } from "react";
import Link from "next/link";
import "./style.css";

// ── Mock data ──────────────────────────────────────────────
const user = {
  name: "Alex Rivera",
  avatar: "AR",
  role: "Software Engineer",
  streak: 7,
};

const stats = [
  { label: "Sessions Done",  value: "24",   unit: "total",      dot: "dot-accent",  delta: "+3 this week" },
  { label: "Avg. Score",     value: "78",   unit: "/ 100",      dot: "dot-gold",    delta: "+6 vs last week" },
  { label: "Skills Covered", value: "12",   unit: "topics",     dot: "dot-violet",  delta: "4 remaining" },
  { label: "Current Streak", value: "7",    unit: "days 🔥",    dot: "dot-accent",  delta: "Personal best!" },
];

const recentSessions = [
  { id: 1, title: "System Design: URL Shortener",  type: "System Design",  score: 84, date: "Today, 2:30 PM",    duration: "42 min", status: "high" },
  { id: 2, title: "Behavioral: Leadership & Conflict", type: "Behavioral", score: 71, date: "Yesterday",          duration: "28 min", status: "medium" },
  { id: 3, title: "DSA: Trees & Graph Traversal",  type: "Coding",         score: 62, date: "2 days ago",         duration: "55 min", status: "low" },
  { id: 4, title: "System Design: Rate Limiter",   type: "System Design",  score: 89, date: "3 days ago",         duration: "38 min", status: "high" },
];

const skillRadar = [
  { skill: "System Design",  score: 84, max: 100 },
  { skill: "Data Structures", score: 68, max: 100 },
  { skill: "Behavioral",     score: 75, max: 100 },
  { skill: "SQL & Databases", score: 55, max: 100 },
  { skill: "OS Concepts",    score: 48, max: 100 },
  { skill: "Networking",     score: 61, max: 100 },
];

const quickStart = [
  { id: "sd",  icon: "⬡", label: "System Design",  desc: "Architecture & scalability",  tag: "Popular",   tagClass: "tag-accent" },
  { id: "dsa", icon: "◈", label: "DSA / Coding",   desc: "Algorithms & data structures", tag: "Daily",     tagClass: "tag-gold" },
  { id: "beh", icon: "◎", label: "Behavioral",     desc: "STAR method coaching",         tag: "Suggested", tagClass: "tag-violet" },
  { id: "sql", icon: "⬕", label: "SQL & Databases", desc: "Queries, indexes, design",    tag: "Weak area", tagClass: "tag-rose" },
];

const aiTip = {
  title: "Focus area this week",
  body: "Your SQL scores dropped 12 points. I've queued 3 targeted sessions on indexing strategies and query optimization. Want to start now?",
};

// ── Helpers ────────────────────────────────────────────────
function scoreClass(status: string) {
  if (status === "high")   return "score-high";
  if (status === "medium") return "score-medium";
  return "score-low";
}

function barClass(status: string) {
  if (status === "high")   return "bar-fill score-high";
  if (status === "medium") return "bar-fill score-medium";
  return "bar-fill score-low";
}

// ── Component ──────────────────────────────────────────────
export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "sessions" | "skills">("overview");

  return (
    <>
      <div className="noise" />

      <div className="dash-root">
        {/* ════ SIDEBAR ════ */}
        <aside className="sidebar">
          <Link href="/" className="sidebar-logo">Prep<span>AI</span></Link>

          <nav className="sidebar-nav">
            {[
              { icon: "⊞", label: "Dashboard",  active: true  },
              { icon: "◈", label: "Interviews",  active: false },
              { icon: "◎", label: "Progress",    active: false },
              { icon: "⬡", label: "Skills",      active: false },
              { icon: "⊟", label: "History",     active: false },
            ].map((item) => (
              <button
                key={item.label}
                className={`nav-pill${item.active ? " active" : ""}`}
              >
                <span className="nav-pill-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* AI tip card in sidebar */}
          <div className="sidebar-tip">
            <div className="sidebar-tip-header">
              <span className="dot-accent" style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background:"var(--accent)", animation:"dotPulse 2s ease infinite" }} />
              <span className="sidebar-tip-label">AI Coach</span>
            </div>
            <p className="sidebar-tip-title">{aiTip.title}</p>
            <p className="sidebar-tip-body">{aiTip.body}</p>
            <button className="sidebar-tip-btn">Start session →</button>
          </div>

          {/* User avatar */}
          <div className="sidebar-user">
            <div className="sidebar-avatar">{user.avatar}</div>
            <div>
              <div className="sidebar-user-name">{user.name}</div>
              <div className="sidebar-user-role">{user.role}</div>
            </div>
          </div>
        </aside>

        {/* ════ MAIN ════ */}
        <main className="dash-main">

          {/* ── Top bar ── */}
          <header className="dash-topbar">
            <div>
              <h1 className="dash-greeting">
                Good morning, <em>{user.name.split(" ")[0]}</em> 👋
              </h1>
              <p className="dash-date">Sunday, Feb 15 · {user.streak}-day streak 🔥</p>
            </div>
            <button className="btn-new-session">
              <span>+</span> New Interview
            </button>
          </header>

          {/* ── Stat cards ── */}
          <section className="stats-grid anim-0">
            {stats.map((s) => (
              <div className="dash-stat-card" key={s.label}>
                <div className="dash-stat-top">
                  <span className={`stat-card-dot ${s.dot}`} />
                  <span className="dash-stat-label">{s.label}</span>
                </div>
                <div className="dash-stat-value">
                  {s.value}
                  <span className="dash-stat-unit">{s.unit}</span>
                </div>
                <div className="dash-stat-delta">{s.delta}</div>
              </div>
            ))}
          </section>

          {/* ── Tabs ── */}
          <div className="dash-tabs anim-1">
            {(["overview", "sessions", "skills"] as const).map((t) => (
              <button
                key={t}
                className={`dash-tab${activeTab === t ? " active" : ""}`}
                onClick={() => setActiveTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* ════ OVERVIEW TAB ════ */}
          {activeTab === "overview" && (
            <div className="tab-content anim-2">
              <div className="overview-grid">

                {/* Quick start */}
                <section className="panel">
                  <div className="panel-header">
                    <h2 className="panel-title">Start a Session</h2>
                    <span className="panel-sub">Pick a category to begin</span>
                  </div>
                  <div className="quick-grid">
                    {quickStart.map((q) => (
                      <button className="quick-card" key={q.id}>
                        <div className="quick-card-top">
                          <span className="quick-icon">{q.icon}</span>
                          <span className={`tag ${q.tagClass}`}>{q.tag}</span>
                        </div>
                        <div className="quick-label">{q.label}</div>
                        <div className="quick-desc">{q.desc}</div>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Skill snapshot */}
                <section className="panel">
                  <div className="panel-header">
                    <h2 className="panel-title">Skill Snapshot</h2>
                    <span className="panel-sub">Based on last 10 sessions</span>
                  </div>
                  <div className="skill-list">
                    {skillRadar.map((s, i) => {
                      const st = s.score >= 75 ? "high" : s.score >= 60 ? "medium" : "low";
                      return (
                        <div className="skill-row" key={s.skill} style={{ animationDelay: `${i * 60}ms` }}>
                          <div className="skill-row-top">
                            <span className="skill-name">{s.skill}</span>
                            <span className={`skill-score ${scoreClass(st)}`}>{s.score}</span>
                          </div>
                          <div className="bar-track">
                            <div
                              className={barClass(st)}
                              style={{ width: `${s.score}%`, animationDelay: `${i * 80 + 300}ms` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

              </div>

              {/* Recent sessions strip */}
              <section className="panel mt-section">
                <div className="panel-header">
                  <h2 className="panel-title">Recent Sessions</h2>
                  <button className="panel-link" onClick={() => setActiveTab("sessions")}>View all →</button>
                </div>
                <div className="session-list">
                  {recentSessions.slice(0, 3).map((s) => (
                    <SessionRow key={s.id} s={s} />
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* ════ SESSIONS TAB ════ */}
          {activeTab === "sessions" && (
            <div className="tab-content anim-2">
              <section className="panel">
                <div className="panel-header">
                  <h2 className="panel-title">All Sessions</h2>
                  <span className="panel-sub">{recentSessions.length} total</span>
                </div>
                <div className="session-list">
                  {recentSessions.map((s) => (
                    <SessionRow key={s.id} s={s} />
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* ════ SKILLS TAB ════ */}
          {activeTab === "skills" && (
            <div className="tab-content anim-2">
              <section className="panel">
                <div className="panel-header">
                  <h2 className="panel-title">Skill Breakdown</h2>
                  <span className="panel-sub">Detailed scores across all topics</span>
                </div>
                <div className="skill-list skill-list-lg">
                  {skillRadar.map((s, i) => {
                    const st = s.score >= 75 ? "high" : s.score >= 60 ? "medium" : "low";
                    return (
                      <div className="skill-row skill-row-lg" key={s.skill} style={{ animationDelay: `${i * 70}ms` }}>
                        <div className="skill-row-top">
                          <span className="skill-name">{s.skill}</span>
                          <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
                            <span className={`tag ${st === "high" ? "tag-gold" : st === "medium" ? "tag-amber" : "tag-rose"}`}>
                              {st === "high" ? "Strong" : st === "medium" ? "Good" : "Needs work"}
                            </span>
                            <span className={`skill-score ${scoreClass(st)}`}>{s.score}/100</span>
                          </div>
                        </div>
                        <div className="bar-track bar-track-lg">
                          <div
                            className={barClass(st)}
                            style={{ width: `${s.score}%`, animationDelay: `${i * 80 + 300}ms` }}
                          />
                        </div>
                        <p className="skill-hint">
                          {st === "low" ? "🎯 Recommended: 2 sessions this week" :
                           st === "medium" ? "📈 Keep practicing to reach Strong" :
                           "✅ Great performance — maintain with 1 session/week"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

        </main>
      </div>
    </>
  );
}

// ── Session row sub-component ──────────────────────────────
function SessionRow({ s }: { s: typeof recentSessions[0] }) {
  return (
    <div className="session-row">
      <div className="session-row-left">
        <div className={`session-score-badge ${scoreClass(s.status)}`}>{s.score}</div>
        <div>
          <div className="session-title">{s.title}</div>
          <div className="session-meta">
            <span className="tag tag-sky">{s.type}</span>
            <span className="session-date">{s.date}</span>
            <span className="session-duration">· {s.duration}</span>
          </div>
        </div>
      </div>
      <button className="session-replay-btn">Review →</button>
    </div>
  );
}