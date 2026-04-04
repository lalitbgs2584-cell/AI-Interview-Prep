"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/layouts/Topbar";
import { fetchAdminInterviews, type AdminInterviewListItem } from "@/lib/admin-api";

function scoreClass(score: number) {
  if (score >= 75) return "score-high";
  if (score >= 55) return "score-medium";
  return "score-low";
}

export default function InterviewsPage() {
  const [items, setItems] = useState<AdminInterviewListItem[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await fetchAdminInterviews({ q: query, type, status, page: 1, pageSize: 50 });
        setItems(response.items);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load interviews");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [query, type, status]);

  return (
    <>
      <Topbar title="Interviews" />
      <main className="admin-main">
        <div className="panel anim-0" style={{ padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by user, email, or role"
              className="topbar-search"
              style={{ minWidth: 240, flex: 1, maxWidth: 380 }}
            />
            <div className="filter-bar">
              {["ALL", "TECHNICAL", "BEHAVIORAL", "SYSTEM_DESIGN", "HR"].map((value) => (
                <button key={value} className={`filter-chip${type === value ? " active" : ""}`} onClick={() => setType(value)}>
                  {value}
                </button>
              ))}
            </div>
            <div className="filter-bar">
              {["ALL", "CREATED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((value) => (
                <button key={value} className={`filter-chip${status === value ? " active" : ""}`} onClick={() => setStatus(value)}>
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="panel" style={{ color: "var(--rose)", marginBottom: "1rem" }}>{error}</div>}

        <div className="panel anim-1" style={{ padding: 0, overflow: "hidden" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: "1.25rem" }}>User</th>
                <th>Interview</th>
                <th>Type</th>
                <th>Score</th>
                <th>Violations</th>
                <th>Status</th>
                <th style={{ paddingRight: "1.25rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: "1.2rem", color: "var(--text-3)" }}>Loading interviews</td></tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td style={{ paddingLeft: "1.25rem" }}>
                    <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.85rem" }}>{item.userName}</div>
                    <div style={{ color: "var(--muted)", fontFamily: "var(--ff-mono)", fontSize: "0.65rem" }}>{item.userEmail}</div>
                  </td>
                  <td>
                    <div style={{ color: "var(--text)", fontWeight: 600, fontSize: "0.82rem" }}>{item.title}</div>
                    <div style={{ color: "var(--muted)", fontFamily: "var(--ff-mono)", fontSize: "0.65rem" }}>{new Date(item.createdAt).toLocaleString("en-IN")}</div>
                  </td>
                  <td><span className="tag tag-violet">{item.type}</span></td>
                  <td>{item.score == null ? "--" : <span className={scoreClass(item.score)}>{item.score}</span>}</td>
                  <td>{item.violations.fsExits + item.violations.tabSwitches}</td>
                  <td><span className="tag tag-gold">{item.status}</span></td>
                  <td style={{ paddingRight: "1.25rem" }}>
                    <Link href={`/interviews/${item.id}`} className="btn-ghost" style={{ textDecoration: "none" }}>
                      Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

