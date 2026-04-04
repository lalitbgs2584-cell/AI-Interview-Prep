'use client';
/**
 * ============================================================================
 * TabSwitchWarningModal Component
 * ============================================================================
 * Warning when user switches tabs (allow 2 switches, terminate on 3rd).
 */

interface TabSwitchWarningModalProps {
  count: number; // 1 or 2
  onDismiss: () => void;
}

export function TabSwitchWarningModal({
  count,
  onDismiss,
}: TabSwitchWarningModalProps) {
  const isTerminal = count >= 2;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
      }}
    >
      <style>{`
        @keyframes slideUpModal{from{opacity:0;transform:translateY(24px) scale(0.97);}to{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes pulseRed{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4);}50%{box-shadow:0 0 0 12px rgba(239,68,68,0);}}
      `}</style>

      <div
        style={{
          background: "#0f0f13",
          border: `1.5px solid ${isTerminal ? "#ef4444" : "#f59e0b"}`,
          borderRadius: "16px",
          padding: "36px 40px",
          maxWidth: "420px",
          width: "90%",
          animation: "slideUpModal 0.25s ease",
          boxShadow: isTerminal
            ? "0 0 40px rgba(239,68,68,0.25),0 24px 48px rgba(0,0,0,0.6)"
            : "0 0 40px rgba(245,158,11,0.2),0 24px 48px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: isTerminal
              ? "rgba(239,68,68,0.12)"
              : "rgba(245,158,11,0.12)",
            border: `1.5px solid ${
              isTerminal
                ? "rgba(239,68,68,0.4)"
                : "rgba(245,158,11,0.4)"
            }`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "20px",
            animation: isTerminal
              ? "pulseRed 1.5s ease infinite"
              : "none",
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 00-3.42 0z"
              stroke={isTerminal ? "#ef4444" : "#f59e0b"}
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
            color: isTerminal ? "#ef4444" : "#f59e0b",
          }}
        >
          {isTerminal ? "Interview Terminated" : "Tab Switch Detected"}
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
                You switched tabs 2 times.
              </strong>{" "}
              This interview has been{" "}
              <strong style={{ color: "#ef4444" }}>automatically ended</strong>.
            </>
          ) : (
            <>
              You switched away.{" "}
              <strong style={{ color: "#f3f4f6" }}>
                Warning {count} of 2.
              </strong>{" "}
              Switching again will{" "}
              <strong style={{ color: "#f59e0b" }}>end</strong> your interview.
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
                      : "#f59e0b"
                    : "rgba(255,255,255,0.08)",
                transition: "background 0.3s ease",
              }}
            />
          ))}
        </div>

        <button
          onClick={onDismiss}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "10px",
            background: isTerminal
              ? "#ef4444"
              : "rgba(245,158,11,0.12)",
            color: isTerminal ? "#fff" : "#f59e0b",
            fontSize: "14px",
            fontWeight: 600,
            border: isTerminal ? "none" : "1px solid rgba(245,158,11,0.3)",
            cursor: "pointer",
          }}
        >
          {isTerminal
            ? "View Results"
            : "I Understand - Resume Interview"}
        </button>
      </div>
    </div>
  );
}
