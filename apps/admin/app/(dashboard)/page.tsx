"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/layouts/Topbar";
import { fetchAdminStats, type AdminStatsResponse } from "@/lib/admin-api";

function scoreClass(score: number) {
  if (score >= 75) return "score-high";
  if (score >= 55) return "score-medium";
  return "score-low";
}

export default function DashboardPage() {
  const [data, setData] = useState<AdminStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const stats = await fetchAdminStats();
        if (!active) return;
        setData(stats);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load admin dashboard");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(load, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const stats = data?.totals;
  const cards = [
    { label: "Total Users", value: stats?.totalUsers ?? 0, delta: `${stats?.newSignups7d ?? 0} new in 7d`, color: "var(--sky)" },
    { label: "Interviews", value: stats?.totalInterviews ?? 0, delta: `${stats?.completedToday ?? 0} completed today`, color: "var(--violet)" },
    { label: "Avg Score", value: stats?.avgScore ?? 0, delta: `${stats?.avgScore7d ?? 0} avg in last 7d`, color: "var(--positive)" },
    { label: "Failed Jobs", value: stats?.failedJobs24h ?? 0, delta: `${stats?.inProgressNow ?? 0} interviews live now`, color: "var(--accent-2)" },
  ];

  return (
    <>
      <Topbar title="Dashboard" />
      <main className="admin-main">
        {error && (
          <div className="panel" style={{ marginBottom: "1rem", color: "var(--rose)" }}>
            {error}
          </div>
        )}

        <div className="stats-grid anim-0">
          {cards.map((card) => (
            <div className="stat-card" key={card.label}>
              <div className="stat-label">{card.label}</div>
              <div className="stat-value">{loading ? "--" : card.value}</div>
              <div className="stat-delta" style={{ color: card.color }}>{card.delta}</div>
            </div>
          ))}
        </div>

        <div className="two-col anim-1">
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Latest Sessions</div>
                <div className="panel-sub">Live feed of recent interview activity</div>
              </div>
            </div>
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {(data?.liveFeed ?? []).map((item) => (
                <Link key={item.id} href={`/interviews/${item.id}`} style={{ textDecoration: "none" }}>
                  <div className="session-row">
                    <div className="session-dot" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "var(--text)", fontWeight: 600, fontSize: "0.84rem" }}>{item.userName}</div>
                      <div style={{ color: "var(--muted)", fontSize: "0.68rem", fontFamily: "var(--ff-mono)" }}>
                        {item.role} - {item.type} - {new Date(item.createdAt).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div className={item.score == null ? "" : scoreClass(item.score)} style={{ fontWeight: 700 }}>
                      {item.score ?? "--"}
                    </div>
                  </div>
                </Link>
              ))}
              {!loading && !data?.liveFeed.length && (
                <div style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>No interview activity yet.</div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Flagged Sessions</div>
                <div className="panel-sub">Integrity issues and non-standard endings</div>
              </div>
            </div>
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {(data?.flaggedSessions ?? []).map((item) => (
                <Link key={item.id} href={`/interviews/${item.id}`} style={{ textDecoration: "none" }}>
                  <div className="session-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "var(--text)", fontWeight: 600, fontSize: "0.82rem" }}>{item.userName}</div>
                      <div style={{ color: "var(--muted)", fontSize: "0.68rem", fontFamily: "var(--ff-mono)" }}>
                        {item.type} - FS {item.fsExits} - Tab {item.tabSwitches} - {item.endReason}
                      </div>
                    </div>
                    <span className="tag tag-rose">Review</span>
                  </div>
                </Link>
              ))}
              {!loading && !data?.flaggedSessions.length && (
                <div style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>No flagged sessions right now.</div>
              )}
            </div>
          </div>
        </div>

        <div className="two-col anim-2">
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Interview Types</div>
                <div className="panel-sub">Distribution across all sessions</div>
              </div>
            </div>
            <div style={{ display: "grid", gap: "0.8rem" }}>
              {Object.entries(data?.interviewTypeBreakdown ?? {}).map(([label, count]) => (
                <div key={label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "var(--text)", fontSize: "0.8rem" }}>{label}</span>
                    <span style={{ color: "var(--muted)", fontFamily: "var(--ff-mono)", fontSize: "0.72rem" }}>{count}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill score-high" style={{ width: `${Math.min(100, count)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Top Skills</div>
                <div className="panel-sub">Most common resume skills across users</div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem" }}>
              {(data?.topSkills ?? []).map((skill) => (
                <span key={skill.id} className="tag tag-accent">
                  {skill.name} - {skill.userCount}
                </span>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

