"use client";

import { getSocket } from "@/ws-client-config/socket";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnalysisModal } from "./AnalysisModal";


// "" Types """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

export interface ResumeInsights {
  experienceLevel: number;
  keySkills:       string[];
  ATSSCORE:        number;
  strongDomains:   string[];
  weakAreas:       string[];
}

export interface ResumeData {
  resumeUrl:      string;
  resumeFileName: string;
  insights:       ResumeInsights | null;
}

// "" Helpers """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

export const EXPERIENCE_LABELS: Record<number, string> = {
  0: "Fresher",
  1: "Junior - 0-2 years",
  2: "Mid-level - 2-4 years",
  3: "Senior - 4-8 years",
  4: "Lead / Principal - 8+ years",
};

export function atsLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Average";
  return "Needs Work";
}

export function atsColor(score: number) {
  if (score >= 85) return "var(--accent)";
  if (score >= 70) return "#4ade80";
  if (score >= 50) return "var(--gold)";
  return "var(--rose)";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// "" Analysis Modal """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""



// "" Styles """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

const spinnerStyle: React.CSSProperties = {
  width:          14,
  height:         14,
  border:         "2px solid rgba(255,255,255,0.3)",
  borderTopColor: "#fff",
  borderRadius:   "50%",
  display:        "inline-block",
  animation:      "spin 0.7s linear infinite",
};

const uploadBtnStyle = (uploading: boolean): React.CSSProperties => ({
  opacity:     uploading ? 0.7 : 1,
  cursor:      uploading ? "not-allowed" : "pointer",
  display:     "flex",
  alignItems:  "center",
  gap:         "0.5rem",
});

const successBannerStyle: React.CSSProperties = {
  display:      "flex",
  alignItems:   "center",
  gap:          "0.75rem",
  padding:      "0.85rem 1.1rem",
  borderRadius: "var(--r-lg)",
  background:   "rgba(226,168,75,0.07)",
  border:       "1px solid rgba(226,168,75,0.25)",
};

// "" Component """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

type UploadStatus     = "idle" | "uploading" | "done" | "error";
type ProcessingStatus = "idle" | "processing" | "ready" | "error";

interface ResumePageProps {
  userId: string;
}

export default function ResumePage({ userId }: ResumePageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file,              setFile]             = useState<File | null>(null);
  const [fetchResume,       setFetchResume]       = useState(false);
  const [previewUrl,        setPreviewUrl]        = useState<string | null>(null);
  const [isDrag,            setIsDrag]            = useState(false);
  const [uploadStatus,      setUploadStatus]      = useState<UploadStatus>("idle");
  const [processingStatus,  setProcessingStatus]  = useState<ProcessingStatus>("idle");
  const [iframeError,       setIframeError]       = useState(false);
  const [insights,          setInsights]          = useState<ResumeInsights | null>(null);
  const [showPlanModal,     setShowPlanModal]     = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [toastMsg,          setToastMsg]          = useState<string | null>(null);

  // "" Toast helper """"""""""""""""""""""""""""""""""""""""""""""""""""""""""
  function toast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }

  // "" Revoke blob URL on unmount """"""""""""""""""""""""""""""""""""""""""""
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);


// ... On mount ONLY - no dependency
useEffect(() => {
  (async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/get-resume`,{
        credentials: "include"
      });
      if (!response.ok) return;
      const data = await response.json();
      console.log("resume response:", data);

      if (!data.resumeUploaded) return; 
      console.log("Resume uploaded is true");
      const resumeUrl = data.resumeUrl.split("uploads/")[1]
      // ... Remove http check - direct CloudFront
      const fullUrl = `https://d13lry3aagw513.cloudfront.net/${resumeUrl}`;
      console.log("PDF URL:", fullUrl);

      setPreviewUrl(fullUrl);
      setFile(new File([], data.resumeFileName));
      setUploadStatus("done");

      // Restore processing status
      switch (data.fileStatus) {
        case "PROCESSED":
          setInsights(data.insights ?? null);
          setProcessingStatus(data.insights ? "ready" : "idle");
          break;
        case "FAILED":
          setProcessingStatus("error");
          break;
        case "UPLOADED":
        case "STARTING":
          setProcessingStatus("processing");
          break;
        default:
          setProcessingStatus("idle");
      }
    } catch (err) {
      console.error("Error loading resume:", err);
    }
  })();
}, []);  // ... EMPTY DEPENDENCY - runs ONCE on mount


  // "" WebSocket: processing result """"""""""""""""""""""""""""""""""""""""""
  useEffect(() => {
  const socket = getSocket();
  if (userId) {
    socket.emit("user:join", { userId });
  }

  socket.on(
    "resume_processed",
    (data: { status: string; fileId: string; insights?: ResumeInsights; error?: string }) => {
      if (data.status === "success" && data.insights) {
        setInsights(data.insights);
        setProcessingStatus("ready");
      } else if (data.status === "success") {
        // Insights not in socket payload " re-fetch from DB to get them
        setFetchResume((v) => !v);
      } else {
        setProcessingStatus("error");
      }
    }
  );

  socket.on("job_failed", (data: { message?: string; scope?: string }) => {
    if (data?.scope === "resume_processing") {
      toast(data.message || "Resume processing failed. Please re-upload your file.");
      setProcessingStatus("error");
    }
  });

  socket.on("budget_exceeded", (data: { scope?: string; message?: string }) => {
    if (data?.scope === "resume") {
      toast(data.message || "Daily interview limit reached. Resets at midnight.");
      setProcessingStatus("error");
    }
  });

  return () => {
    socket.off("resume_processed");
    socket.off("job_failed");
    socket.off("budget_exceeded");
  };
}, [userId]);

  // "" File helpers """"""""""""""""""""""""""""""""""""""""""""""""""""""""""
  function handleFile(f: File | null) {
    if (!f) return;
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setUploadStatus("idle");
    setProcessingStatus("idle");
    setIframeError(false);
    setInsights(null);
    setPreviewUrl(f.type === "application/pdf" ? URL.createObjectURL(f) : null);
  }

  function removeFile() {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setUploadStatus("idle");
    setProcessingStatus("idle");
    setIframeError(false);
    setInsights(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDrag(false);
    handleFile(e.dataTransfer.files?.[0] ?? null);
  }

  // "" Upload flow """""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  async function handleUpload() {
    if (!file) return;
    setUploadStatus("uploading");

    try {
      const mime = file.type || "application/octet-stream";
      const presignRes = await fetch("/api/get-presigned-url", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ fileName: file.name, fileType: mime.split("/")[1] }),
      });
      if (!presignRes.ok) throw new Error("Failed to get presigned URL");
      const { url, Filename: S3fileName } = await presignRes.json();

      const uploadRes = await fetch(url, {
        method:  "PUT",
        headers: { "Content-Type": file.type },
        body:    file,
      });
      if (!uploadRes.ok) throw new Error("S3 upload failed");

      const fileUrl = url.split("?")[0];

      const saveRes = await fetch("/api/save-resume", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ fileUrl, fileName: file.name, mime: mime.split("/")[1], S3fileName }),
      });
      if (!saveRes.ok) throw new Error("Failed to save resume to DB");
      const { fileId } = await saveRes.json();

      setPreviewUrl(fileUrl);
      setIframeError(false);
      setUploadStatus("done");

      setProcessingStatus("processing");
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/process-resume`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ fileId, S3fileName }),
      }).catch(() => setProcessingStatus("error"));

    } catch (err) {
      console.error(err);
      setUploadStatus("error");
    }
  }

  // "" Derived """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  const isUploading  = uploadStatus === "uploading";
  const isProcessing = processingStatus === "processing";

  const insightRows = insights
    ? [
        {
          label: "Experience Level",
          val:   EXPERIENCE_LABELS[insights.experienceLevel] ?? `Level ${insights.experienceLevel}`,
          dot:   "dot-accent",
        },
        {
          label: "ATS Score",
          val:   `${insights.ATSSCORE} / 100 " ${atsLabel(insights.ATSSCORE)}`,
          dot:   "dot-accent",
        },
      ]
    : [];

  const suggestions = insights?.weakAreas.map((area, i) => ({
    text:     area,
    priority: i === 0 ? "high" : i === 1 ? "medium" : "low",
  })) ?? [];

  const atsBoostPlan = insights
    ? [
        ...(insights.ATSSCORE < 85
          ? [{
              title: "Add measurable impact",
              detail: "Quantify outcomes with metrics (%, $, time saved, scale, users).",
              priority: "high",
            }]
          : []),
        ...(insights.keySkills.length < 8
          ? [{
              title: "Expand keyword coverage",
              detail: "Add 6-12 role-specific skills and tools that match target job listings.",
              priority: "high",
            }]
          : []),
        ...(insights.strongDomains.length < 2
          ? [{
              title: "Clarify your domain focus",
              detail: "Highlight 1-2 core domains in your summary and top projects.",
              priority: "medium",
            }]
          : []),
        ...(insights.weakAreas.some((w) => /project/i.test(w))
          ? [{
              title: "Strengthen projects section",
              detail: "Add 2-3 projects with scope, tools, and business impact.",
              priority: "high",
            }]
          : []),
        ...(insights.weakAreas.some((w) => /cert|course/i.test(w))
          ? [{
              title: "Add certifications or coursework",
              detail: "List 1-3 relevant credentials that align with the role.",
              priority: "medium",
            }]
          : []),
        {
          title: "Use ATS-friendly formatting",
          detail: "Keep headings simple, avoid tables/graphics, and use standard section titles.",
          priority: "low",
        },
      ]
    : [];

  const sectionHints = insights
    ? (() => {
        const hints: { label: string; tip: string }[] = [];
        const weakText = insights.weakAreas.join(" ").toLowerCase();
        const add = (label: string, tip: string) => {
          if (!hints.some((h) => h.label === label)) hints.push({ label, tip });
        };

        if (/summary|headline|objective/.test(weakText)) {
          add("Professional Summary", "Add a 2-3 line summary tailored to the role.");
        }
        if (/project/.test(weakText)) {
          add("Projects", "Show impact, tools, and outcomes.");
        }
        if (/skills/.test(weakText)) {
          add("Skills", "Include hard skills + tools that match job posts.");
        }
        if (/experience/.test(weakText)) {
          add("Experience", "Lead with impact + measurable results.");
        }
        if (/cert|course/.test(weakText)) {
          add("Certifications", "Add relevant certs or coursework.");
        }
        if (/education/.test(weakText)) {
          add("Education", "List degree, school, and graduation year.");
        }

        return hints;
      })()
    : [];

  const keywordFocus = insights?.keySkills ?? [];

  function priorityClass(p: string) {
    return p === "high" ? "tag-rose" : p === "medium" ? "tag-amber" : "tag-gold";
  }

  // "" Render """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  return (
    <>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes pulse   { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.2; } }
        @keyframes fadeIn  { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 999, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.75rem 1.25rem", fontSize: "0.82rem", color: "var(--text)", boxShadow: "0 4px 24px rgba(0,0,0,0.3)", animation: "fadeIn 0.2s ease" }}>
          {toastMsg}
        </div>
      )}

      {/* Modals */}
      
      <AnalysisModal
        open={showAnalysisModal}
        onClose={() => setShowAnalysisModal(false)}
        insights={insights}
      />

      {/* Top bar */}
      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">Resume <em>Builder</em></div>
          <div className="dash-date">Upload your resume to get AI-tailored interview sessions</div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link href="/resume" className="resume-action-btn" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>Saved ATS resumes</Link>
          <Link href="/resume/builder" className="resume-action-btn primary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>Create ATS resume</Link>
        </div>
      </div>

      {/* Upload panel */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Upload Resume</div>
            <div className="panel-sub">PDF&middot; Max 10 MB</div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />

        {!file ? (
          <div
            className={`resume-upload-zone${isDrag ? " drag-over" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
            onDragLeave={() => setIsDrag(false)}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          >
            <span className="resume-upload-icon">&#128196;</span>
            <div className="resume-upload-title">Drop your resume here</div>
            <div className="resume-upload-sub">Supports PDF, DOC, DOCX</div>
            <span className="resume-upload-btn" style={{ marginTop: "1.5rem" }}>Browse Files</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* File info */}
            <div className="resume-file-card">
              <span className="resume-file-icon">"</span>
              <div>
                <div className="resume-file-name">{file.name}</div>
                <div className="resume-file-size">
                  {file.size > 0 ? `${formatBytes(file.size)} - ` : ""}
                PDF
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
                <button className="resume-file-remove" style={{ color: "var(--text-3)", borderColor: "var(--border)" }} onClick={() => fileInputRef.current?.click()} disabled={isUploading}>Replace</button>
                <button className="resume-file-remove" onClick={removeFile} disabled={isUploading}>Remove</button>
              </div>
            </div>

            {/* PDF preview */}
            {previewUrl &&  (
              <div style={{ borderRadius: "var(--r-lg)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--card-2)" }}>
                <div style={{ padding: "0.6rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.68rem", color: "var(--muted)" }}>Preview &middot; {file.name}</span>
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--ff-mono)", fontSize: "0.68rem", color: "var(--accent-2)", textDecoration: "none" }}>Open full &#8599;</a>
                </div>
                {!iframeError ? (
                  <iframe src={previewUrl} title="Resume Preview" style={{ width: "100%", height: "540px", border: "none", display: "block" }} onError={() => setIframeError(true)} />
                ) : (
                  <div style={{ height: 140, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "1.5rem" }}>&#128196;</span>
                    <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                      Preview blocked &mdash;{" "}
                      <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-2)", textDecoration: "none" }}>open in new tab &#8599;</a>
                    </span>
                  </div>
                )}
              </div>
            )}

            

            {/* Upload button / success banner */}
            {uploadStatus !== "done" ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <button className="resume-action-btn primary" onClick={handleUpload} disabled={isUploading} style={uploadBtnStyle(isUploading)}>
                  {isUploading ? (<><span style={spinnerStyle} />Uploading...</>) : "Upload Resume"}
                </button>
                {uploadStatus === "error" && (
                  <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.72rem", color: "var(--rose)" }}>Upload failed &mdash; try again</span>
                )}
              </div>
            ) : (
              <div style={successBannerStyle}>
                <span style={{ fontSize: "1.1rem" }}>&#9989;</span>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--positive)" }}>Resume uploaded successfully</div>
                  <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.68rem", color: "var(--muted)" }}>
                    {processingStatus === "processing" ? "AI is analyzing your resume..."
                      : processingStatus === "ready"   ? "AI analysis is ready below"
                      : processingStatus === "error"   ? "Analysis failed - you can still continue"
                      : "AI analysis is ready below"}
                  </div>
                </div>
                {processingStatus === "processing" && <span style={{ ...spinnerStyle, marginLeft: "auto" }} />}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Insights */}
      {uploadStatus === "done" && (
        <>
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">AI Resume Insights</div>
                <div className="panel-sub">Parsed and analyzed</div>
              </div>
              {processingStatus === "processing" && <span className="tag tag-amber"> Analyzing...</span>}
              {processingStatus === "ready"      && <span className="tag tag-accent">... AI Powered</span>}
              {processingStatus === "error"      && <span className="tag tag-rose"> Analysis failed</span>}
            </div>

            {/* Skeleton */}
            {processingStatus === "processing" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0.5rem 0" }}>
                {[...Array(4)].map((_, i) => (
                  <div key={i} style={{ height: 48, borderRadius: "var(--r-lg)", background: "var(--card-2)", animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            )}

            {/* Insights grid */}
            {processingStatus === "ready" && insightRows.length > 0 && (
              <div className="resume-section-grid">
                {insightRows.map((item) => (
                  <div key={item.label} className="resume-insight-item">
                    <span className={`stat-card-dot ${item.dot}`} style={{ marginTop: "0.45rem", flexShrink: 0, width: 7, height: 7, borderRadius: "50%", display: "inline-block" }} />
                    <div>
                      <div className="resume-insight-label">{item.label}</div>
                      <div className="resume-insight-val">{item.val}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error state */}
            {processingStatus === "error" && (
              <div style={{ padding: "1.25rem", borderRadius: "var(--r-lg)", background: "rgba(247,106,106,0.06)", border: "1px solid rgba(247,106,106,0.2)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "1.25rem" }}> </span>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--rose)", marginBottom: "0.2rem" }}>Analysis failed</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>We couldn&apos;t analyze your resume. You can still continue or try re-uploading.</div>
                </div>
              </div>
            )}
          </div>

          {/* Improvement suggestions from weak areas */}
          {processingStatus === "ready" && suggestions.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Improvement Suggestions</div>
                  <div className="panel-sub">To strengthen your resume</div>
                </div>
              </div>
              <div className="skill-list">
                {suggestions.map((s, i) => (
                  <div key={i} className="session-row" style={{ cursor: "default" }}>
                    <div className="session-row-left">
                      <span className={`tag ${priorityClass(s.priority)}`}>{s.priority}</span>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-2)" }}>{s.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {processingStatus === "ready" && insights && (
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">ATS Boost Plan</div>
                  <div className="panel-sub">What to add next to raise your score</div>
                </div>
                <span className="tag tag-accent">Target 85+</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "0.85rem", background: "var(--bg2)" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Current ATS score
                  </div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: atsColor(insights.ATSSCORE), marginTop: "0.35rem" }}>
                    {insights.ATSSCORE} / 100
                  </div>
                  <div style={{ marginTop: "0.6rem", height: 8, background: "var(--bg)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, insights.ATSSCORE)}%`, height: "100%", background: "var(--accent)", borderRadius: 999 }} />
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.5rem" }}>
                    {atsLabel(insights.ATSSCORE)} " boost by {Math.max(0, 85 - insights.ATSSCORE)} to reach target
                  </div>
                </div>

                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "0.85rem", background: "var(--bg2)" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>
                    Add / strengthen
                  </div>
                  {sectionHints.length === 0 ? (
                    <div style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
                      Your resume sections look balanced. Focus on strengthening impact and keywords.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {sectionHints.map((section) => (
                        <div key={section.label}>
                          <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>{section.label}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{section.tip}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {atsBoostPlan.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginTop: "1rem" }}>
                  {atsBoostPlan.map((item, i) => (
                    <div key={`${item.title}-${i}`} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "0.75rem 0.9rem", background: "var(--bg2)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
                        <span className={`tag ${priorityClass(item.priority)}`}>{item.priority}</span>
                        <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{item.title}</span>
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-2)", lineHeight: 1.6 }}>{item.detail}</div>
                    </div>
                  ))}
                </div>
              )}

              {keywordFocus.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>
                    Keyword focus
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {keywordFocus.slice(0, 16).map((skill) => (
                      <span key={skill} className="tag tag-accent">{skill}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Next steps */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Next Steps</div>
            </div>
            <div className="resume-action-row">
              <button
                className="resume-action-btn"
                disabled={isProcessing || !insights}
                style={{ opacity: isProcessing || !insights ? 0.5 : 1 }}
                onClick={() => setShowAnalysisModal(true)}
              >
                &#128203; View Full Analysis
              </button>
              <button className="resume-action-btn" onClick={removeFile}>
                &#8635; Re-upload Resume
              </button>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!file && (
        <div className="panel" style={{ textAlign: "center", padding: "2.5rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>&#129302;</div>
          <div className="panel-title" style={{ marginBottom: "0.5rem" }}>What happens after upload?</div>
          <div style={{ color: "var(--text-3)", fontSize: "0.82rem", lineHeight: 1.7, maxWidth: 420, margin: "0 auto" }}>
            InterviewAI analyzes your resume to detect your experience level, skills, and target role &mdash;
            then builds a personalized interview session plan just for you.
          </div>
        </div>
      )}
    </>
  );
}


