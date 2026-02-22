"use client";

const weeklyBars = [
  { day: "Mon", score: 65, h: 40 },
  { day: "Tue", score: 72, h: 52 },
  { day: "Wed", score: 58, h: 34 },
  { day: "Thu", score: 84, h: 68 },
  { day: "Fri", score: 78, h: 58 },
  { day: "Sat", score: 91, h: 78 },
  { day: "Sun", score: 71, h: 50 },
];

const milestones = [
  { label: "First Session Completed", sub: "Jan 12, 2025", done: true },
  { label: "5-Day Streak", sub: "Jan 18, 2025", done: true },
  { label: "Score 80+ in System Design", sub: "Feb 3, 2025", done: true },
  { label: "10 Sessions Done", sub: "Feb 8, 2025", done: true },
  { label: "Cover All 6 Skill Areas", sub: "In progress — 4/6", done: false },
  { label: "30-Day Streak", sub: "23 days to go", done: false },
  { label: "Avg. Score 85+", sub: "Currently at 78", done: false },
];

const weeklyStats = [
  { label: "Sessions", value: "6", delta: "+2 vs last week", dot: "dot-accent" },
  { label: "Best Score", value: "91", delta: "System Design", dot: "dot-gold" },
  { label: "Time Practiced", value: "4.2h", delta: "+1.1h vs last week", dot: "dot-violet" },
];

export default function ProgressPage() {
  return (
    <>
      {/* Top bar */}
      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">Your <em>Progress</em></div>
          <div className="dash-date">Track your growth over time</div>
        </div>
      </div>

      {/* Weekly summary cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {weeklyStats.map((s, i) => (
          <div key={s.label} className={`dash-stat-card anim-${i}`}>
            <div className="dash-stat-top">
              <span className={`stat-card-dot ${s.dot}`} />
              <span className="dash-stat-label">{s.label}</span>
            </div>
            <div className="dash-stat-value">{s.value}</div>
            <div className="dash-stat-delta">{s.delta}</div>
          </div>
        ))}
      </div>

      {/* Weekly chart (visual bars) */}
      <div className="panel">
        <div className="panel-header">
          <div><div className="panel-title">Weekly Score Trend</div><div className="panel-sub">Last 7 days</div></div>
          <span className="tag tag-accent">This Week</span>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", height: 120, padding: "0 0.5rem" }}>
          {weeklyBars.map((b) => (
            <div key={b.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.62rem", color: "var(--muted)" }}>{b.score}</span>
              <div
                style={{
                  width: "100%", borderRadius: "var(--r-sm) var(--r-sm) 0 0",
                  height: `${b.h}px`,
                  background: b.score >= 80
                    ? "linear-gradient(180deg, var(--positive), #c47d20)"
                    : b.score >= 65
                    ? "linear-gradient(180deg, var(--amber), #c47d20)"
                    : "linear-gradient(180deg, var(--rose), #b8294a)",
                  opacity: 0.85,
                  transition: "height 0.9s var(--ease-snap)",
                }}
              />
              <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.62rem", color: "var(--muted)" }}>{b.day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Milestones */}
      <div className="panel">
        <div className="panel-header">
          <div><div className="panel-title">Milestones</div><div className="panel-sub">{milestones.filter(m => m.done).length} of {milestones.length} achieved</div></div>
        </div>
        <div className="milestone-list">
          {milestones.map((m, i) => (
            <div key={i} className="milestone-item">
              <div className={`milestone-check ${m.done ? "done" : "todo"}`}>
                {m.done ? "✓" : "○"}
              </div>
              <div>
                <div className="milestone-label" style={{ color: m.done ? "var(--text)" : "var(--text-3)" }}>{m.label}</div>
                <div className="milestone-sub">{m.sub}</div>
              </div>
              {m.done && <span className="tag tag-gold" style={{ marginLeft: "auto" }}>Done</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
