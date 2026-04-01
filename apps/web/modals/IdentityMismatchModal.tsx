'use client';
/**
 * ============================================================================
 * IdentityMismatchModal Component
 * ============================================================================
 * Warning when different person detected (allow 1 mismatch, terminate on 2nd).
 */

interface IdentityMismatchModalProps {
  mismatchCount: number; // 1 or 2
  countdown: number; // 20 to 0
  onDismiss: () => void;
}

export function IdentityMismatchModal({
  mismatchCount,
  countdown,
  onDismiss,
}: IdentityMismatchModalProps) {
  const isTerminal = mismatchCount >= 2;
  const pct = (countdown / 20) * 100;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9997,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(10px)",
      }}
    >
      <style>{`
        @keyframes idModalIn{from{opacity:0;transform:scale(0.94) translateY(20px);}to{opacity:1;transform:scale(1) translateY(0);}}
        @keyframes scanLine{0%{top:0;}100%{top:100%;}}
        @keyframes idPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.5);}50%{box-shadow:0 0 0 16px rgba(239,68,68,0);}}
      `}</style>

      <div
        style={{
          background: "#0c0c10",
          border: `1.5px solid ${isTerminal ? "#ef4444" : "#f97316"}`,
          borderRadius: "20px",
          padding: "40px",
          maxWidth: "460px",
          width: "90%",
          animation: "idModalIn 0.3s ease",
          boxShadow: isTerminal
            ? "0 0 80px rgba(239,68,68,0.25),0 32px 64px rgba(0,0,0,0.8)"
            : "0 0 80px rgba(249,115,22,0.2),0 32px 64px rgba(0,0,0,0.8)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Scan line effect */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: "2px",
            background: `linear-gradient(90deg,transparent,${
              isTerminal ? "rgba(239,68,68,0.4)" : "rgba(249,115,22,0.4)"
            },transparent)`,
            animation: "scanLine 2s linear infinite",
            pointerEvents: "none",
          }}
        />

        {/* Icon */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          <div
            style={{
              width: "76px",
              height: "76px",
              borderRadius: "50%",
              background: isTerminal
                ? "rgba(239,68,68,0.1)"
                : "rgba(249,115,22,0.1)",
              border: `2px solid ${
                isTerminal
                  ? "rgba(239,68,68,0.5)"
                  : "rgba(249,115,22,0.5)"
              }`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "idPulse 1.8s ease infinite",
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="8"
                r="4"
                stroke={isTerminal ? "#ef4444" : "#f97316"}
                strokeWidth="1.8"
              />
              <path
                d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
                stroke={isTerminal ? "#ef4444" : "#f97316"}
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              {/* X overlay */}
              <path
                d="M18 2l4 4M22 2l-4 4"
                stroke={isTerminal ? "#ef4444" : "#f97316"}
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        <h2
          style={{
            textAlign: "center",
            margin: "0 0 10px",
            fontSize: "20px",
            fontWeight: 700,
            color: isTerminal ? "#ef4444" : "#f97316",
          }}
        >
          {isTerminal
            ? "Identity Violation — Session Terminated"
            : "Different Person Detected"}
        </h2>

        <p
          style={{
            textAlign: "center",
            margin: "0 0 24px",
            fontSize: "14px",
            lineHeight: "1.7",
            color: "#9ca3af",
          }}
        >
          {isTerminal ? (
            <>
              Our system detected a different person{" "}
              <strong style={{ color: "#f3f4f6" }}>twice</strong>. This session
              has been{" "}
              <strong style={{ color: "#ef4444" }}>
                automatically terminated
              </strong>{" "}
              and flagged.
            </>
          ) : (
            <>
              The face in frame does not match the enrolled candidate.{" "}
              <strong style={{ color: "#f3f4f6" }}>
                Warning {mismatchCount} of 2.
              </strong>{" "}
              A second violation will end your interview.
            </>
          )}
        </p>

        {/* Warning progress */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {[1, 2].map((n) => (
            <div
              key={n}
              style={{
                flex: 1,
                height: "6px",
                borderRadius: "99px",
                background:
                  n <= mismatchCount
                    ? isTerminal
                      ? "#ef4444"
                      : "#f97316"
                    : "rgba(255,255,255,0.08)",
                transition: "background 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* Countdown only on first warning */}
        {!isTerminal && (
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  fontWeight: 500,
                }}
              >
                Interview ends if unresolved in
              </span>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: countdown <= 8 ? "#ef4444" : "#f97316",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {countdown}s
              </span>
            </div>
            <div
              style={{
                height: "6px",
                background: "rgba(255,255,255,0.06)",
                borderRadius: "99px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: countdown <= 8 ? "#ef4444" : "#f97316",
                  borderRadius: "99px",
                  transition: "width 1s linear, background 0.3s ease",
                }}
              />
            </div>
          </div>
        )}

        <button
          onClick={onDismiss}
          style={{
            width: "100%",
            padding: "13px",
            borderRadius: "12px",
            background: isTerminal
              ? "#ef4444"
              : "rgba(249,115,22,0.1)",
            color: isTerminal ? "#fff" : "#f97316",
            fontSize: "14px",
            fontWeight: 600,
            border: isTerminal ? "none" : "1px solid rgba(249,115,22,0.35)",
            cursor: "pointer",
          }}
        >
          {isTerminal ? "View Results" : "It's Me — Verify Again"}
        </button>
      </div>
    </div>
  );
}