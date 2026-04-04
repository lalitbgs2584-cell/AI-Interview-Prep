"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import {
  createEmptyEducationEntry,
  createEmptyExperienceEntry,
  createEmptyProjectEntry,
  createEmptyResumeBuilderData,
  estimateResumeAts,
  getResumeTitle,
  normalizeBuilderData,
  normalizeList,
  profileToResumeBuilderData,
  renderResumeLatex,
  ResumeBuilderData,
  ResumeEducationEntry,
  ResumeExperienceEntry,
  ResumeProjectEntry,
  type AtsScoreBreakdown,
} from "@/lib/resume-builder-core";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="resume-preview-empty">Loading editor...</div>,
});

type LoadState = "idle" | "loading" | "ready";

type GeneratedResumeResponse = {
  title: string;
  latexCode: string;
  ats: AtsScoreBreakdown;
  sourceData: ResumeBuilderData;
};

function formatListForTextarea(items: string[]) {
  return items.join("\n");
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="resume-entry-header">
      <h3>{title}</h3>
      {action}
    </div>
  );
}

export default function ResumeBuilderClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedResumeId = searchParams.get("id") ?? "";
  const previewUrlRef = useRef<string | null>(null);
  const hasBootstrappedRef = useRef(false);

  const [formData, setFormData] = useState<ResumeBuilderData>(createEmptyResumeBuilderData());
  const [latexCode, setLatexCode] = useState("");
  const [title, setTitle] = useState("Candidate - ATS Resume");
  const [ats, setAts] = useState<AtsScoreBreakdown>(estimateResumeAts(createEmptyResumeBuilderData()));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [savedResumeId, setSavedResumeId] = useState(requestedResumeId);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready to build.");
  const [errorMessage, setErrorMessage] = useState("");

  const liveAts = useMemo(() => estimateResumeAts(formData), [formData]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hasBootstrappedRef.current) {
      return;
    }

    hasBootstrappedRef.current = true;
    setLoadState("loading");

    const bootstrap = async () => {
      try {
        if (requestedResumeId) {
          const response = await fetch(`/api/resume/${requestedResumeId}`, { credentials: "include" });
          if (!response.ok) {
            throw new Error("Could not load the saved resume.");
          }

          const data = await response.json();
          const record = data.resume;
          const normalized = normalizeBuilderData(record.sourceData);
          setFormData(normalized);
          setLatexCode(record.latexCode || renderResumeLatex(normalized));
          setTitle(record.title || getResumeTitle(normalized));
          setAts(record.atsBreakdown || estimateResumeAts(normalized));
          setSavedResumeId(record.id);
          setStatusMessage("Loaded saved resume.");
        } else {
          const response = await fetch("/api/user/profile", { credentials: "include" });
          if (response.ok) {
            const data = await response.json();
            const normalized = profileToResumeBuilderData(data);
            setFormData(normalized);
            setLatexCode(renderResumeLatex(normalized));
            setTitle(getResumeTitle(normalized));
            setAts(estimateResumeAts(normalized));
            setStatusMessage("Prefilled from your profile and interview history.");
          } else {
            const fallback = createEmptyResumeBuilderData();
            setFormData(fallback);
            setLatexCode(renderResumeLatex(fallback));
            setTitle(getResumeTitle(fallback));
          }
        }
      } catch (error) {
        console.error(error);
        setErrorMessage(error instanceof Error ? error.message : "Unable to load resume builder.");
        const fallback = createEmptyResumeBuilderData();
        setFormData(fallback);
        setLatexCode(renderResumeLatex(fallback));
        setTitle(getResumeTitle(fallback));
      } finally {
        setLoadState("ready");
      }
    };

    void bootstrap();
  }, [requestedResumeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void (async () => {
          const saveResult = await handleSave();
          if (saveResult) {
            await compileResume(latexCode || renderResumeLatex(formData));
          }
        })();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [formData, latexCode]);

  function setPreviewBlob(blob: Blob) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const nextUrl = URL.createObjectURL(blob);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }

  function updateForm(next: ResumeBuilderData) {
    const normalized = normalizeBuilderData(next);
    setFormData(normalized);
    setAts(estimateResumeAts(normalized));
    if (!latexCode.trim()) {
      setLatexCode(renderResumeLatex(normalized));
    }
    setTitle(getResumeTitle(normalized));
  }

  function updateScalarField<K extends keyof ResumeBuilderData>(field: K, value: ResumeBuilderData[K]) {
    updateForm({ ...formData, [field]: value });
  }

  function updateSkillGroup(group: keyof ResumeBuilderData["skills"], value: string) {
    updateForm({
      ...formData,
      skills: {
        ...formData.skills,
        [group]: normalizeList(value),
      },
    });
  }

  function updateExperience(index: number, patch: Partial<ResumeExperienceEntry>) {
    updateForm({
      ...formData,
      experience: formData.experience.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              ...patch,
            }
          : entry,
      ),
    });
  }

  function updateEducation(index: number, patch: Partial<ResumeEducationEntry>) {
    updateForm({
      ...formData,
      education: formData.education.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              ...patch,
            }
          : entry,
      ),
    });
  }

  function updateProject(index: number, patch: Partial<ResumeProjectEntry>) {
    updateForm({
      ...formData,
      projects: formData.projects.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              ...patch,
            }
          : entry,
      ),
    });
  }

  async function compileResume(code: string, download = false) {
    const latexToCompile = code.trim() ? code : renderResumeLatex(formData);
    setErrorMessage("");
    setIsCompiling(true);
    setStatusMessage(download ? "Compiling PDF for download..." : "Compiling preview...");

    try {
      const response = await fetch("/api/resume/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ latexCode: latexToCompile }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.details || errorData?.error || "Compilation failed.");
      }

      const pdfBlob = await response.blob();
      setPreviewBlob(pdfBlob);
      setStatusMessage(download ? "PDF ready to download." : "Preview compiled successfully.");

      if (download) {
        const downloadUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "resume"}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);
      }

      return true;
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Compilation failed.");
      setStatusMessage("Compilation needs attention.");
      return false;
    } finally {
      setIsCompiling(false);
    }
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setErrorMessage("");
    setStatusMessage("Generating ATS-focused LaTeX from your data...");

    try {
      const response = await fetch("/api/resume/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Generation failed.");
      }

      const data = (await response.json()) as GeneratedResumeResponse;
      const normalized = normalizeBuilderData(data.sourceData);
      setFormData(normalized);
      setLatexCode(data.latexCode);
      setTitle(data.title);
      setAts(data.ats);
      setStatusMessage("ATS-focused draft generated. Compiling preview...");
      await compileResume(data.latexCode);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Generation failed.");
      setStatusMessage("Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setErrorMessage("");
    setStatusMessage("Saving your resume draft...");

    try {
      const sourceData = normalizeBuilderData(formData);
      const code = latexCode.trim() ? latexCode : renderResumeLatex(sourceData);
      if (!latexCode.trim()) {
        setLatexCode(code);
      }

      const response = await fetch("/api/resume/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: savedResumeId || undefined,
          title,
          latexCode: code,
          atsScore: ats.score,
          ats,
          sourceData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Save failed.");
      }

      const data = await response.json();
      setSavedResumeId(data.id);
      router.replace(`/resume/builder?id=${data.id}`);
      setStatusMessage("Resume saved.");
      return data.id as string;
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Unable to save resume.");
      setStatusMessage("Save failed.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  const isBusy = isGenerating || isCompiling || isSaving || loadState === "loading";

  if (loadState === "loading") {
    return (
      <div className="resume-page">
        <div className="resume-preview-empty">Loading your builder...</div>
      </div>
    );
  }

  return (
    <div className="resume-page">
      <div className="resume-header">
        <div>
          <div className="resume-eyebrow">Resume Studio</div>
          <h1 className="resume-title">
            ATS-friendly <em>resume builder</em>
          </h1>
          <p className="resume-subtitle">
            Build a clean single-column resume, shape it around a target role, and compile the final PDF without dragging a heavy LaTeX runtime into the browser.
          </p>
        </div>
        <div className="resume-header-actions">
          <Link href="/resume" className="resume-button ghost">
            Saved resumes
          </Link>
          <button className="resume-button primary" onClick={() => void handleGenerate()} disabled={isBusy}>
            {isGenerating ? "Generating..." : "Generate with AI"}
          </button>
        </div>
      </div>

      <div className="resume-toolbar">
        <div className="resume-toolbar-meta">
          <span className="resume-ats-pill">ATS {ats.score}</span>
          <span className="resume-badge">Live estimator {liveAts.score}</span>
          <span className="resume-status">{statusMessage}</span>
        </div>
        <div className="resume-toolbar-actions">
          <button className="resume-button" onClick={() => setLatexCode(renderResumeLatex(formData))} disabled={isBusy}>
            Refresh template
          </button>
          <button className="resume-button" onClick={() => void compileResume(latexCode)} disabled={isBusy}>
            {isCompiling ? "Compiling..." : "Compile"}
          </button>
          <button className="resume-button" onClick={() => void compileResume(latexCode, true)} disabled={isBusy}>
            Download PDF
          </button>
          <button className="resume-button primary" onClick={() => void handleSave()} disabled={isBusy}>
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {errorMessage ? <div className="resume-error" style={{ marginBottom: 16 }}>{errorMessage}</div> : null}

      <Group orientation="horizontal" className="resume-builder-panels">
        <Panel defaultSize={28} minSize={22}>
          <div className="resume-sidebar">
            <div className="resume-section">
              <SectionHeader
                title="Candidate details"
                action={
                  <button
                    className="resume-mini-button"
                    onClick={async () => {
                      const response = await fetch("/api/user/profile", { credentials: "include" });
                      if (!response.ok) {
                        setErrorMessage("Unable to pull profile data right now.");
                        return;
                      }
                      const data = await response.json();
                      const normalized = profileToResumeBuilderData(data);
                      updateForm(normalized);
                      setLatexCode(renderResumeLatex(normalized));
                      setStatusMessage("Profile data pulled into the builder.");
                    }}
                  >
                    Pull profile data
                  </button>
                }
              />
              <div className="resume-field-grid">
                <div className="resume-field">
                  <label>Name</label>
                  <input className="resume-input" value={formData.fullName} onChange={(event) => updateScalarField("fullName", event.target.value)} />
                </div>
                <div className="resume-field">
                  <label>Target role</label>
                  <input className="resume-input" value={formData.targetRole} onChange={(event) => updateScalarField("targetRole", event.target.value)} />
                </div>
                <div className="resume-field">
                  <label>Email</label>
                  <input className="resume-input" value={formData.email} onChange={(event) => updateScalarField("email", event.target.value)} />
                </div>
                <div className="resume-field">
                  <label>Phone</label>
                  <input className="resume-input" value={formData.phone} onChange={(event) => updateScalarField("phone", event.target.value)} />
                </div>
                <div className="resume-field">
                  <label>Location</label>
                  <input className="resume-input" value={formData.location} onChange={(event) => updateScalarField("location", event.target.value)} />
                </div>
                <div className="resume-field">
                  <label>Website</label>
                  <input className="resume-input" value={formData.website} onChange={(event) => updateScalarField("website", event.target.value)} />
                </div>
                <div className="resume-field">
                  <label>LinkedIn</label>
                  <input className="resume-input" value={formData.linkedin} onChange={(event) => updateScalarField("linkedin", event.target.value)} />
                </div>
                <div className="resume-field">
                  <label>GitHub</label>
                  <input className="resume-input" value={formData.github} onChange={(event) => updateScalarField("github", event.target.value)} />
                </div>
              </div>
              <div className="resume-field">
                <label>Professional summary</label>
                <textarea className="resume-textarea" value={formData.summary} onChange={(event) => updateScalarField("summary", event.target.value)} />
              </div>
              <div className="resume-field">
                <label>Job description</label>
                <textarea
                  className="resume-textarea"
                  value={formData.jobDescription}
                  onChange={(event) => updateScalarField("jobDescription", event.target.value)}
                  placeholder="Paste a JD here to push keyword matching and ATS suggestions."
                />
              </div>
            </div>

            <div className="resume-section">
              <SectionHeader title="Skills" />
              <div className="resume-field">
                <label>Core skills</label>
                <textarea className="resume-textarea" value={formatListForTextarea(formData.skills.core)} onChange={(event) => updateSkillGroup("core", event.target.value)} />
              </div>
              <div className="resume-field">
                <label>Tools</label>
                <textarea className="resume-textarea" value={formatListForTextarea(formData.skills.tools)} onChange={(event) => updateSkillGroup("tools", event.target.value)} />
              </div>
              <div className="resume-field">
                <label>Platforms</label>
                <textarea className="resume-textarea" value={formatListForTextarea(formData.skills.platforms)} onChange={(event) => updateSkillGroup("platforms", event.target.value)} />
              </div>
            </div>

            <div className="resume-section">
              <SectionHeader
                title="Experience"
                action={<button className="resume-mini-button" onClick={() => updateForm({ ...formData, experience: [...formData.experience, createEmptyExperienceEntry()] })}>Add role</button>}
              />
              {formData.experience.map((entry, index) => (
                <div key={entry.id} className="resume-entry-card">
                  <div className="resume-entry-header">
                    <strong>Role {index + 1}</strong>
                    {formData.experience.length > 1 ? (
                      <button className="resume-mini-button warn" onClick={() => updateForm({ ...formData, experience: formData.experience.filter((_, entryIndex) => entryIndex !== index) })}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="resume-field-grid">
                    <div className="resume-field"><label>Company</label><input className="resume-input" value={entry.company} onChange={(event) => updateExperience(index, { company: event.target.value })} /></div>
                    <div className="resume-field"><label>Title</label><input className="resume-input" value={entry.title} onChange={(event) => updateExperience(index, { title: event.target.value })} /></div>
                    <div className="resume-field"><label>Location</label><input className="resume-input" value={entry.location} onChange={(event) => updateExperience(index, { location: event.target.value })} /></div>
                    <div className="resume-field"><label>Start date</label><input className="resume-input" value={entry.startDate} onChange={(event) => updateExperience(index, { startDate: event.target.value })} /></div>
                    <div className="resume-field"><label>End date</label><input className="resume-input" value={entry.endDate} onChange={(event) => updateExperience(index, { endDate: event.target.value })} /></div>
                  </div>
                  <div className="resume-field">
                    <label>Bullets (one per line)</label>
                    <textarea className="resume-textarea" value={formatListForTextarea(entry.bullets)} onChange={(event) => updateExperience(index, { bullets: normalizeList(event.target.value) })} />
                  </div>
                </div>
              ))}
            </div>

            <div className="resume-section">
              <SectionHeader
                title="Education"
                action={<button className="resume-mini-button" onClick={() => updateForm({ ...formData, education: [...formData.education, createEmptyEducationEntry()] })}>Add education</button>}
              />
              {formData.education.map((entry, index) => (
                <div key={entry.id} className="resume-entry-card">
                  <div className="resume-entry-header">
                    <strong>Education {index + 1}</strong>
                    {formData.education.length > 1 ? (
                      <button className="resume-mini-button warn" onClick={() => updateForm({ ...formData, education: formData.education.filter((_, entryIndex) => entryIndex !== index) })}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="resume-field-grid">
                    <div className="resume-field"><label>Institution</label><input className="resume-input" value={entry.institution} onChange={(event) => updateEducation(index, { institution: event.target.value })} /></div>
                    <div className="resume-field"><label>Degree</label><input className="resume-input" value={entry.degree} onChange={(event) => updateEducation(index, { degree: event.target.value })} /></div>
                    <div className="resume-field"><label>Location</label><input className="resume-input" value={entry.location} onChange={(event) => updateEducation(index, { location: event.target.value })} /></div>
                    <div className="resume-field"><label>Start date</label><input className="resume-input" value={entry.startDate} onChange={(event) => updateEducation(index, { startDate: event.target.value })} /></div>
                    <div className="resume-field"><label>End date</label><input className="resume-input" value={entry.endDate} onChange={(event) => updateEducation(index, { endDate: event.target.value })} /></div>
                    <div className="resume-field"><label>Grade</label><input className="resume-input" value={entry.grade} onChange={(event) => updateEducation(index, { grade: event.target.value })} /></div>
                  </div>
                  <div className="resume-field">
                    <label>Details (one per line)</label>
                    <textarea className="resume-textarea" value={formatListForTextarea(entry.details)} onChange={(event) => updateEducation(index, { details: normalizeList(event.target.value) })} />
                  </div>
                </div>
              ))}
            </div>

            <div className="resume-section">
              <SectionHeader
                title="Projects"
                action={<button className="resume-mini-button" onClick={() => updateForm({ ...formData, projects: [...formData.projects, createEmptyProjectEntry()] })}>Add project</button>}
              />
              {formData.projects.map((entry, index) => (
                <div key={entry.id} className="resume-entry-card">
                  <div className="resume-entry-header">
                    <strong>Project {index + 1}</strong>
                    {formData.projects.length > 1 ? (
                      <button className="resume-mini-button warn" onClick={() => updateForm({ ...formData, projects: formData.projects.filter((_, entryIndex) => entryIndex !== index) })}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="resume-field-grid">
                    <div className="resume-field"><label>Name</label><input className="resume-input" value={entry.name} onChange={(event) => updateProject(index, { name: event.target.value })} /></div>
                    <div className="resume-field"><label>Role</label><input className="resume-input" value={entry.role} onChange={(event) => updateProject(index, { role: event.target.value })} /></div>
                    <div className="resume-field"><label>Link</label><input className="resume-input" value={entry.link} onChange={(event) => updateProject(index, { link: event.target.value })} /></div>
                    <div className="resume-field"><label>Tech stack</label><input className="resume-input" value={entry.techStack.join(", ")} onChange={(event) => updateProject(index, { techStack: normalizeList(event.target.value) })} /></div>
                  </div>
                  <div className="resume-field">
                    <label>Bullets (one per line)</label>
                    <textarea className="resume-textarea" value={formatListForTextarea(entry.bullets)} onChange={(event) => updateProject(index, { bullets: normalizeList(event.target.value) })} />
                  </div>
                </div>
              ))}
            </div>

            <div className="resume-section">
              <SectionHeader title="Highlights" />
              <div className="resume-field">
                <label>Certifications</label>
                <textarea className="resume-textarea" value={formatListForTextarea(formData.certifications)} onChange={(event) => updateScalarField("certifications", normalizeList(event.target.value))} />
              </div>
              <div className="resume-field">
                <label>Achievements</label>
                <textarea className="resume-textarea" value={formatListForTextarea(formData.achievements)} onChange={(event) => updateScalarField("achievements", normalizeList(event.target.value))} />
              </div>
            </div>
          </div>
        </Panel>

        <Separator className="resume-resize-handle" />

        <Panel defaultSize={40} minSize={30}>
          <div className="resume-editor-panel">
            <MonacoEditor
              height="100%"
              language="latex"
              theme="vs-dark"
              value={latexCode}
              onChange={(value) => setLatexCode(value ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                scrollBeyondLastLine: false,
                wordWrap: "on",
                automaticLayout: true,
              }}
            />
          </div>
        </Panel>

        <Separator className="resume-resize-handle" />

        <Panel defaultSize={32} minSize={24}>
          <div className="resume-preview-panel">
            <div className="resume-section">
              <SectionHeader title="ATS score breakdown" />
              <div className="resume-metric-grid">
                {[
                  { label: "Keyword match", value: ats.keywordCoverage },
                  { label: "Section coverage", value: ats.sectionCoverage },
                  { label: "Quantified bullets", value: ats.quantifiedCoverage },
                  { label: "Action verbs", value: ats.actionVerbCoverage },
                ].map((metric) => (
                  <div key={metric.label} className="resume-metric">
                    <div className="resume-muted">{metric.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{metric.value}%</div>
                    <div className="resume-meter"><span style={{ width: `${metric.value}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="resume-section">
              <SectionHeader title="Matched keywords" />
              <div className="resume-chip-list">
                {ats.matchedKeywords.length ? ats.matchedKeywords.map((keyword) => <span key={keyword} className="resume-chip">{keyword}</span>) : <span className="resume-side-note">Paste a JD to unlock keyword matching.</span>}
              </div>
            </div>

            <div className="resume-section">
              <SectionHeader title="What to improve" />
              <div className="resume-chip-list" style={{ marginBottom: 12 }}>
                {ats.missingKeywords.length ? ats.missingKeywords.slice(0, 8).map((keyword) => <span key={keyword} className="resume-chip">{keyword}</span>) : <span className="resume-side-note">Your important keywords are already well covered.</span>}
              </div>
              <div className="resume-side-note">
                {ats.suggestions.length ? ats.suggestions.join(" ") : "Your draft already covers the core ATS checks tracked by this builder."}
              </div>
            </div>

            <div className="resume-section">
              <SectionHeader title="PDF preview" />
              {previewUrl ? (
                <iframe className="resume-preview-frame" src={previewUrl} title="Resume PDF Preview" />
              ) : (
                <div className="resume-preview-empty">
                  Generate or compile the current LaTeX to preview the PDF here.
                </div>
              )}
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  );
}

