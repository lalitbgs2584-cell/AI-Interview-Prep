"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface ResumeListItem {
  id: string;
  title: string;
  atsScore: number;
  targetRole: string | null;
  createdAt: string;
  updatedAt: string;
  atsBreakdown?: {
    keywordCoverage?: number;
    sectionCoverage?: number;
  } | null;
}

export default function ResumeListClient() {
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/resume/list", { credentials: "include" });
        if (!response.ok) {
          throw new Error("Unable to load saved resumes.");
        }

        const data = await response.json();
        setResumes(data.resumes ?? []);
      } catch (loadError) {
        console.error(loadError);
        setError(loadError instanceof Error ? loadError.message : "Unable to load saved resumes.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <div className="resume-page">
      <div className="resume-header">
        <div>
          <div className="resume-eyebrow">Resume Hub</div>
          <h1 className="resume-title">
            Your <em>saved resumes</em>
          </h1>
          <p className="resume-subtitle">
            Start a new ATS-focused draft, revisit older versions, or open a saved LaTeX resume for final edits and download.
          </p>
        </div>
        <div className="resume-header-actions">
          <Link href="/dashboard" className="resume-button ghost">
            Back to dashboard
          </Link>
          <Link href="/resume/builder" className="resume-button primary">
            Create new resume
          </Link>
        </div>
      </div>

      {error ? <div className="resume-error" style={{ marginBottom: 16 }}>{error}</div> : null}

      {loading ? (
        <div className="resume-preview-empty">Loading saved resumes...</div>
      ) : resumes.length === 0 ? (
        <div className="resume-empty">
          <p style={{ fontSize: 18, marginBottom: 10 }}>No generated resumes yet.</p>
          <p className="resume-muted" style={{ marginBottom: 18 }}>
            Build your first ATS-focused draft with AI assistance and side-by-side LaTeX editing.
          </p>
          <Link href="/resume/builder" className="resume-button primary">
            Start the builder
          </Link>
        </div>
      ) : (
        <div className="resume-list-grid">
          {resumes.map((resume) => (
            <div key={resume.id} className="resume-list-card">
              <div className="resume-badge-row">
                <span className="resume-ats-pill">ATS {resume.atsScore}</span>
                {resume.targetRole ? <span className="resume-badge">{resume.targetRole}</span> : null}
              </div>
              <div>
                <h3 style={{ fontSize: 22, marginBottom: 8 }}>{resume.title}</h3>
                <div className="resume-muted">
                  Updated {new Date(resume.updatedAt).toLocaleString()}.
                </div>
              </div>
              <div className="resume-stat-row">
                <span className="resume-badge">Keywords {resume.atsBreakdown?.keywordCoverage ?? 0}%</span>
                <span className="resume-badge">Sections {resume.atsBreakdown?.sectionCoverage ?? 0}%</span>
              </div>
              <div className="resume-actions-row">
                <Link href={`/resume/${resume.id}`} className="resume-button">
                  Open insights
                </Link>
                <Link href={`/resume/builder?id=${resume.id}`} className="resume-button ghost">
                  Edit LaTeX
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
