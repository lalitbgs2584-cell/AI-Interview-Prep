"use client";

import { useEffect, useState } from "react";
import Topbar from "@/components/layouts/Topbar";
import { fetchAdminAiMonitor, type AdminAiMonitorResponse } from "@/lib/admin-api";

export default function AIMonitorPage() {
  const [data, setData] = useState<AdminAiMonitorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const next = await fetchAdminAiMonitor();
        if (!active) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load AI monitor");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(load, 20000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const summary = data?.summary;

  return (
    <>
      <Topbar title="AI Monitor" sub="// worker health - live sessions - error logs" />
      <main className="admin-main">
        {error && <div className="panel" style={{ color: "var(--rose)", marginBottom: "1rem" }}>{error}</div>}

        <div className="stats-grid anim-0" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          {[
            { label: "Healthy Workers", value: summary?.healthyWorkers ?? 0, color: "var(--positive)" },
            { label: "Degraded Workers", value: summary?.degradedWorkers ?? 0, color: "var(--rose)" },
            { label: "Active Sessions", value: summary?.activeSessions ?? 0, color: "var(--accent-2)" },
            { label: "Errors 24h", value: summary?.errors24h ?? 0, color: "var(--amber)" },
          ].map((item) => (
            <div className="stat-card" key={item.label}>
              <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.4rem" }}>{item.label}</div>
              <div style={{ fontFamily: "var(--ff-display)", fontSize: "2rem", fontWeight: 800, color: item.color, lineHeight: 1 }}>{loading ? "--" : item.value}</div>
            </div>
          ))}
        </div>

        <div className="two-col anim-1">
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Worker Status</div>
              <div className="live-chip"><span className="dot-live" />Live</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {(data?.workers ?? []).map((worker) => (
                <div key={worker.name} style={{
                  display: "flex", alignItems: "center", gap: "0.75rem",
                  padding: "0.75rem 0.9rem",
                  borderRadius: "var(--r-md)",
                  border: `1px solid ${worker.status === "degraded" ? "rgba(255,77,109,0.2)" : "var(--border)"}`,
                  background: worker.status === "degraded" ? "rgba(255,77,109,0.04)" : "var(--card-2)",
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: worker.status === "healthy" ? "var(--positive)" : "var(--rose)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.78rem", color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{worker.name}</div>
                    <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.62rem", color: "var(--muted)", marginTop: "2px" }}>
                      {worker.jobs} events - {worker.errors} issues - {worker.lastSeen ? new Date(worker.lastSeen).toLocaleString("en-IN") : "never seen"}
                    </div>
                  </div>
                  <span className={`tag ${worker.status === "healthy" ? "tag-gold" : "tag-rose"}`}>{worker.status}</span>
                </div>
              ))}
              {!loading && !(data?.workers?.length) && <div style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>No worker telemetry has been recorded yet.</div>}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Live Interview Sessions</div>
              <div className="live-chip"><span className="dot-live" />{data?.liveSessions.length ?? 0} active</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {(data?.liveSessions ?? []).map((session) => {
                const pct = Math.round((session.question / session.totalQ) * 100);
                return (
                  <div key={session.id} style={{ padding: "0.85rem 1rem", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--card-2)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>{session.userName}</div>
                        <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.63rem", color: "var(--muted)" }}>
                          {session.type.replace("_", " ")} - started {new Date(session.startedAt).toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.7rem", color: "var(--accent-2)", fontWeight: 600 }}>
                        Q{session.question}/{session.totalQ}
                      </div>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }} />
                    </div>
                    <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.6rem", color: "var(--muted)", marginTop: "0.3rem", textAlign: "right" }}>{pct}% complete</div>
                  </div>
                );
              })}
              {!loading && !(data?.liveSessions?.length) && <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-3)", fontSize: "0.82rem" }}>No active sessions</div>}
            </div>
          </div>
        </div>

        <div className="panel anim-2">
          <div className="panel-header">
            <div className="panel-title">Recent Error Log</div>
            <span className="tag tag-rose">{summary?.errors24h ?? 0} errors today</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {(data?.recentErrors ?? []).map((log, index) => (
              <div key={`${log.createdAt}-${index}`} style={{
                display: "flex", alignItems: "flex-start", gap: "0.75rem",
                padding: "0.65rem 0.85rem",
                borderRadius: "var(--r-md)",
                background: log.level === "error" ? "rgba(255,77,109,0.04)" : "rgba(245,166,35,0.04)",
                border: `1px solid ${log.level === "error" ? "rgba(255,77,109,0.15)" : "rgba(245,166,35,0.15)"}`,
              }}>
                <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.65rem", color: "var(--muted)", flexShrink: 0, marginTop: "1px" }}>{log.time}</span>
                <span className={`tag ${log.level === "error" ? "tag-rose" : "tag-amber"}`} style={{ flexShrink: 0 }}>{log.level}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.68rem", color: "var(--accent-2)", marginBottom: "2px" }}>{log.worker}</div>
                  <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.72rem", color: "var(--text-2)", lineHeight: 1.5 }}>{log.msg}</div>
                </div>
              </div>
            ))}
            {!loading && !(data?.recentErrors?.length) && <div style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>No recent warnings or errors.</div>}
          </div>
        </div>
      </main>
    </>
  );
}

