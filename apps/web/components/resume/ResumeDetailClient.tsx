"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface ResumeDetailClientProps {
  resumeId: string;
}

interface ResumeDetailRecord {
  id: string;
  title: string;
  latexCode: string;
  atsScore: number;
  targetRole: string | null;
  createdAt: string;
  updatedAt: string;
  atsBreakdown: {
    score: number;
    keywordCoverage: number;
    sectionCoverage: number;
    quantifiedCoverage: number;
    actionVerbCoverage: number;
    lengthScore: number;
    matchedKeywords: string[];
    missingKeywords: string[];
    missingSections: string[];
    suggestions: string[];
  };
}

export default function ResumeDetailClient({ resumeId }: ResumeDetailClientProps) {
  const previewUrlRef = useRef<string | null>(null);
  const [resume, setResume] = useState<ResumeDetailRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/resume/${resumeId}`, { credentials: "include" });
        if (!response.ok) {
          throw new Error("Unable to load this resume.");
        }

        const data = await response.json();
        const record = data.resume as ResumeDetailRecord;
        setResume(record);

        const compileResponse = await fetch("/api/resume/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ latexCode: record.latexCode }),
        });

        if (!compileResponse.ok) {
          const compileError = await compileResponse.json().catch(() => null);
          throw new Error(compileError?.details || compileError?.error || "Unable to compile the saved resume.");
        }

        const pdfBlob = await compileResponse.blob();
        const url = URL.createObjectURL(pdfBlob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
      } catch (loadError) {
        console.error(loadError);
        setError(loadError instanceof Error ? loadError.message : "Unable to load this resume.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [resumeId]);

  async function handleDownload() {
    if (!resume) return;
    setDownloading(true);
    setError("");

    try {
      const response = await fetch("/api/resume/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ latexCode: resume.latexCode }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.details || errorData?.error || "Unable to compile the PDF.");
      }

      const pdfBlob = await response.blob();
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${resume.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);
    } catch (downloadError) {
      console.error(downloadError);
      setError(downloadError instanceof Error ? downloadError.message : "Unable to download the PDF.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="resume-page">
        <div className="resume-preview-empty">Loading saved resume...</div>
      </div>
    );
  }

  if (error || !resume) {
    return (
      <div className="resume-page">
        <div className="resume-error">{error || "Resume not found."}</div>
      </div>
    );
  }

  const breakdown = resume.atsBreakdown;

  return (
    <div className="resume-page">
      <div className="resume-header">
        <div>
          <div className="resume-eyebrow">Resume Insight</div>
          <h1 className="resume-title">
            {resume.title.split(" - ")[0]} <em>resume view</em>
          </h1>
          <p className="resume-subtitle">
            Review the saved PDF, inspect the ATS breakdown, and jump back into the LaTeX builder whenever you want to tighten the draft.
          </p>
        </div>
        <div className="resume-header-actions">
          <Link href="/resume" className="resume-button ghost">
            All resumes
          </Link>
          <Link href={`/resume/builder?id=${resume.id}`} className="resume-button">
            Edit in builder
          </Link>
          <button className="resume-button primary" onClick={() => void handleDownload()} disabled={downloading}>
            {downloading ? "Preparing..." : "Download PDF"}
          </button>
        </div>
      </div>

      <div className="resume-split-detail">
        <div className="resume-detail-card resume-detail-preview">
          {previewUrl ? (
            <iframe className="resume-preview-frame" src={previewUrl} title="Saved Resume Preview" />
          ) : (
            <div className="resume-preview-empty">Preview unavailable right now.</div>
          )}
        </div>

        <div style={{ display: "grid", gap: 20 }}>
          <div className="resume-detail-card">
            <div className="resume-badge-row" style={{ marginBottom: 16 }}>
              <span className="resume-ats-pill">ATS {resume.atsScore}</span>
              {resume.targetRole ? <span className="resume-badge">{resume.targetRole}</span> : null}
            </div>
            <div className="resume-muted">Updated {new Date(resume.updatedAt).toLocaleString()}</div>
          </div>

          <div className="resume-detail-card">
            <h3>ATS breakdown</h3>
            {[ 
              { label: "Keyword match", value: breakdown.keywordCoverage },
              { label: "Section coverage", value: breakdown.sectionCoverage },
              { label: "Quantified bullets", value: breakdown.quantifiedCoverage },
              { label: "Action verbs", value: breakdown.actionVerbCoverage },
              { label: "Length fit", value: breakdown.lengthScore },
            ].map((metric) => (
              <div key={metric.label} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span>{metric.label}</span>
                  <span>{metric.value}%</span>
                </div>
                <div className="resume-meter"><span style={{ width: `${metric.value}%` }} /></div>
              </div>
            ))}
          </div>

          <div className="resume-detail-card">
            <h3>Matched keywords</h3>
            <div className="resume-chip-list">
              {breakdown.matchedKeywords.length ? breakdown.matchedKeywords.map((keyword) => <span key={keyword} className="resume-chip">{keyword}</span>) : <span className="resume-side-note">No JD keywords were saved with this draft.</span>}
            </div>
          </div>

          <div className="resume-detail-card">
            <h3>Missing sections or keywords</h3>
            <div className="resume-chip-list" style={{ marginBottom: 12 }}>
              {breakdown.missingSections.map((section) => <span key={section} className="resume-chip">{section}</span>)}
              {breakdown.missingKeywords.slice(0, 8).map((keyword) => <span key={keyword} className="resume-chip">{keyword}</span>)}
            </div>
            <div className="resume-side-note">
              {breakdown.suggestions.length ? breakdown.suggestions.join(" ") : "This saved draft already looks well aligned to the tracked ATS checks."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
