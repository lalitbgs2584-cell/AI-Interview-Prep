"use client";

import { useRef, useState } from "react";

const stats = [
  { label: "Sessions Done", value: "24", unit: "total", dot: "dot-accent", delta: "+3 this week" },
  { label: "Avg. Score", value: "78", unit: "/ 100", dot: "dot-gold", delta: "+6 vs last week" },
  { label: "Skills Covered", value: "12", unit: "topics", dot: "dot-violet", delta: "4 remaining" },
  { label: "Current Streak", value: "7", unit: "days 🔥", dot: "dot-accent", delta: "Personal best!" },
];

const recentSessions = [
  { id: 1, title: "System Design: URL Shortener", type: "System Design", score: 84, date: "Today, 2:30 PM", duration: "42 min", status: "high" },
  { id: 2, title: "Behavioral: Leadership & Conflict", type: "Behavioral", score: 71, date: "Yesterday", duration: "28 min", status: "medium" },
  { id: 3, title: "DSA: Trees & Graph Traversal", type: "Coding", score: 62, date: "2 days ago", duration: "55 min", status: "low" },
  { id: 4, title: "System Design: Rate Limiter", type: "System Design", score: 89, date: "3 days ago", duration: "38 min", status: "high" },
];

const skillRadar = [
  { skill: "System Design", score: 84 },
  { skill: "Data Structures", score: 68 },
  { skill: "Behavioral", score: 75 },
  { skill: "SQL & Databases", score: 55 },
  { skill: "OS Concepts", score: 48 },
  { skill: "Networking", score: 61 },
];

const quickStart = [
  { id: "sd",  icon: "⬡", label: "System Design", desc: "Architecture & scalability",   tag: "Popular",   tagClass: "tag-accent" },
  { id: "dsa", icon: "◈", label: "DSA / Coding",  desc: "Algorithms & data structures", tag: "Daily",     tagClass: "tag-gold" },
  { id: "beh", icon: "◎", label: "Behavioral",    desc: "STAR method coaching",          tag: "Suggested", tagClass: "tag-violet" },
  { id: "sql", icon: "⬕", label: "SQL & Databases",desc: "Queries, indexes, design",    tag: "Weak area", tagClass: "tag-rose" },
];

function scoreClass(status: string) {
  return status === "high" ? "score-high" : status === "medium" ? "score-medium" : "score-low";
}
function barClass(status: string) {
  return `bar-fill ${scoreClass(status)}`;
}

export function SessionRow({ s }: { s: typeof recentSessions[0] }) {
  return (
    <div className="session-row">
      <div className="session-row-left">
        <div className={`session-score-badge ${scoreClass(s.status)}`}>{s.score}</div>
        <div>
          <div className="session-title">{s.title}</div>
          <div className="session-meta">
            <span className={`tag ${s.type === "System Design" ? "tag-accent" : s.type === "Behavioral" ? "tag-violet" : "tag-sky"}`}>
              {s.type}
            </span>
            <span className="session-date">{s.date}</span>
            <span className="session-duration">· {s.duration}</span>
          </div>
        </div>
      </div>
      <button className="session-replay-btn">Review →</button>
    </div>
  );
}

export default function OverviewPage({ userName, streak, onNavigate }: {
  userName: string;
  streak: number;
  onNavigate: (page: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "sessions" | "skills">("overview");
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <>
      {/* ── Top bar ── */}
      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">
            Good {now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening"}, <em>{userName}</em> 👋
          </div>
          <div className="dash-date">{dateStr} · {streak}-day streak 🔥</div>
        </div>
        <div className="topbar-actions">
          <button className="btn-new-session">+ New Interview</button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="stats-grid">
        {stats.map((s, i) => (
          <div key={s.label} className={`dash-stat-card anim-${i}`}>
            <div className="dash-stat-top">
              <span className={`stat-card-dot ${s.dot}`} />
              <span className="dash-stat-label">{s.label}</span>
            </div>
            <div className="dash-stat-value">{s.value}<span className="dash-stat-unit">{s.unit}</span></div>
            <div className="dash-stat-delta">{s.delta}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="dash-tabs">
        {(["overview", "sessions", "skills"] as const).map((t) => (
          <button key={t} className={`dash-tab ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <div className="tab-content">
          <div className="overview-grid">
            <div className="panel">
              <div className="panel-header">
                <div><div className="panel-title">Start a Session</div><div className="panel-sub">Pick a category to begin</div></div>
              </div>
              <div className="quick-grid">
                {quickStart.map((q) => (
                  <button key={q.id} className="quick-card">
                    <div className="quick-card-top">
                      <span className="quick-icon">{q.icon}</span>
                      <span className={`tag ${q.tagClass}`}>{q.tag}</span>
                    </div>
                    <div className="quick-label">{q.label}</div>
                    <div className="quick-desc">{q.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <div><div className="panel-title">Skill Snapshot</div><div className="panel-sub">Based on last 10 sessions</div></div>
              </div>
              <div className="skill-list">
                {skillRadar.map((s, i) => {
                  const st = s.score >= 75 ? "high" : s.score >= 60 ? "medium" : "low";
                  return (
                    <div key={s.skill} className="skill-row" style={{ animationDelay: `${i * 0.06}s` }}>
                      <div className="skill-row-top">
                        <span className="skill-name">{s.skill}</span>
                        <span className={`skill-score ${scoreClass(st)}`}>{s.score}</span>
                      </div>
                      <div className="bar-track"><div className={barClass(st)} style={{ width: `${s.score}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="panel mt-section">
            <div className="panel-header">
              <div className="panel-title">Recent Sessions</div>
              <button className="panel-link" onClick={() => setActiveTab("sessions")}>View all →</button>
            </div>
            <div className="session-list">
              {recentSessions.slice(0, 3).map((s) => <SessionRow key={s.id} s={s} />)}
            </div>
          </div>
        </div>
      )}

      {/* ── Sessions ── */}
      {activeTab === "sessions" && (
        <div className="tab-content">
          <div className="panel">
            <div className="panel-header">
              <div><div className="panel-title">All Sessions</div><div className="panel-sub">{recentSessions.length} total</div></div>
            </div>
            <div className="session-list">
              {recentSessions.map((s) => <SessionRow key={s.id} s={s} />)}
            </div>
          </div>
        </div>
      )}

      {/* ── Skills ── */}
      {activeTab === "skills" && (
        <div className="tab-content">
          <div className="panel">
            <div className="panel-header">
              <div><div className="panel-title">Skill Breakdown</div><div className="panel-sub">Detailed scores across all topics</div></div>
            </div>
            <div className="skill-list skill-list-lg">
              {skillRadar.map((s, i) => {
                const st = s.score >= 75 ? "high" : s.score >= 60 ? "medium" : "low";
                return (
                  <div key={s.skill} className="skill-row" style={{ animationDelay: `${i * 0.07}s` }}>
                    <div className="skill-row-top">
                      <span className="skill-name">{s.skill}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <span className={`tag ${st === "high" ? "tag-gold" : st === "medium" ? "tag-amber" : "tag-rose"}`}>
                          {st === "high" ? "Strong" : st === "medium" ? "Good" : "Needs work"}
                        </span>
                        <span className={`skill-score ${scoreClass(st)}`}>{s.score}/100</span>
                      </div>
                    </div>
                    <div className="bar-track bar-track-lg"><div className={barClass(st)} style={{ width: `${s.score}%` }} /></div>
                    <div className="skill-hint">
                      {st === "low" ? "🎯 Recommended: 2 sessions this week" : st === "medium" ? "📈 Keep practicing to reach Strong" : "✅ Great performance — maintain with 1 session/week"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
