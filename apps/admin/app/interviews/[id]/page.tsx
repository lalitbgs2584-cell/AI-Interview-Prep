"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Topbar from "@/components/layouts/Topbar";
import AdminRecordingGallery from "@/components/admin/AdminRecordingGallery";
import { fetchAdminInterview, type AdminInterviewDetail } from "@/lib/admin-api";

export default function InterviewDetailPage() {
  const params = useParams();
  const interviewId = params.id as string;
  const [data, setData] = useState<AdminInterviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await fetchAdminInterview(interviewId);
        setData(response);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load interview detail");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [interviewId]);

  return (
    <>
      <Topbar title="Interview Detail" />
      <main className="admin-main">
        {error && <div className="panel" style={{ color: "var(--rose)", marginBottom: "1rem" }}>{error}</div>}
        {loading && <div className="panel">Loading interview detail</div>}
        {!loading && data && (
          <>
            <div className="panel anim-0">
              <div className="panel-header">
                <div>
                  <div className="panel-title">{data.title}</div>
                  <div className="panel-sub">
                    <Link href={`/users/${data.user.id}`} style={{ color: "inherit" }}>{data.user.name}</Link> - {data.type} - {new Date(data.createdAt).toLocaleString("en-IN")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                  <span className="tag tag-gold">{data.status}</span>
                  <span className="tag tag-violet">{data.score ?? "--"}</span>
                  <span className="tag tag-rose">{data.endReason}</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.8rem" }}>
                <div className="stat-card"><div className="stat-label">Fullscreen exits</div><div className="stat-value">{data.fsExits}</div></div>
                <div className="stat-card"><div className="stat-label">Tab switches</div><div className="stat-value">{data.tabSwitches}</div></div>
                <div className="stat-card"><div className="stat-label">Interruptions</div><div className="stat-value">{data.interruptionCount}</div></div>
                <div className="stat-card"><div className="stat-label">Duration</div><div className="stat-value">{Math.round(data.durationSeconds / 60)}m</div></div>
              </div>
            </div>

            <div className="panel anim-1">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Interview Recording</div>
                  <div className="panel-sub">Admin playback for this session</div>
                </div>
              </div>
              <AdminRecordingGallery recordings={data.recordings} emptyLabel="No saved interview video was found for this session." />
            </div>

            <div className="panel anim-2">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Question Breakdown</div>
                  <div className="panel-sub">Prompt, candidate answer, and evaluation</div>
                </div>
              </div>
              <div style={{ display: "grid", gap: "0.85rem" }}>
                {data.questions.map((question, index) => {
                  const open = openQuestionId === question.id;
                  return (
                    <div key={question.id} style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                      <button
                        type="button"
                        onClick={() => setOpenQuestionId(open ? null : question.id)}
                        style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.9rem 1rem", background: "transparent", border: "none", color: "var(--text)", textAlign: "left" }}
                      >
                        <span style={{ fontWeight: 600 }}>Q{index + 1}. {question.prompt}</span>
                        <span className="tag tag-sky">{question.evaluation?.overallScore ?? question.score ?? "--"}</span>
                      </button>
                      {open && (
                        <div style={{ padding: "0 1rem 1rem", display: "grid", gap: "0.85rem" }}>
                          <div>
                            <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 6 }}>User Answer</div>
                            <div style={{ color: "var(--text-2)", fontSize: "0.82rem", lineHeight: 1.7 }}>{question.answer || "No answer captured."}</div>
                          </div>
                          <div>
                            <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 6 }}>Evaluation</div>
                            <div style={{ color: "var(--text-2)", fontSize: "0.82rem", lineHeight: 1.7 }}>{question.evaluation?.feedback || question.evaluation?.verdict || "No evaluation stored."}</div>
                          </div>
                          {!!question.evaluation?.missingConcepts.length && (
                            <div>
                              <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 6 }}>Missing concepts</div>
                              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                                {question.evaluation.missingConcepts.map((item) => <span key={item} className="tag tag-rose">{item}</span>)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}

