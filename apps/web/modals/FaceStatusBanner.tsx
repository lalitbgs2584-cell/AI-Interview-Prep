/**
 * ============================================================================
 * MODAL COMPONENTS
 * ============================================================================
 * 
 * All dialog/modal components for the interview page.
 * These are isolated, presentational-only components.
 * 
 * Includes:
 *  - FullscreenGate - Initial fullscreen prompt
 *  - FullscreenWarningModal - Exit warning
 *  - TabSwitchWarningModal - Tab switch warning
 *  - FaceViolationModal - Face detection warning
 *  - IdentityMismatchModal - Identity mismatch warning
 *  - FaceStatusBanner - Real-time status banner
 * 
 * ============================================================================
 */

"use client";


/**
 * ============================================================================
 * FaceStatusBanner Component
 * ============================================================================
 * Real-time face status indicator (shown at top of video when face issues).
 */

interface FaceStatusBannerProps {
  status: "no-face" | "multiple";
}

export function FaceStatusBanner({ status }: FaceStatusBannerProps) {
  const isMultiple = status === "multiple";

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "7px 12px",
        background: isMultiple
          ? "rgba(239,68,68,0.9)"
          : "rgba(245,158,11,0.9)",
        backdropFilter: "blur(6px)",
        fontSize: "11px",
        fontWeight: 600,
        color: "#fff",
        borderTopLeftRadius: "inherit",
        borderTopRightRadius: "inherit",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        {isMultiple ? (
          <path
            d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 11a4 4 0 100-8 4 4 0 000 8z"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {isMultiple
        ? "Multiple people visible — adjust camera"
        : "No face detected — please stay in frame"}
    </div>
  );
}