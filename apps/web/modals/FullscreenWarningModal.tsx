'use client';
/**
 * ============================================================================
 * FullscreenWarningModal Component
 * ============================================================================
 * Warning when user exits fullscreen (allow 2 exits, terminate on 3rd).
 */

interface FullscreenWarningModalProps {
  count: number; // 1 or 2
  onReenter: () => void;
}

export function FullscreenWarningModal({
  count,
  onReenter,
}: FullscreenWarningModalProps) {
  const isTerminal = count >= 2;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
      }}
    >
      <style>{`
        @keyframes slideUpModal{from{opacity:0;transform:translateY(24px) scale(0.97);}to{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes pulseRed{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4);}50%{box-shadow:0 0 0 12px rgba(239,68,68,0);}}
        @keyframes pulseViolet{0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,0.4);}50%{box-shadow:0 0 0 12px rgba(139,92,246,0);}}
      `}</style>

      <div
        style={{
          background: "#0f0f13",
          border: `1.5px solid ${isTerminal ? "#ef4444" : "#8b5cf6"}`,
          borderRadius: "16px",
          padding: "36px 40px",
          maxWidth: "420px",
          width: "90%",
          animation: "slideUpModal 0.25s ease",
          boxShadow: isTerminal
            ? "0 0 40px rgba(239,68,68,0.25),0 24px 48px rgba(0,0,0,0.6)"
            : "0 0 40px rgba(139,92,246,0.2),0 24px 48px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: isTerminal
              ? "rgba(239,68,68,0.12)"
              : "rgba(139,92,246,0.12)",
            border: `1.5px solid ${
              isTerminal
                ? "rgba(239,68,68,0.4)"
                : "rgba(139,92,246,0.4)"
            }`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "20px",
            animation: isTerminal
              ? "pulseRed 1.5s ease infinite"
              : "pulseViolet 1.5s ease infinite",
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"
              stroke={isTerminal ? "#ef4444" : "#8b5cf6"}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2
          style={{
            margin: "0 0 10px",
            fontSize: "18px",
            fontWeight: 700,
            color: isTerminal ? "#ef4444" : "#a78bfa",
          }}
        >
          {isTerminal ? "Interview Terminated" : "Fullscreen Exited"}
        </h2>

        <p
          style={{
            margin: "0 0 24px",
            fontSize: "14px",
            lineHeight: "1.65",
            color: "#9ca3af",
          }}
        >
          {isTerminal ? (
            <>
              <strong style={{ color: "#f3f4f6" }}>
                You exited fullscreen twice.
              </strong>{" "}
              This interview has been{" "}
              <strong style={{ color: "#ef4444" }}>automatically ended</strong>.
            </>
          ) : (
            <>
              You exited fullscreen mode.{" "}
              <strong style={{ color: "#f3f4f6" }}>
                Warning {count} of 2.
              </strong>{" "}
              Exiting again will{" "}
              <strong style={{ color: "#a78bfa" }}>end</strong> your interview.
            </>
          )}
        </p>

        <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
          {[1, 2].map((n) => (
            <div
              key={n}
              style={{
                flex: 1,
                height: "6px",
                borderRadius: "99px",
                background:
                  n <= count
                    ? isTerminal
                      ? "#ef4444"
                      : "#8b5cf6"
                    : "rgba(255,255,255,0.08)",
                transition: "background 0.3s ease",
              }}
            />
          ))}
        </div>

        <button
          onClick={onReenter}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "10px",
            background: isTerminal ? "#ef4444" : "linear-gradient(135deg,#7c3aed,#8b5cf6)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
        >
          {isTerminal ? "View Results" : "Re-enter Fullscreen"}
        </button>
      </div>
    </div>
  );
}
