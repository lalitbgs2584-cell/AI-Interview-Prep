"use client";

const skillRadar = [
  { skill: "System Design", score: 84, sessions: 12, trend: "+5" },
  { skill: "Data Structures", score: 68, sessions: 8, trend: "+3" },
  { skill: "Behavioral", score: 75, sessions: 4, trend: "+8" },
  { skill: "SQL & Databases", score: 55, sessions: 2, trend: "-2" },
  { skill: "OS Concepts", score: 48, sessions: 1, trend: "—" },
  { skill: "Networking", score: 61, sessions: 3, trend: "+1" },
];

function scoreClass(score: number) {
  return score >= 75 ? "score-high" : score >= 60 ? "score-medium" : "score-low";
}
function barClass(score: number) {
  return `bar-fill ${scoreClass(score)}`;
}

export default function SkillsPage() {
  return (
    <>
      {/* Top bar */}
      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">Skill <em>Breakdown</em></div>
          <div className="dash-date">Your proficiency across all interview categories</div>
        </div>
        <div className="topbar-actions">
          <button className="btn-new-session">+ Practice Weak Skills</button>
        </div>
      </div>

      {/* Summary row */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="dash-stat-card anim-0">
          <div className="dash-stat-top"><span className="stat-card-dot dot-gold" /><span className="dash-stat-label">Strongest Skill</span></div>
          <div className="dash-stat-value" style={{ fontSize: "1.2rem" }}>System Design</div>
          <div className="dash-stat-delta">Score: 84 / 100</div>
        </div>
        <div className="dash-stat-card anim-1">
          <div className="dash-stat-top"><span className="stat-card-dot dot-accent" /><span className="dash-stat-label">Needs Most Work</span></div>
          <div className="dash-stat-value" style={{ fontSize: "1.2rem" }}>OS Concepts</div>
          <div className="dash-stat-delta">Score: 48 / 100</div>
        </div>
        <div className="dash-stat-card anim-2">
          <div className="dash-stat-top"><span className="stat-card-dot dot-violet" /><span className="dash-stat-label">Overall Average</span></div>
          <div className="dash-stat-value">65<span className="dash-stat-unit">/ 100</span></div>
          <div className="dash-stat-delta">+4 pts this week</div>
        </div>
      </div>

      {/* Skill breakdown */}
      <div className="panel">
        <div className="panel-header">
          <div><div className="panel-title">All Skills</div><div className="panel-sub">Based on your sessions</div></div>
        </div>
        <div className="skill-list skill-list-lg">
          {skillRadar.map((s, i) => {
            const st = s.score >= 75 ? "high" : s.score >= 60 ? "medium" : "low";
            return (
              <div key={s.skill} className="skill-row" style={{ animationDelay: `${i * 0.07}s` }}>
                <div className="skill-row-top">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span className="skill-name">{s.skill}</span>
                    <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.65rem", color: s.trend.startsWith("+") ? "var(--positive)" : s.trend.startsWith("-") ? "var(--rose)" : "var(--muted)" }}>
                      {s.trend}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <span className={`tag ${st === "high" ? "tag-gold" : st === "medium" ? "tag-amber" : "tag-rose"}`}>
                      {st === "high" ? "Strong" : st === "medium" ? "Good" : "Needs work"}
                    </span>
                    <span className={`skill-score ${scoreClass(s.score)}`}>{s.score}/100</span>
                  </div>
                </div>
                <div className="bar-track bar-track-lg">
                  <div className={barClass(s.score)} style={{ width: `${s.score}%` }} />
                </div>
                <div className="skill-hint" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>
                    {st === "low" ? "🎯 Recommended: 2 sessions this week" : st === "medium" ? "📈 Keep practicing to reach Strong" : "✅ Maintain with 1 session/week"}
                  </span>
                  <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.65rem", color: "var(--muted)" }}>
                    {s.sessions} session{s.sessions !== 1 ? "s" : ""} done
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommendation panel */}
      <div className="panel" style={{ background: "rgba(255,92,53,0.04)", borderColor: "rgba(255,92,53,0.2)" }}>
        <div className="panel-header">
          <div><div className="panel-title">AI Recommendation</div><div className="panel-sub">Based on your weak areas</div></div>
          <span className="tag tag-accent">AI Coach</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {["OS Concepts — Start with process scheduling basics (1 session)",
            "SQL & Databases — Focus on indexing strategies (2 sessions)",
            "Data Structures — Practice graph traversal problems (1 session)"].map((rec, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ color: "var(--accent-2)", fontSize: "0.9rem", flexShrink: 0 }}>→</span>
              <span style={{ fontSize: "0.83rem", color: "var(--text-2)" }}>{rec}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "1.25rem" }}>
          <button className="resume-action-btn primary">Start Recommended Session</button>
        </div>
      </div>
    </>
  );
}
