"use client";
/**
 * ============================================================================
 * FullscreenGate Component
 * ============================================================================
 * Initial prompt asking user to enter fullscreen mode.
 */

interface FullscreenGateProps {
  onEnter: () => void;
}

export function FullscreenGate({ onEnter }: FullscreenGateProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#09090d",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(139,92,246,0.1)",
            border: "1.5px solid rgba(139,92,246,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
              d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"
              stroke="#8b5cf6"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2
          style={{
            margin: "0 0 8px",
            fontSize: 18,
            fontWeight: 700,
            color: "#f3f4f6",
          }}
        >
          Ready to begin?
        </h2>
        <p
          style={{
            margin: "0 0 28px",
            fontSize: 13,
            color: "#6b7280",
            lineHeight: 1.6,
          }}
        >
          The interview runs in fullscreen. Click below to enter fullscreen and
          start.
        </p>
        <button
          onClick={onEnter}
          style={{
            width: "100%",
            padding: "13px",
            borderRadius: 10,
            background: "linear-gradient(135deg,#7c3aed,#8b5cf6)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
        >
          Enter Fullscreen & Start Interview
        </button>
      </div>
    </div>
  );
}

