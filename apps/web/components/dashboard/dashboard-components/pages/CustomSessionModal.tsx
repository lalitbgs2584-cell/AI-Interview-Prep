"use client";

import { useState } from "react";
import "./CustomSession.css"

type InterviewType = "TECHNICAL" | "HR" | "SYSTEM_DESIGN" | "BEHAVIORAL";
type Difficulty    = "EASY" | "MEDIUM" | "HARD";

interface Props {
  isOpen:  boolean;
  onClose: () => void;
}

const INTERVIEW_TYPES: { value: InterviewType; label: string; icon: string; desc: string }[] = [
  { value: "TECHNICAL",     label: "Technical",     icon: "◈", desc: "DSA, coding, algorithms" },
  { value: "SYSTEM_DESIGN", label: "System Design", icon: "⬡", desc: "Architecture & scalability" },
  { value: "BEHAVIORAL",    label: "Behavioral",    icon: "◎", desc: "STAR-method, culture fit" },
  { value: "HR",            label: "HR Round",      icon: "◉", desc: "Salary, career, soft skills" },
];

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "EASY",   label: "Easy"   },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD",   label: "Hard"   },
];

const TOPIC_SUGGESTIONS: Record<InterviewType, string[]> = {
  TECHNICAL:     ["Arrays", "Trees", "Graphs", "Dynamic Programming", "Recursion", "Sorting", "Hash Maps", "Linked Lists"],
  SYSTEM_DESIGN: ["URL Shortener", "Rate Limiter", "Chat App", "News Feed", "Load Balancer", "CDN", "Caching"],
  BEHAVIORAL:    ["Leadership", "Conflict Resolution", "Teamwork", "Failure", "Achievement", "Adaptability"],
  HR:            ["Salary Negotiation", "Career Goals", "Strengths", "Weaknesses", "Company Culture", "Work-Life Balance"],
};

export default function CustomSessionModal({ isOpen, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle]               = useState("");
  const [type, setType]                 = useState<InterviewType | "">("");
  const [difficulty, setDifficulty]     = useState<Difficulty | "">("");
  const [questionCount, setQuestionCount] = useState(5);
  const [topics, setTopics]             = useState<string[]>([]);
  const [description, setDescription]   = useState("");

  if (!isOpen) return null;

  const toggleTopic = (t: string) =>
    setTopics((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  const canProceed = type !== "" && difficulty !== "";
  const canSubmit  = canProceed && title.trim() !== "";

  const handleSubmit = () => {
    if (!canSubmit) return;
    console.log({ title, type, difficulty, questionCount, topics, description });
    // TODO: call API → createInterview(...) → router.push(`/interview/${id}`)
    onClose();
  };

  const suggestions = type ? TOPIC_SUGGESTIONS[type] : [];

  return (
    <>
      <div className="csm-backdrop" onClick={onClose} />

      <div className="csm-container">
        {/* Header */}
        <div className="csm-header">
          <div>
            <div className="csm-title">Custom Session</div>
            <div className="csm-subtitle">Configure your interview practice</div>
          </div>
          <button className="csm-close" onClick={onClose}>✕</button>
        </div>

        {/* Steps */}
        <div className="csm-steps">
          <div className={`csm-step ${step >= 1 ? "active" : ""}`}>
            <span className="csm-step-num">1</span>
            <span className="csm-step-label">Setup</span>
          </div>
          <div className="csm-step-line" />
          <div className={`csm-step ${step >= 2 ? "active" : ""}`}>
            <span className="csm-step-num">2</span>
            <span className="csm-step-label">Topics</span>
          </div>
        </div>

        {/* Body */}
        <div className="csm-body">
          {step === 1 && (
            <div className="csm-step-content">
              <div className="csm-field">
                <label className="csm-label">Session Title</label>
                <input className="csm-input" placeholder="e.g. Google SWE Mock Round 1" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div className="csm-field">
                <label className="csm-label">Interview Type</label>
                <div className="csm-type-grid">
                  {INTERVIEW_TYPES.map((t) => (
                    <button key={t.value} className={`csm-type-card ${type === t.value ? "selected" : ""}`} onClick={() => { setType(t.value); setTopics([]); }}>
                      <span className="csm-type-icon">{t.icon}</span>
                      <span className="csm-type-name">{t.label}</span>
                      <span className="csm-type-desc">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="csm-field">
                <label className="csm-label">Difficulty</label>
                <div className="csm-diff-row">
                  {DIFFICULTIES.map((d) => (
                    <button key={d.value} className={`csm-diff-btn csm-diff-${d.value.toLowerCase()} ${difficulty === d.value ? "selected" : ""}`} onClick={() => setDifficulty(d.value)}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="csm-field">
                <label className="csm-label">
                  Number of Questions <span className="csm-count-badge">{questionCount}</span>
                </label>
                <input type="range" min={3} max={15} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="csm-range" />
                <div className="csm-range-labels"><span>3</span><span>9</span><span>15</span></div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="csm-step-content">
              <div className="csm-field">
                <label className="csm-label">Focus Topics <span className="csm-optional">(optional)</span></label>
                <div className="csm-chips">
                  {suggestions.map((t) => (
                    <button key={t} className={`csm-chip ${topics.includes(t) ? "selected" : ""}`} onClick={() => toggleTopic(t)}>{t}</button>
                  ))}
                </div>
              </div>

              <div className="csm-field">
                <label className="csm-label">Additional Notes <span className="csm-optional">(optional)</span></label>
                <textarea className="csm-textarea" placeholder="Any specific areas, weak points, or notes for the AI..." rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="csm-summary">
                <div className="csm-summary-row"><span>Type</span><span>{type}</span></div>
                <div className="csm-summary-row"><span>Difficulty</span><span>{difficulty}</span></div>
                <div className="csm-summary-row"><span>Questions</span><span>{questionCount}</span></div>
                {topics.length > 0 && <div className="csm-summary-row"><span>Topics</span><span>{topics.join(", ")}</span></div>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="csm-footer">
          {step === 2 && <button className="csm-btn-back" onClick={() => setStep(1)}>← Back</button>}
          {step === 1
            ? <button className="csm-btn-primary" disabled={!canProceed} onClick={() => setStep(2)}>Next →</button>
            : <button className="csm-btn-primary" disabled={!canSubmit} onClick={handleSubmit}>Start Session →</button>
          }
        </div>
      </div>
    </>
  );
}