/**
 * ============================================================================
 * InterviewTopbar Component
 * ============================================================================
 * 
 * Displays the top bar of the interview with:
 *  - Logo and session info on left
 *  - Timer and LIVE indicator in center
 *  - Status badges and controls on right
 * 
 * Props are passed from parent (page.tsx).
 * Minimal state - mostly presentation logic.
 * 
 * ============================================================================
 */

"use client";

import { useTimer } from "@/hooks/useTimer";
import Link from "next/link";

interface InterviewTopbarProps {
  interviewType?: string | null;
  interviewTitle?: string | null;
  isFullscreen: boolean;
  aiSpeaking: boolean;
  fsWarningCount: number;
  tabSwitchCount: number;
  faceStatus: string;
  modelsReady: boolean;
  faceCount: number;
  isEnding: boolean;
  onToggleFullscreen: () => void;
  onEndSession: () => void;
}

export default function InterviewTopbar({
  interviewType,
  interviewTitle,
  isFullscreen,
  aiSpeaking,
  fsWarningCount,
  tabSwitchCount,
  faceStatus,
  modelsReady,
  faceCount,
  isEnding,
  onToggleFullscreen,
  onEndSession,
}: InterviewTopbarProps) {
  const { display: timerDisplay } = useTimer(true); // Pass running state from parent
  const typeLabel = interviewType
    ? interviewType
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "Interview";
  const titleLabel = interviewTitle?.trim() || "Session";

  return (
    <header className="interview-topbar">
      {/* LEFT: Logo + Session Info */}
      <div className="topbar-left">
        <Link href="/dashboard" className="topbar-logo">
          Interview<span>AI</span>
        </Link>
        <div className="topbar-divider" />
        <div className="topbar-session-info">
          <span className="tag tag-accent">{typeLabel}</span>
          <span className="topbar-title">{titleLabel}</span>
        </div>
      </div>

      {/* CENTER: Timer + Live Chip */}
      <div className="topbar-center">
        <div className={`live-chip${aiSpeaking ? " ai-pulse" : ""}`}>
          <span className="dot-live" />
          LIVE
        </div>
        <div className="timer-block">
          <span className="timer">{timerDisplay}</span>
        </div>
      </div>

      {/* RIGHT: Status Badges + Controls */}
      <div className="topbar-right">
        {/* Fullscreen toggle button */}
        <button
          onClick={onToggleFullscreen}
          className="topbar-btn"
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          style={{
            background: isFullscreen
              ? "rgba(139,92,246,0.12)"
              : "rgba(255,255,255,0.06)",
            color: isFullscreen ? "#a78bfa" : "#6b7280",
          }}
        >
          {isFullscreen ? "Exit FS" : "Fullscreen"}
        </button>

        {/* Fullscreen exit counter */}
        {fsWarningCount > 0 && !isEnding && (
          <div className="status-badge" style={{ color: "#a78bfa" }}>
            FS exits: {fsWarningCount}/2
          </div>
        )}

        {/* Tab switch counter */}
        {tabSwitchCount > 0 && (
          <div className="status-badge" style={{ color: "#f59e0b" }}>
            Tab switches: {tabSwitchCount}/2
          </div>
        )}

        {/* Face detection indicator */}
        {modelsReady && faceStatus !== "ok" && (
          <div className="status-badge" style={{ color: "#ef4444" }}>
            {faceStatus === "multiple" ? `${faceCount} faces` : "No face"}
          </div>
        )}

        {/* End session button */}
        <button
          className="btn-end-session"
          onClick={onEndSession}
          disabled={isEnding}
        >
          {isEnding ? "Ending" : "End Session"}
        </button>
      </div>
    </header>
  );
}
