"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Topbar from "@/components/layouts/Topbar";
import AdminRecordingGallery from "@/components/admin/AdminRecordingGallery";
import { fetchAdminUser, updateAdminUser, type AdminUserDetail } from "@/lib/admin-api";

export default function UserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [tab, setTab] = useState<"interviews" | "resume" | "skills">("interviews");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetchAdminUser(userId);
      setData(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [userId]);

  const stats = useMemo(() => [
    { label: "Interviews", value: data?.stats.interviewCount ?? 0 },
    { label: "Completed", value: data?.stats.completedCount ?? 0 },
    { label: "Avg Score", value: data?.stats.avgScore ?? "--" },
    { label: "Recordings", value: data?.stats.recordingCount ?? 0 },
  ], [data]);

  const toggleBlock = async () => {
    if (!data) return;
    await updateAdminUser(userId, { isBlocked: !data.profile.isBlocked });
    await load();
  };

  const toggleRole = async () => {
    if (!data) return;
    await updateAdminUser(userId, { role: data.profile.role === "ADMIN" ? "USER" : "ADMIN" });
    await load();
  };

  return (
    <>
      <Topbar title="User Profile" />
      <main className="admin-main">
        {error && <div className="panel" style={{ color: "var(--rose)", marginBottom: "1rem" }}>{error}</div>}
        {loading && <div className="panel">Loading user profile</div>}
        {!loading && data && (
          <>
            <div className="panel anim-0">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "var(--text)", fontSize: "1.45rem", fontWeight: 800 }}>{data.profile.name}</div>
                  <div style={{ color: "var(--muted)", fontFamily: "var(--ff-mono)", fontSize: "0.75rem" }}>{data.profile.email}</div>
                  <div style={{ display: "flex", gap: "0.55rem", marginTop: "0.9rem", flexWrap: "wrap" }}>
                    <span className={`tag ${data.profile.role === "ADMIN" ? "tag-accent" : "tag-sky"}`}>{data.profile.role}</span>
                    <span className={`tag ${data.profile.status === "blocked" ? "tag-rose" : data.profile.status === "active" ? "tag-gold" : "tag-sky"}`}>{data.profile.status}</span>
                    <span className="tag tag-violet">Joined {new Date(data.profile.joinedAt).toLocaleDateString("en-IN")}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                  <button className="btn-ghost" onClick={() => void toggleBlock()}>
                    {data.profile.isBlocked ? "Unblock User" : "Block User"}
                  </button>
                  <button className="btn-accent" onClick={() => void toggleRole()}>
                    Make {data.profile.role === "ADMIN" ? "User" : "Admin"}
                  </button>
                </div>
              </div>
              <div className="stats-grid" style={{ marginTop: "1rem" }}>
                {stats.map((item) => (
                  <div key={item.label} className="stat-card">
                    <div className="stat-label">{item.label}</div>
                    <div className="stat-value">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel anim-1" style={{ padding: "1rem" }}>
              <div className="filter-bar">
                {[
                  { id: "interviews", label: "Interviews" },
                  { id: "resume", label: "Resume" },
                  { id: "skills", label: "Skills" },
                ].map((item) => (
                  <button key={item.id} className={`filter-chip${tab === item.id ? " active" : ""}`} onClick={() => setTab(item.id as typeof tab)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {tab === "interviews" && (
              <div style={{ display: "grid", gap: "1rem" }}>
                {data.interviews.map((interview) => (
                  <div className="panel anim-2" key={interview.id}>
                    <div className="panel-header">
                      <div>
                        <div className="panel-title">{interview.title}</div>
                        <div className="panel-sub">
                          {interview.type} - {interview.status} - {new Date(interview.createdAt).toLocaleString("en-IN")}
                        </div>
                      </div>
                      <Link href={`/interviews/${interview.id}`} className="btn-ghost" style={{ textDecoration: "none" }}>
                        Open session
                      </Link>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.8rem", marginBottom: "1rem" }}>
                      <div className="stat-card"><div className="stat-label">Score</div><div className="stat-value">{interview.score ?? "--"}</div></div>
                      <div className="stat-card"><div className="stat-label">Questions</div><div className="stat-value">{interview.questionCount}</div></div>
                      <div className="stat-card"><div className="stat-label">Duration</div><div className="stat-value">{Math.round(interview.durationSeconds / 60)}m</div></div>
                      <div className="stat-card"><div className="stat-label">Violations</div><div className="stat-value">{interview.fsExits + interview.tabSwitches}</div></div>
                    </div>
                    <AdminRecordingGallery recordings={interview.recordings} emptyLabel="No interview recording saved for this session yet." />
                  </div>
                ))}
              </div>
            )}

            {tab === "resume" && (
              <div className="panel anim-2">
                {!data.resume ? (
                  <div style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>This user has not uploaded a resume yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: "1rem" }}>
                    <div>
                      <div className="panel-title">Resume Insights</div>
                      <div className="panel-sub">{data.resume.file.originalFileName}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.8rem" }}>
                      <div className="stat-card"><div className="stat-label">ATS Score</div><div className="stat-value">{data.resume.insights?.atsScore ?? "--"}</div></div>
                      <div className="stat-card"><div className="stat-label">Experience Level</div><div className="stat-value">{data.resume.insights?.experienceLevel ?? "--"}</div></div>
                      <div className="stat-card"><div className="stat-label">File Status</div><div className="stat-value">{data.resume.file.status}</div></div>
                    </div>
                    <div style={{ display: "grid", gap: "0.8rem" }}>
                      <div>
                        <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 6 }}>Key Skills</div>
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          {(data.resume.insights?.keySkills ?? []).map((skill) => <span key={skill} className="tag tag-accent">{skill}</span>)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 6 }}>Projects</div>
                        <div style={{ display: "grid", gap: "0.6rem" }}>
                          {data.resume.projects.map((project, index) => (
                            <div key={index} className="session-row">
                              <div style={{ color: "var(--text)", fontWeight: 600 }}>{String(project.title ?? "Project")}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "skills" && (
              <div className="panel anim-2">
                <div className="panel-header">
                  <div>
                    <div className="panel-title">Skills and Gaps</div>
                    <div className="panel-sub">Resume skills plus persistent weak areas</div>
                  </div>
                </div>
                <div style={{ display: "grid", gap: "1rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {data.skills.map((skill) => (
                      <span key={skill.id} className="tag tag-sky">{skill.name}{skill.category ? ` - ${skill.category}` : ""}</span>
                    ))}
                  </div>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--muted)", fontSize: "0.75rem" }}>
                    {JSON.stringify(data.gapReport ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

