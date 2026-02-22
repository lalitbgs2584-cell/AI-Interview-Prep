"use client";

import { useState } from "react";
import { SessionRow } from "../../OverviewPage";

const allSessions = [
  { id: 1,  title: "System Design: URL Shortener",      type: "System Design", score: 84, date: "Today, 2:30 PM",  duration: "42 min", status: "high" },
  { id: 2,  title: "Behavioral: Leadership & Conflict",  type: "Behavioral",    score: 71, date: "Yesterday",       duration: "28 min", status: "medium" },
  { id: 3,  title: "DSA: Trees & Graph Traversal",       type: "Coding",        score: 62, date: "2 days ago",      duration: "55 min", status: "low" },
  { id: 4,  title: "System Design: Rate Limiter",        type: "System Design", score: 89, date: "3 days ago",      duration: "38 min", status: "high" },
  { id: 5,  title: "SQL: Joins & Aggregations",          type: "Coding",        score: 54, date: "5 days ago",      duration: "35 min", status: "low" },
  { id: 6,  title: "Behavioral: Conflict Resolution",    type: "Behavioral",    score: 78, date: "1 week ago",      duration: "22 min", status: "medium" },
  { id: 7,  title: "System Design: Notification System", type: "System Design", score: 91, date: "1 week ago",      duration: "50 min", status: "high" },
  { id: 8,  title: "DSA: Dynamic Programming",           type: "Coding",        score: 60, date: "2 weeks ago",     duration: "65 min", status: "low" },
];

const filters = ["All", "System Design", "Coding", "Behavioral"];

export default function HistoryPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const filtered = activeFilter === "All" ? allSessions : allSessions.filter(s => s.type === activeFilter);
  const avgScore = Math.round(allSessions.reduce((a, s) => a + s.score, 0) / allSessions.length);

  return (
    <>
      {/* Top bar */}
      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">Session <em>History</em></div>
          <div className="dash-date">{allSessions.length} total sessions · Avg score {avgScore}</div>
        </div>
        <div className="topbar-actions">
          <button className="resume-action-btn">📥 Export History</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="stats-grid">
        <div className="dash-stat-card anim-0">
          <div className="dash-stat-top"><span className="stat-card-dot dot-accent" /><span className="dash-stat-label">Total Sessions</span></div>
          <div className="dash-stat-value">{allSessions.length}<span className="dash-stat-unit">done</span></div>
          <div className="dash-stat-delta">+3 this week</div>
        </div>
        <div className="dash-stat-card anim-1">
          <div className="dash-stat-top"><span className="stat-card-dot dot-gold" /><span className="dash-stat-label">Avg Score</span></div>
          <div className="dash-stat-value">{avgScore}<span className="dash-stat-unit">/ 100</span></div>
          <div className="dash-stat-delta">+4 vs last month</div>
        </div>
        <div className="dash-stat-card anim-2">
          <div className="dash-stat-top"><span className="stat-card-dot dot-violet" /><span className="dash-stat-label">Best Score</span></div>
          <div className="dash-stat-value">91<span className="dash-stat-unit">/ 100</span></div>
          <div className="dash-stat-delta">System Design</div>
        </div>
        <div className="dash-stat-card anim-3">
          <div className="dash-stat-top"><span className="stat-card-dot dot-accent" /><span className="dash-stat-label">Total Time</span></div>
          <div className="dash-stat-value">6.2<span className="dash-stat-unit">hours</span></div>
          <div className="dash-stat-delta">Across all sessions</div>
        </div>
      </div>

      {/* Session list with filters */}
      <div className="panel">
        <div className="panel-header">
          <div><div className="panel-title">All Sessions</div><div className="panel-sub">{filtered.length} results</div></div>
        </div>
        <div className="history-filter-row" style={{ marginBottom: "1.25rem" }}>
          {filters.map((f) => (
            <button
              key={f}
              className={`history-filter-btn ${activeFilter === f ? "active" : ""}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="session-list">
          {filtered.map((s) => <SessionRow key={s.id} s={s} />)}
        </div>
      </div>
    </>
  );
}
