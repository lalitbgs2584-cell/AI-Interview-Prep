/**
 * ============================================================================
 * VideoArea Component
 * ============================================================================
 * 
 * Displays:
 *  - AI video/avatar card (left)
 *  - User video/camera card (right)
 *  - Control buttons (mic, camera, end)
 *  - Animated wave bars for audio state
 * 
 * This is a large component but mostly presentation logic.
 * All state is managed by parent (page.tsx).
 * 
 * ============================================================================
 */

"use client";

import React from "react";
import WaveBars from "./utilityComponents";
import { FaceStatusBanner } from "@/modals/FaceStatusBanner";

interface VideoAreaProps {
  userVideoRef: React.RefObject<HTMLVideoElement>;
  aiAudioRef: React.RefObject<HTMLAudioElement>;
  camOn: boolean;
  micOn: boolean;
  aiSpeaking: boolean;
  isListening: boolean;
  camPermission: boolean;
  micPermission: boolean;
  faceStatus: string;
  modelsReady: boolean;
  showFaceBanner: boolean;
  onMicToggle: () => void;
  onCamToggle: () => void;
  onEndSession: () => void;
  isEnding: boolean;
}

export default function VideoArea({
  userVideoRef,
  aiAudioRef,
  camOn,
  micOn,
  aiSpeaking,
  isListening,
  camPermission,
  micPermission,
  faceStatus,
  modelsReady,
  showFaceBanner,
  onMicToggle,
  onCamToggle,
  onEndSession,
  isEnding,
}: VideoAreaProps) {
  return (
    <div className="video-area">
      {/* ── AI VIDEO CARD ───────────────────────────────────────────── */}
      <div className={`vid-card vid-ai${aiSpeaking ? " speaking" : ""}`}>
        <div className="vid-inner">
          <div className="vid-placeholder vid-placeholder-ai">
            {/* AI Avatar Ring */}
            <div className="vid-avatar-ring">
              <div className="vid-avatar">
                <audio ref={aiAudioRef} />
              </div>
            </div>

            {/* Animated Circuit Lines */}
            <div className="vid-circuit">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="circuit-line"
                  style={{ animationDelay: `${i * 0.4}s` }}
                />
              ))}
            </div>
          </div>

          {/* Speaking Indicator */}
          <div className="vid-speaking-bar">
            <WaveBars active={aiSpeaking} />
            <span className="vid-speaking-label">
              {aiSpeaking ? "AI is speaking…" : "Listening"}
            </span>
          </div>
        </div>

        {/* Nametag */}
        <div className="vid-nametag">
          <span className="dot-accent-static" />
          <span className="vid-name">Interviewer</span>
        </div>
      </div>

      {/* ── USER VIDEO CARD ────────────────────────────────────────── */}
      <div
        className={`vid-card vid-user${!camOn ? " cam-off" : ""}`}
        style={{ position: "relative" }}
      >
        {/* Face Status Banner (when face not detected) */}
        {showFaceBanner && (
          <FaceStatusBanner status={faceStatus as "no-face" | "multiple"} />
        )}

        <div className="vid-inner">
          {camOn && micPermission ? (
            <div className="vid-placeholder vid-placeholder-user">
              {/* User Camera Feed */}
              <div className="vid-avatar-user">
                <video ref={userVideoRef} autoPlay muted playsInline />
              </div>

              {/* Bokeh Background Effects */}
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="bokeh"
                  style={{
                    left: `${10 + i * 11}%`,
                    top: `${20 + (i % 3) * 25}%`,
                    animationDelay: `${i * 0.3}s`,
                    zIndex: 0,
                  }}
                />
              ))}
            </div>
          ) : (
            /* Camera Off State */
            <div className="cam-off-state h-full! flex! items-center justify-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M3 3l18 18M10.5 10.5A2 2 0 0113.5 13.5M9 5h7l2 2h3v12H9m-5-5V7h2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <span>Camera off</span>
            </div>
          )}
        </div>

        {/* Nametag */}
        <div className="vid-nametag">
          <span className="dot-accent-static dot-user" />
          <span className="vid-name"></span>
          <span className="tag tag-sky">You</span>

          {/* Listening Indicator */}
          {isListening && micOn && !aiSpeaking && (
            <span
              style={{
                marginLeft: "6px",
                fontSize: "10px",
                color: "#22c55e",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#22c55e",
                  animation: "pulse 1s ease infinite",
                  display: "inline-block",
                }}
              />
              Listening
            </span>
          )}
        </div>
      </div>

      {/* ── CONTROL BUTTONS ────────────────────────────────────────── */}
      <div className="controls-bar">
        {/* Mic Toggle */}
        <button className={`ctrl-btn${!micOn ? " ctrl-off" : ""}`} onClick={onMicToggle}>
          {micOn ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5 10a7 7 0 0114 0M12 19v3M9 22h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 3l18 18M9 9v5a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.94-.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M17 16.95A7 7 0 015 10M12 19v3M9 22h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
          <span>{micOn ? "Mute" : "Unmute"}</span>
        </button>

        {/* Camera Toggle */}
        <button className={`ctrl-btn${!camOn ? " ctrl-off" : ""}`} onClick={onCamToggle}>
          {camOn ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 3l18 18M10.5 8.5H13a2 2 0 012 2v.5m1 4.47V16a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h.5M15 10l4.553-2.276A1 1 0 0121 8.723v6.554" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
          <span>{camOn ? "Camera" : "No cam"}</span>
        </button>

        {/* End Session Button */}
        <button
          className="ctrl-btn ctrl-btn-end"
          onClick={onEndSession}
          disabled={isEnding}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M6.827 6.175A8 8 0 0117.173 17.173M12 6v6l4 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M3.05 11a9 9 0 1017.9 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span>End</span>
        </button>
      </div>
    </div>
  );
}