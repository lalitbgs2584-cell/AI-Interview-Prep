import { useEffect } from "react";
import { atsColor, atsLabel, EXPERIENCE_LABELS, ResumeInsights } from "./ResumePage";

export function AnalysisModal({ open, onClose, insights }: {
  open:     boolean;
  onClose:  () => void;
  insights: ResumeInsights | null;
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !insights) return null;

  const expLabel  = EXPERIENCE_LABELS[insights.experienceLevel] ?? `Level ${insights.experienceLevel}`;
  const scoreColor = atsColor(insights.ATSSCORE);

  // Arc SVG for ATS score
  const radius   = 54;
  const circ     = 2 * Math.PI * radius;
  const dashArr  = circ;
  const dashOff  = circ * (1 - insights.ATSSCORE / 100);

  return (
    <>
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes backdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .analysis-chip {
          display: inline-flex;
          align-items: center;
          padding: 0.28rem 0.7rem;
          border-radius: 99px;
          font-size: 0.72rem;
          font-weight: 600;
          font-family: var(--ff-mono, monospace);
          letter-spacing: 0.02em;
          border: 1px solid;
        }
        .analysis-chip-accent  { background: rgba(0,229,176,0.1);  color: var(--accent, #00e5b0);  border-color: rgba(0,229,176,0.3);  }
        .analysis-chip-blue    { background: rgba(92,159,255,0.1); color: #7eb3ff; border-color: rgba(92,159,255,0.3); }
        .analysis-chip-rose    { background: rgba(247,106,106,0.1); color: #f76a6a; border-color: rgba(247,106,106,0.3); }
        .analysis-section-title {
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted, #888);
          margin-bottom: 0.65rem;
          font-family: var(--ff-mono, monospace);
        }
        .analysis-divider {
          height: 1px;
          background: var(--border, rgba(255,255,255,0.08));
          margin: 1.25rem 0;
        }
        .analysis-weak-row {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          padding: 0.6rem 0.75rem;
          border-radius: 8px;
          background: rgba(247,106,106,0.05);
          border: 1px solid rgba(247,106,106,0.12);
          margin-bottom: 0.5rem;
        }
        .analysis-modal-scroll::-webkit-scrollbar { width: 4px; }
        .analysis-modal-scroll::-webkit-scrollbar-track { background: transparent; }
        .analysis-modal-scroll::-webkit-scrollbar-thumb { background: var(--border, rgba(255,255,255,0.1)); border-radius: 2px; }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:   "fixed",
          inset:      0,
          zIndex:     998,
          background: "rgba(8,8,12,0.75)",
          backdropFilter: "blur(6px)",
          animation:  "backdropIn 0.2s ease",
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Resume Analysis"
        style={{
          position:      "fixed",
          inset:         0,
          zIndex:        999,
          display:       "flex",
          alignItems:    "center",
          justifyContent:"center",
          padding:       "1rem",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            pointerEvents: "all",
            width:         "100%",
            maxWidth:      560,
            maxHeight:     "90vh",
            display:       "flex",
            flexDirection: "column",
            background:    "var(--card, #141418)",
            border:        "1px solid var(--border, rgba(255,255,255,0.08))",
            borderRadius:  "var(--r-xl, 18px)",
            boxShadow:     "0 32px 80px rgba(0,0,0,0.6)",
            animation:     "modalIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",
            overflow:      "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            padding:        "1.25rem 1.5rem 1rem",
            borderBottom:   "1px solid var(--border, rgba(255,255,255,0.08))",
            flexShrink:     0,
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text, #fff)", marginBottom: "0.15rem" }}>
                Resume Analysis
              </div>
              <div style={{ fontSize: "0.73rem", color: "var(--muted, #888)", fontFamily: "var(--ff-mono, monospace)" }}>
                AI-powered insights for your resume
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background:   "var(--card-2, rgba(255,255,255,0.05))",
                border:       "1px solid var(--border, rgba(255,255,255,0.08))",
                borderRadius: "50%",
                width:        32,
                height:       32,
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
                cursor:       "pointer",
                color:        "var(--muted, #888)",
                fontSize:     "1rem",
                lineHeight:   1,
                flexShrink:   0,
              }}
              aria-label="Close"
            >
              -
            </button>
          </div>

          {/* Scrollable body */}
          <div
            className="analysis-modal-scroll"
            style={{ overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: 0 }}
          >
            {/* ATS Score + Experience " top row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>

              {/* ATS Arc */}
              <div style={{
                background:   "var(--card-2, rgba(255,255,255,0.03))",
                border:       "1px solid var(--border, rgba(255,255,255,0.08))",
                borderRadius: "var(--r-lg, 12px)",
                padding:      "1.25rem",
                display:      "flex",
                flexDirection:"column",
                alignItems:   "center",
                gap:          "0.5rem",
              }}>
                <div className="analysis-section-title" style={{ marginBottom: 0 }}>ATS Score</div>
                <div style={{ position: "relative", width: 128, height: 80 }}>
                  <svg viewBox="0 0 128 80" style={{ width: "100%", height: "100%", overflow: "visible" }}>
                    {/* Track */}
                    <path
                      d="M 14 74 A 54 54 0 0 1 114 74"
                      fill="none"
                      stroke="var(--border, rgba(255,255,255,0.08))"
                      strokeWidth="8"
                      strokeLinecap="round"
                    />
                    {/* Progress */}
                    <path
                      d="M 14 74 A 54 54 0 0 1 114 74"
                      fill="none"
                      stroke={scoreColor}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${circ * 0.695}`}
                      strokeDashoffset={`${circ * 0.695 * (1 - insights.ATSSCORE / 100)}`}
                      style={{ transition: "stroke-dashoffset 1s ease" }}
                    />
                  </svg>
                  <div style={{
                    position:  "absolute",
                    bottom:    2,
                    left:      "50%",
                    transform: "translateX(-50%)",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: "1.6rem", fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
                      {insights.ATSSCORE}
                    </div>
                    <div style={{ fontSize: "0.62rem", color: "var(--muted, #888)", fontFamily: "var(--ff-mono, monospace)" }}>
                      {atsLabel(insights.ATSSCORE)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Experience */}
              <div style={{
                background:    "var(--card-2, rgba(255,255,255,0.03))",
                border:        "1px solid var(--border, rgba(255,255,255,0.08))",
                borderRadius:  "var(--r-lg, 12px)",
                padding:       "1.25rem",
                display:       "flex",
                flexDirection: "column",
                gap:           "0.4rem",
              }}>
                <div className="analysis-section-title">Experience</div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text, #fff)", lineHeight: 1.3 }}>
                  {expLabel.split(" - ")[0]}
                </div>
                {expLabel.includes("-") && (
                  <div style={{ fontSize: "0.75rem", color: "var(--muted, #888)", fontFamily: "var(--ff-mono, monospace)" }}>
                    {expLabel.split(" - ")[1]}
                  </div>
                )}
                <div style={{ marginTop: "auto", display: "flex", gap: 4 }}>
                  {[0, 1, 2, 3, 4].map((lvl) => (
                    <div
                      key={lvl}
                      style={{
                        flex:         1,
                        height:       4,
                        borderRadius: 2,
                        background:   lvl <= insights.experienceLevel
                          ? "var(--accent, #00e5b0)"
                          : "var(--border, rgba(255,255,255,0.08))",
                        transition:   "background 0.3s ease",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Key Skills */}
            {insights.keySkills.length > 0 && (
              <>
                <div className="analysis-section-title">Key Skills</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.5rem" }}>
                  {insights.keySkills.map((s) => (
                    <span key={s} className="analysis-chip analysis-chip-accent">{s}</span>
                  ))}
                </div>
              </>
            )}

            {/* Strong Domains */}
            {insights.strongDomains.length > 0 && (
              <>
                <div className="analysis-section-title">Strong Domains</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.5rem" }}>
                  {insights.strongDomains.map((d) => (
                    <span key={d} className="analysis-chip analysis-chip-blue">{d}</span>
                  ))}
                </div>
              </>
            )}

            {/* Weak Areas */}
            {insights.weakAreas.length > 0 && (
              <>
                <div className="analysis-divider" />
                <div className="analysis-section-title" style={{ marginBottom: "0.75rem" }}>Areas to Improve</div>
                {insights.weakAreas.map((area, i) => (
                  <div key={i} className="analysis-weak-row">
                    <span style={{ color: "#f76a6a", fontSize: "0.75rem", marginTop: "0.1rem", flexShrink: 0 }}> </span>
                    <span style={{ fontSize: "0.82rem", color: "var(--text-2, rgba(255,255,255,0.7))", lineHeight: 1.55 }}>
                      {area}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding:      "1rem 1.5rem",
            borderTop:    "1px solid var(--border, rgba(255,255,255,0.08))",
            display:      "flex",
            justifyContent: "flex-end",
            flexShrink:   0,
          }}>
            <button
              onClick={onClose}
              className="resume-action-btn"
              style={{ minWidth: 100 }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}