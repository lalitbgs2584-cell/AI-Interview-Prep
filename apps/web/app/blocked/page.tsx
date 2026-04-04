"use client";

import { useState, useEffect } from "react";
import { blockedStyles as s,globalStyles} from "./style";


export default function BlockedPage() {
  const [mounted, setMounted] = useState(false);
  const [pulseScale, setPulseScale] = useState(1);
  const [primaryHovered, setPrimaryHovered] = useState(false);
  const [secondaryHovered, setSecondaryHovered] = useState(false);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setPulseScale((prev) => (prev === 1 ? 1.08 : 1));
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <style>{globalStyles}</style>

      <div style={s.root}>
        <div
          className={mounted ? "blocked-card-enter" : ""}
          style={s.card}
        >
          {/* Top shimmer line */}
          <div style={s.cardTopLine} />

          {/* Background glow */}
          <div style={s.glowBehind} />

          {/* Lock icon */}
          <div style={s.iconWrap(pulseScale)}>
            <svg
              style={s.lockSvg}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          {/* Status tag */}
          <div style={s.tagCenter}>
            <span style={s.tag}>
              <span style={s.dot} />
              Account Suspended
            </span>
          </div>

          {/* Heading */}
          <h1 style={s.title}>Your account has been blocked</h1>

          {/* Description */}
          <p style={s.desc}>
            An administrator has restricted access to your account. You are
            unable to sign in or access any resources until this action is
            reviewed.
          </p>

          <div style={s.divider} />

          {/* Meta grid */}
          <div style={s.metaGrid}>
            <div style={s.metaItem}>
              <div style={s.metaLabel}>Status</div>
              <div style={s.metaValueRed}>Blocked</div>
            </div>

            <div style={s.metaItem}>
              <div style={s.metaLabel}>Blocked by</div>
              <div style={s.metaValue}>Administrator</div>
            </div>

            <div style={s.metaItem}>
              <div style={s.metaLabel}>Access level</div>
              <div style={s.metaValueMuted}>None</div>
            </div>

            <div style={s.metaItem}>
              <div style={s.metaLabel}>Error code</div>
              <div style={s.metaValueMono}>403-BLOCKED</div>
            </div>
          </div>

          {/* Primary CTA */}
          <a
            href="mailto:support@yourapp.com"
            style={{
              ...s.btnPrimary,
              ...(primaryHovered ? s.btnPrimaryHover : {}),
            }}
            onMouseEnter={() => setPrimaryHovered(true)}
            onMouseLeave={() => setPrimaryHovered(false)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Contact Support
          </a>

          {/* Secondary CTA */}
          <a
            href="/login"
            style={{
              ...s.btnSecondary,
              ...(secondaryHovered ? s.btnSecondaryHover : {}),
            }}
            onMouseEnter={() => setSecondaryHovered(true)}
            onMouseLeave={() => setSecondaryHovered(false)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Login
          </a>

          {/* Footer note */}
          <div style={s.footer}>
            <span style={s.footerCode}>ERR_ACCOUNT_BLOCKED</span>
            {" - "}
            If you believe this is an error, please reach out to your
            administrator.
          </div>
        </div>
      </div>
    </>
  );
}