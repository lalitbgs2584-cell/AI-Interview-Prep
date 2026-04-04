"use client";

import { useEffect, useMemo, useState } from "react";
import Topbar from "@/components/layouts/Topbar";
import { fetchAdminAnalytics, type AdminAnalyticsResponse } from "@/lib/admin-api";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const CHART_STYLE = {
  tooltip: {
    contentStyle: {
      background: "#111620",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8,
      fontFamily: "var(--ff-mono)",
      fontSize: "0.75rem",
      color: "#eef0f8",
    },
    itemStyle: { color: "#eef0f8" },
    labelStyle: { color: "#6b7590", marginBottom: 4 },
  },
};

const PIE_COLORS = ["#ff5c35", "#38bdf8", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444"];

export default function AnalyticsPage() {
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const next = await fetchAdminAnalytics();
        if (!active) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load analytics");
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

  const cards = useMemo(() => {
    const kpis = data?.kpis;
    return [
      { label: "Drop-off Rate", value: `${kpis?.dropOffRate ?? 0}%`, color: "var(--rose)" },
      { label: "Completion Rate", value: `${kpis?.completionRate ?? 0}%`, color: "var(--positive)" },
      { label: "Platform Avg Score", value: `${kpis?.avgScore ?? 0}`, color: "var(--amber)" },
      { label: "Active Right Now", value: `${kpis?.activeNow ?? 0}`, color: "var(--accent-2)" },
    ];
  }, [data]);

  return (
    <>
      <Topbar title="Analytics" sub="// platform-wide performance insights" />
      <main className="admin-main">
        {error && <div className="panel" style={{ color: "var(--rose)", marginBottom: "1rem" }}>{error}</div>}

        <div className="stats-grid anim-0">
          {cards.map((kpi) => (
            <div className="stat-card" key={kpi.label}>
              <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.4rem" }}>{kpi.label}</div>
              <div style={{ fontFamily: "var(--ff-display)", fontSize: "2rem", fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{loading ? "--" : kpi.value}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-3)", marginTop: "0.5rem" }}>
                {kpi.label === "Platform Avg Score" ? `Avg duration ${data?.kpis.avgDurationMinutes ?? 0} mins` : kpi.label === "Active Right Now" ? `${data?.kpis.failedJobs24h ?? 0} failed jobs in 24h` : `${data?.kpis.totalInterviews ?? 0} tracked sessions`}
              </div>
            </div>
          ))}
        </div>

        <div className="panel anim-1">
          <div className="panel-header">
            <div>
              <div className="panel-title">Performance Trend</div>
              <div className="panel-sub">average score and interview volume over the last six months</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data?.performanceTrend ?? []} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: "#6b7590", fontSize: 11, fontFamily: "var(--ff-mono)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7590", fontSize: 11, fontFamily: "var(--ff-mono)" }} axisLine={false} tickLine={false} />
              <Tooltip {...CHART_STYLE.tooltip} />
              <Line type="monotone" dataKey="avg" name="Avg Score" stroke="#ff5c35" strokeWidth={2} dot={{ fill: "#ff5c35", r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="interviews" name="Interviews" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="two-col anim-2">
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Most Failed Areas</div>
                <div className="panel-sub">derived from low-scoring skill pillars in recent summaries</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.topicWeakness ?? []} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#6b7590", fontSize: 10, fontFamily: "var(--ff-mono)" }} axisLine={false} tickLine={false} unit="%" />
                <YAxis type="category" dataKey="topic" tick={{ fill: "#b0b8cc", fontSize: 10, fontFamily: "var(--ff-mono)" }} axisLine={false} tickLine={false} width={110} />
                <Tooltip {...CHART_STYLE.tooltip} />
                <Bar dataKey="failRate" name="Fail Rate" fill="#ff5c35" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Recommendation Split</div>
                <div className="panel-sub">distribution of final summary recommendations</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data?.recommendationSplit ?? []} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} dataKey="value">
                  {(data?.recommendationSplit ?? []).map((entry, index) => (
                    <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_STYLE.tooltip.contentStyle} itemStyle={CHART_STYLE.tooltip.itemStyle} labelStyle={CHART_STYLE.tooltip.labelStyle} />
                <Legend iconType="circle" iconSize={8} formatter={(value) => <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.7rem", color: "var(--text-2)" }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </main>
    </>
  );
}


