"use client";
/**
 * ============================================================================
 * FaceViolationModal Component
 * ============================================================================
 *
 * Warning when face not detected or multiple faces detected.
 * Matches the same 2-warning pattern as TabSwitchWarningModal:
 *  - Warning 1: show countdown, let user fix it
 *  - Warning 2: terminal state, end interview
 */

interface FaceViolationModalProps {
  status: "no-face" | "multiple";
  countdown: number;      // 15 to 0
  violationCount: number; // 1 or 2
  onDismiss: () => void;
}

export function FaceViolationModal({
  status,
  countdown,
  violationCount,
  onDismiss,
}: FaceViolationModalProps) {
  const isMultiple  = status === "multiple";
  const isTerminal  = violationCount >= 2;
  const pct         = (countdown / 15) * 100;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(8px)",
      }}
    >
      <style>{`
        @keyframes faceModalIn {
          from { opacity: 0; transform: scale(0.95) translateY(16px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    }
        }
        @keyframes pulseRing {
          0%,100% { box-shadow: 0 0 0 0   rgba(239,68,68,0.5); }
          50%      { box-shadow: 0 0 0 14px rgba(239,68,68,0);   }
        }
      `}</style>

      <div
        style={{
          background:    "#0f0f13",
          border:        "1.5px solid #ef4444",
          borderRadius:  "20px",
          padding:       "40px",
          maxWidth:      "440px",
          width:         "90%",
          animation:     "faceModalIn 0.3s ease",
          boxShadow:     "0 0 60px rgba(239,68,68,0.2), 0 32px 64px rgba(0,0,0,0.7)",
        }}
      >
        {/* "" Icon "" */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          <div
            style={{
              width:         "72px",
              height:        "72px",
              borderRadius:  "50%",
              background:    "rgba(239,68,68,0.1)",
              border:        "2px solid rgba(239,68,68,0.4)",
              display:       "flex",
              alignItems:    "center",
              justifyContent:"center",
              animation:     "pulseRing 1.5s ease infinite",
            }}
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              {isMultiple ? (
                <>
                  <circle cx="9"  cy="7" r="3" stroke="#ef4444" strokeWidth="1.8" />
                  <circle cx="15" cy="7" r="3" stroke="#ef4444" strokeWidth="1.8" />
                  <path
                    d="M3 20c0-3.3 2.7-6 6-6h6c3.3 0 6 2.7 6 6"
                    stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"
                  />
                  <path
                    d="M2 3l20 18"
                    stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"
                  />
                </>
              ) : (
                <>
                  <circle
                    cx="12" cy="8" r="4"
                    stroke="#ef4444" strokeWidth="1.8" strokeDasharray="4 2"
                  />
                  <path
                    d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
                    stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"
                  />
                </>
              )}
            </svg>
          </div>
        </div>

        {/* "" Title "" */}
        <h2
          style={{
            textAlign:  "center",
            margin:     "0 0 8px",
            fontSize:   "20px",
            fontWeight: 700,
            color:      "#ef4444",
          }}
        >
          {isTerminal
            ? "Interview Terminated"
            : isMultiple
              ? "Multiple People Detected"
              : "No Face Detected"}
        </h2>

        {/* "" Body "" */}
        <p
          style={{
            textAlign:  "center",
            margin:     "0 0 24px",
            fontSize:   "14px",
            lineHeight: "1.7",
            color:      "#9ca3af",
          }}
        >
          {isTerminal ? (
            <>
              <strong style={{ color: "#f3f4f6" }}>
                Face violation detected twice.
              </strong>{" "}
              This interview has been{" "}
              <strong style={{ color: "#ef4444" }}>automatically ended</strong>.
            </>
          ) : (
            <>
              {isMultiple
                ? "Only you should be visible. Please ask others to move away or reposition your camera."
                : "Your face is not visible. Please move into the camera frame."}{" "}
              <strong style={{ color: "#f3f4f6" }}>
                Warning {violationCount} of 2.
              </strong>
            </>
          )}
        </p>

        {/* "" Progress bars " same pattern as TabSwitchWarningModal "" */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {[1, 2].map((n) => (
            <div
              key={n}
              style={{
                flex:         1,
                height:       "6px",
                borderRadius: "99px",
                background:
                  n <= violationCount
                    ? "#ef4444"
                    : "rgba(255,255,255,0.08)",
                transition: "background 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* "" Countdown " only on first violation "" */}
        {!isTerminal && (
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                display:        "flex",
                justifyContent: "space-between",
                alignItems:     "center",
                marginBottom:   "8px",
              }}
            >
              <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}>
                Interview ends in
              </span>
              <span
                style={{
                  fontSize:           "20px",
                  fontWeight:         700,
                  color:              countdown <= 5 ? "#ef4444" : "#f59e0b",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {countdown}s
              </span>
            </div>
            <div
              style={{
                height:       "6px",
                background:   "rgba(255,255,255,0.06)",
                borderRadius: "99px",
                overflow:     "hidden",
              }}
            >
              <div
                style={{
                  height:     "100%",
                  width:      `${pct}%`,
                  background: countdown <= 5 ? "#ef4444" : "#f59e0b",
                  borderRadius: "99px",
                  transition: "width 1s linear, background 0.3s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* "" Button "" */}
        <button
          onClick={onDismiss}
          style={{
            width:        "100%",
            padding:      "13px",
            borderRadius: "12px",
            background:   isTerminal
              ? "#ef4444"
              : "rgba(239,68,68,0.1)",
            color:        isTerminal ? "#fff" : "#ef4444",
            fontSize:     "14px",
            fontWeight:   600,
            border:       isTerminal ? "none" : "1px solid rgba(239,68,68,0.3)",
            cursor:       "pointer",
          }}
        >
          {isTerminal ? "View Results" : "I Fixed It - Check Again"}
        </button>
      </div>
    </div>
  );
}
