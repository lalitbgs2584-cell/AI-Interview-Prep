"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/layouts/Topbar";
import { fetchAdminUsers, updateAdminUser, type AdminUserListItem } from "@/lib/admin-api";

function scoreClass(score: number) {
  if (score >= 75) return "score-high";
  if (score >= 55) return "score-medium";
  return "score-low";
}

export default function UsersPage() {
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("ALL");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetchAdminUsers({ q: query, role, status, page: 1, pageSize: 50 });
      setItems(response.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [query, role, status]);

  const toggleBlock = async (user: AdminUserListItem) => {
    await updateAdminUser(user.id, { isBlocked: !user.isBlocked });
    await load();
  };

  const toggleRole = async (user: AdminUserListItem) => {
    await updateAdminUser(user.id, { role: user.role === "ADMIN" ? "USER" : "ADMIN" });
    await load();
  };

  return (
    <>
      <Topbar title="Users" />
      <main className="admin-main">
        <div className="panel anim-0" style={{ padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or email"
              className="topbar-search"
              style={{ minWidth: 240, flex: 1, maxWidth: 380 }}
            />
            <div className="filter-bar">
              {[
                { label: "All", value: "ALL" },
                { label: "Users", value: "USER" },
                { label: "Admins", value: "ADMIN" },
              ].map((option) => (
                <button
                  key={option.value}
                  className={`filter-chip${role === option.value ? " active" : ""}`}
                  onClick={() => setRole(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="filter-bar">
              {[
                { label: "Any status", value: "all" },
                { label: "Active", value: "active" },
                { label: "Blocked", value: "blocked" },
                { label: "Inactive", value: "inactive" },
              ].map((option) => (
                <button
                  key={option.value}
                  className={`filter-chip${status === option.value ? " active" : ""}`}
                  onClick={() => setStatus(option.value)}
                >
                  {option.label}
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
                <th>Role</th>
                <th>Interviews</th>
                <th>Avg Score</th>
                <th>Status</th>
                <th>Joined</th>
                <th style={{ paddingRight: "1.25rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: "1.2rem", color: "var(--text-3)" }}>Loading users</td>
                </tr>
              ) : items.map((user) => (
                <tr key={user.id}>
                  <td style={{ paddingLeft: "1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
                      <div className="user-avatar-sm" style={{ width: 32, height: 32, fontSize: "0.7rem" }}>
                        {user.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.85rem" }}>{user.name}</div>
                        <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.65rem", color: "var(--muted)" }}>{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <button className={`tag ${user.role === "ADMIN" ? "tag-accent" : "tag-sky"}`} onClick={() => void toggleRole(user)}>
                      {user.role}
                    </button>
                  </td>
                  <td>{user.interviewCount}</td>
                  <td>
                    {user.avgScore == null ? "--" : (
                      <span className={scoreClass(user.avgScore)} style={{ fontWeight: 700 }}>
                        {user.avgScore}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`tag ${user.status === "blocked" ? "tag-rose" : user.status === "active" ? "tag-gold" : "tag-sky"}`}>
                      {user.status}
                    </span>
                  </td>
                  <td>{new Date(user.joinedAt).toLocaleDateString("en-IN")}</td>
                  <td style={{ paddingRight: "1.25rem" }}>
                    <div style={{ display: "flex", gap: "0.45rem", justifyContent: "flex-end" }}>
                      <Link href={`/users/${user.id}`} className="btn-ghost" style={{ padding: "0.35rem 0.7rem", fontSize: "0.75rem", textDecoration: "none" }}>
                        View
                      </Link>
                      <button className="btn-ghost" style={{ padding: "0.35rem 0.7rem", fontSize: "0.75rem", color: "var(--rose)" }} onClick={() => void toggleBlock(user)}>
                        {user.isBlocked ? "Unblock" : "Block"}
                      </button>
                    </div>
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

