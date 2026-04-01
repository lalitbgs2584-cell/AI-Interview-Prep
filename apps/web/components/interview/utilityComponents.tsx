/**
 * ============================================================================
 * UTILITY COMPONENTS
 * ============================================================================
 * 
 * Small, reusable components that don't warrant their own files.
 * These are presentational only - no logic.
 * 
 * ============================================================================
 */

"use client";

/**
 * WaveBars Component
 * Animated wave bars that pulse when audio is active.
 */
interface WaveBarsProps {
  active: boolean;
}

export function WaveBars({ active }: WaveBarsProps) {
  return (
    <div className={`wave-bars${active ? " wave-active" : ""}`}>
      {[...Array(5)].map((_, i) => (
        <span
          key={i}
          className="wave-bar"
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}

/**
 * InterruptionBadge Component
 * Shows count of times user interrupted AI speech.
 */
interface InterruptionBadgeProps {
  count: number;
}

export function InterruptionBadge({ count }: InterruptionBadgeProps) {
  if (count === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        borderRadius: "99px",
        background: "rgba(251,146,60,0.1)",
        border: "1px solid rgba(251,146,60,0.3)",
        fontSize: "12px",
        color: "#fb923c",
        fontWeight: 600,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path
          d="M9 18V5l12-2v13M9 18a3 3 0 01-3 3 3 3 0 01-3-3 3 3 0 013-3 3 3 0 013 3zM21 16a3 3 0 01-3 3 3 3 0 01-3-3 3 3 0 013-3 3 3 0 013 3z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Interruptions: {count}
    </div>
  );
}

/**
 * IdentityBadge Component
 * Shows identity verification status.
 */
interface IdentityBadgeProps {
  status: string;
  mismatchCount: number;
}

export function IdentityBadge({ status, mismatchCount }: IdentityBadgeProps) {
  if (status === "idle" || status === "enrolling") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          borderRadius: "99px",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          fontSize: "12px",
          color: "#6b7280",
          fontWeight: 600,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#6b7280",
            display: "inline-block",
          }}
        />
        {status === "enrolling" ? "Enrolling…" : "ID pending"}
      </div>
    );
  }

  if (status === "enrolled") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          borderRadius: "99px",
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.25)",
          fontSize: "12px",
          color: "#22c55e",
          fontWeight: 600,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path
            d="M20 6L9 17l-5-5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Identity verified
      </div>
    );
  }

  if (status === "mismatch") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          borderRadius: "99px",
          background: "rgba(249,115,22,0.1)",
          border: "1px solid rgba(249,115,22,0.35)",
          fontSize: "12px",
          color: "#f97316",
          fontWeight: 600,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
          <path
            d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        ID mismatch ×{mismatchCount}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          borderRadius: "99px",
          background: "rgba(107,114,128,0.08)",
          border: "1px solid rgba(107,114,128,0.2)",
          fontSize: "12px",
          color: "#6b7280",
          fontWeight: 600,
        }}
      >
        ID unavailable
      </div>
    );
  }

  return null;
}

export default WaveBars;