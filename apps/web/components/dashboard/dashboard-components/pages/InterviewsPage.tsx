"use client";

import { SessionRow } from "../../OverviewPage";

const interviewTypes = [
  { icon: "⬡", name: "System Design", desc: "Practice designing scalable systems — URL shorteners, rate limiters, chat apps and more.", tag: "Popular", tagClass: "tag-accent", count: "12 sessions done" },
  { icon: "◈", name: "DSA / Coding", desc: "Arrays, trees, graphs, DP — full algorithm practice with explanations.", tag: "Daily", tagClass: "tag-gold", count: "8 sessions done" },
  { icon: "◎", name: "Behavioral", desc: "STAR-method coaching for leadership, conflict, and culture-fit questions.", tag: "Suggested", tagClass: "tag-violet", count: "4 sessions done" },
  { icon: "⬕", name: "SQL & Databases", desc: "Query writing, indexing strategies, normalization and schema design.", tag: "Weak area", tagClass: "tag-rose", count: "2 sessions done" },
  { icon: "◉", name: "OS & Concurrency", desc: "Processes, threads, locks, scheduling and memory management.", tag: "New", tagClass: "tag-sky", count: "0 sessions done" },
  { icon: "◌", name: "Networking", desc: "HTTP, TCP/IP, DNS, WebSockets — how the internet works under the hood.", tag: "New", tagClass: "tag-sky", count: "1 session done" },
];

const upcomingSessions = [
  { id: 5, title: "System Design: Chat Application", type: "System Design", score: 0, date: "Scheduled · Tomorrow 10:00 AM", duration: "45 min", status: "medium" },
  { id: 6, title: "SQL: Window Functions Deep Dive", type: "Coding", score: 0, date: "Scheduled · Wed 3:00 PM", duration: "30 min", status: "low" },
];

export default function InterviewsPage() {
  return (
    <>
      {/* Top bar */}
      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">Start an <em>Interview</em></div>
          <div className="dash-date">Choose a category and begin practicing</div>
        </div>
        <div className="topbar-actions">
          <button className="btn-new-session">+ Custom Session</button>
        </div>
      </div>

      {/* Category grid */}
      <div className="panel">
        <div className="panel-header">
          <div><div className="panel-title">Interview Categories</div><div className="panel-sub">Pick your focus area</div></div>
        </div>
        <div className="interview-type-grid">
          {interviewTypes.map((t) => (
            <button key={t.name} className="interview-type-card">
              <span className="interview-type-icon">{t.icon}</span>
              <div className="interview-type-meta">
                <span className={`tag ${t.tagClass}`}>{t.tag}</span>
                <span className="interview-type-count">{t.count}</span>
              </div>
              <div className="interview-type-name" style={{ marginTop: "0.75rem" }}>{t.name}</div>
              <div className="interview-type-desc">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Upcoming */}
      <div className="panel">
        <div className="panel-header">
          <div><div className="panel-title">Upcoming Sessions</div><div className="panel-sub">Scheduled practice</div></div>
        </div>
        <div className="session-list">
          {upcomingSessions.map((s) => (
            <div key={s.id} className="session-row">
              <div className="session-row-left">
                <div className="session-score-badge score-medium" style={{ fontSize: "1rem" }}>⏰</div>
                <div>
                  <div className="session-title">{s.title}</div>
                  <div className="session-meta">
                    <span className={`tag ${s.type === "System Design" ? "tag-accent" : "tag-sky"}`}>{s.type}</span>
                    <span className="session-date">{s.date}</span>
                    <span className="session-duration">· {s.duration}</span>
                  </div>
                </div>
              </div>
              <button className="btn-new-session" style={{ padding: "0.45rem 1rem", fontSize: "0.78rem" }}>Start →</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
