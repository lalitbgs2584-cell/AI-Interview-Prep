"use client";

import { getSocket } from "@/ws-client-config/socket";
import { useEffect, useRef, useState } from "react";

const insights = [
  { label: "Experience Level", val: "Senior · 6+ years", dot: "dot-accent" },
  { label: "Key Skills Detected", val: "React, Node.js, AWS, PostgreSQL", dot: "dot-gold" },
  { label: "Target Roles", val: "Staff Engineer · Tech Lead", dot: "dot-violet" },
  { label: "ATS Score", val: "82 / 100 — Good", dot: "dot-accent" },
];

const suggestions = [
  { text: "Add quantified impact to your Amazon role", priority: "high" },
  { text: "Mention system scale in System Design bullets", priority: "medium" },
  { text: "Include open-source contributions", priority: "low" },
  { text: "Add certifications section (AWS, GCP)", priority: "medium" },
];

// ── Styles pulled OUT of JSX to avoid parser confusion ──────────────────────
const spinnerStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  border: "2px solid rgba(255,255,255,0.3)",
  borderTopColor: "#fff",
  borderRadius: "50%",
  display: "inline-block",
  animation: "spin 0.7s linear infinite",
};

const uploadBtnStyle = (uploading: boolean): React.CSSProperties => ({
  opacity: uploading ? 0.7 : 1,
  cursor: uploading ? "not-allowed" : "pointer",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
});

const successBannerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.85rem 1.1rem",
  borderRadius: "var(--r-lg)",
  background: "rgba(226,168,75,0.07)",
  border: "1px solid rgba(226,168,75,0.25)",
};

// ─────────────────────────────────────────────────────────────────────────────

function priorityClass(p: string) {
  return p === "high" ? "tag-rose" : p === "medium" ? "tag-amber" : "tag-gold";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type UploadStatus = "idle" | "uploading" | "done" | "error";
type ProcessingStatus = "idle" | "processing" | "ready" | "error";

export default function ResumePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fetchResume, setFetchResume] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDrag, setIsDrag] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>("idle");
  const [iframeError, setIframeError] = useState(false);

  // ── Revoke blob URL on unmount / change ──────────────────────────────────
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // ── On mount: load existing resume from DB ───────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/get-resume");
        if (!response.ok) return;
        const data = await response.json();
        console.log("Resume Url :", data.resumeUrl);
        if (data.resumeUrl && data.resumeFileName) {
          const fullUrl = data.resumeUrl.startsWith("http")
            ? data.resumeUrl
            : `https://d13lry3aagw513.cloudfront.net/${data.resumeUrl}`;
          setPreviewUrl(fullUrl);
          setFile(new File([], data.resumeFileName));
          setUploadStatus("done");
          // Resume already exists in DB — insights are ready
          setProcessingStatus("ready");
        }
      } catch (err) {
        console.error("Error loading resume:", err);
      }
    })();
  }, [fetchResume]);

  // ── WebSocket: listen for processing result ───────────────────────────────
  useEffect(() => {
    const socket = getSocket();

    socket.on(
      "resume_processed",
      (data: { status: string; fileId: string; text?: string; error?: string }) => {
        if (data.status === "success") {
          setProcessingStatus("ready");
        } else {
          setProcessingStatus("error");
        }
      }
    );

    return () => {
      socket.off("resume_processed");
    };
  }, []);

  // ── File helpers ─────────────────────────────────────────────────────────
  function handleFile(f: File | null) {
    if (!f) return;
    if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setUploadStatus("idle");
    setProcessingStatus("idle");
    setIframeError(false);
    setPreviewUrl(f.type === "application/pdf" ? URL.createObjectURL(f) : null);
  }

  function removeFile() {
    if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setUploadStatus("idle");
    setProcessingStatus("idle");
    setIframeError(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDrag(false);
    handleFile(e.dataTransfer.files?.[0] ?? null);
  }

  // ── Upload flow ──────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!file) return;
    setUploadStatus("uploading");

    try {
      // 1. Get presigned URL
      const mime = file.type || "application/octet-stream";
      const presignRes = await fetch("/api/get-presigned-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: mime.split("/")[1] }),
      });
      if (!presignRes.ok) throw new Error("Failed to get presigned URL");
      const { url, Filename: S3fileName } = await presignRes.json();

      // 2. PUT file directly to S3
      const uploadRes = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("S3 upload failed");

      // 3. Clean URL (strip presigned query params)
      const fileUrl = url.split("?")[0];
      console.log("File URL is : ", fileUrl);

      // 4. Save to DB
      const saveRes = await fetch("/api/save-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl, fileName: file.name, mime: mime.split("/")[1], S3fileName }),
      });
      if (!saveRes.ok) throw new Error("Failed to save resume to DB");
      const { fileId } = await saveRes.json();

      // 5. Mark upload done immediately — don't block on processing
      setPreviewUrl(fileUrl);
      setIframeError(false);
      setUploadStatus("done");
      setFetchResume(true);

      // 6. Fire-and-forget — queue the job, WebSocket will deliver the result
      setProcessingStatus("processing");
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/process-resume`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, S3fileName }),
      }).catch(() => {
        // Only hits here if the queue request itself fails (network error etc.)
        setProcessingStatus("error");
      });

    } catch (err) {
      console.error(err);
      setUploadStatus("error");
    }
  }

  const isDocx = file && (file.name.endsWith(".doc") || file.name.endsWith(".docx"));
  const isUploading = uploadStatus === "uploading";

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.2; } }
      `}</style>

      {/* ── Top bar ── */}
      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">Resume <em>Builder</em></div>
          <div className="dash-date">Upload your resume to get AI-tailored interview sessions</div>
        </div>
        {uploadStatus === "done" && (
          <div className="topbar-actions">
            <button
              className="resume-action-btn primary"
              disabled={processingStatus === "processing"}
              style={{ opacity: processingStatus === "processing" ? 0.5 : 1 }}
            >
              &#9889; Generate Interview Plan
            </button>
          </div>
        )}
      </div>

      {/* ── Upload panel ── */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Upload Resume</div>
            <div className="panel-sub">PDF, DOC, or DOCX &middot; Max 10 MB</div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />

        {!file ? (
          /* ── Drop zone ── */
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
          /* ── File selected ── */
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* File info row */}
            <div className="resume-file-card">
              <span className="resume-file-icon">{isDocx ? "📝" : "📋"}</span>
              <div>
                <div className="resume-file-name">{file.name}</div>
                <div className="resume-file-size">
                  {file.size > 0 ? `${formatBytes(file.size)} · ` : ""}
                  {isDocx ? "Word Document" : "PDF"}
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
                <button
                  className="resume-file-remove"
                  style={{ color: "var(--text-3)", borderColor: "var(--border)" }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  Replace
                </button>
                <button
                  className="resume-file-remove"
                  onClick={removeFile}
                  disabled={isUploading}
                >
                  Remove
                </button>
              </div>
            </div>

            {/* PDF preview */}
            {previewUrl && !isDocx && (
              <div style={{
                borderRadius: "var(--r-lg)",
                overflow: "hidden",
                border: "1px solid var(--border)",
                background: "var(--card-2)",
              }}>
                <div style={{
                  padding: "0.6rem 1rem",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}>
                  <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.68rem", color: "var(--muted)" }}>
                    Preview &middot; {file.name}
                  </span>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: "var(--ff-mono)", fontSize: "0.68rem", color: "var(--accent-2)", textDecoration: "none" }}
                  >
                    Open full &#8599;
                  </a>
                </div>

                {!iframeError ? (
                  <iframe
                    src={previewUrl}
                    title="Resume Preview"
                    style={{ width: "100%", height: "540px", border: "none", display: "block" }}
                    onError={() => setIframeError(true)}
                  />
                ) : (
                  <div style={{
                    height: 140,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                  }}>
                    <span style={{ fontSize: "1.5rem" }}>&#128196;</span>
                    <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                      Preview blocked by browser &mdash;{" "}
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--accent-2)", textDecoration: "none" }}
                      >
                        open in new tab &#8599;
                      </a>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* DOCX — no browser preview */}
            {isDocx && (
              <div style={{
                borderRadius: "var(--r-lg)",
                border: "1px solid var(--border)",
                background: "var(--card-2)",
                padding: "2.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
                textAlign: "center",
              }}>
                <span style={{ fontSize: "2.5rem" }}>&#128221;</span>
                <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>{file.name}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-3)", maxWidth: 320, lineHeight: 1.6 }}>
                  Word documents cannot be previewed in the browser. The AI will parse it on submission.
                </div>
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.25rem" }}>
                  {file.size > 0 && <span className="tag tag-gold">{formatBytes(file.size)}</span>}
                  <span className="tag tag-accent">Ready to submit</span>
                </div>
              </div>
            )}

            {/* Upload button / success banner / error */}
            {uploadStatus !== "done" ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <button
                  className="resume-action-btn primary"
                  onClick={handleUpload}
                  disabled={isUploading}
                  style={uploadBtnStyle(isUploading)}
                >
                  {isUploading ? (
                    <>
                      <span style={spinnerStyle} />
                      Uploading...
                    </>
                  ) : "Upload Resume"}
                </button>
                {uploadStatus === "error" && (
                  <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.72rem", color: "var(--rose)" }}>
                    Upload failed &mdash; try again
                  </span>
                )}
              </div>
            ) : (
              <div style={successBannerStyle}>
                <span style={{ fontSize: "1.1rem" }}>&#9989;</span>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--positive)" }}>
                    Resume uploaded successfully
                  </div>
                  <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.68rem", color: "var(--muted)" }}>
                    {processingStatus === "processing"
                      ? "AI is analyzing your resume..."
                      : processingStatus === "ready"
                      ? "AI analysis is ready below"
                      : processingStatus === "error"
                      ? "Analysis failed — you can still continue"
                      : "AI analysis is ready below"}
                  </div>
                </div>
                {/* Inline spinner while processing */}
                {processingStatus === "processing" && (
                  <span style={{ ...spinnerStyle, marginLeft: "auto" }} />
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {/* ── AI insights — only after upload done ── */}
      {uploadStatus === "done" && (
        <>
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">AI Resume Insights</div>
                <div className="panel-sub">Parsed and analyzed</div>
              </div>
              {/* Status tag */}
              {processingStatus === "processing" && (
                <span className="tag tag-amber">⏳ Analyzing...</span>
              )}
              {processingStatus === "ready" && (
                <span className="tag tag-accent">✅ AI Powered</span>
              )}
              {processingStatus === "error" && (
                <span className="tag tag-rose">❌ Analysis failed</span>
              )}
            </div>

            {/* Skeleton while processing */}
            {processingStatus === "processing" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0.5rem 0" }}>
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    style={{
                      height: 48,
                      borderRadius: "var(--r-lg)",
                      background: "var(--card-2)",
                      animation: "pulse 1.5s ease-in-out infinite",
                      animationDelay: `${i * 0.1}s`,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Insights grid when ready */}
            {processingStatus === "ready" && (
              <div className="resume-section-grid">
                {insights.map((item) => (
                  <div key={item.label} className="resume-insight-item">
                    <span
                      className={`stat-card-dot ${item.dot}`}
                      style={{ marginTop: "0.45rem", flexShrink: 0, width: 7, height: 7, borderRadius: "50%", display: "inline-block" }}
                    />
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
              <div style={{
                padding: "1.25rem",
                borderRadius: "var(--r-lg)",
                background: "rgba(247,106,106,0.06)",
                border: "1px solid rgba(247,106,106,0.2)",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}>
                <span style={{ fontSize: "1.25rem" }}>⚠️</span>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--rose)", marginBottom: "0.2rem" }}>
                    Analysis failed
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
                    We couldn&apos;t analyze your resume. You can still continue or try re-uploading.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Suggestions — only when ready */}
          {processingStatus === "ready" && (
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
                    <button className="session-replay-btn">Fix &#8594;</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Next Steps</div>
            </div>
            <div className="resume-action-row">
              <button
                className="resume-action-btn primary"
                disabled={processingStatus === "processing"}
                style={{ opacity: processingStatus === "processing" ? 0.5 : 1 }}
              >
                &#9889; Generate Interview Plan
              </button>
              <button
                className="resume-action-btn"
                disabled={processingStatus === "processing"}
                style={{ opacity: processingStatus === "processing" ? 0.5 : 1 }}
              >
                &#8681; Download Analysis
              </button>
              <button className="resume-action-btn" onClick={removeFile}>
                &#8635; Re-upload Resume
              </button>
              <button
                className="resume-action-btn"
                disabled={processingStatus === "processing"}
                style={{ opacity: processingStatus === "processing" ? 0.5 : 1 }}
              >
                &#127919; Target a Role
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Empty state ── */}
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