"use client";

import React from "react";
import { FaceStatusBanner } from "@/modals/FaceStatusBanner";
import WaveBars from "./utilityComponents";

interface ZoomVideoAreaProps {
  userVideoRef: React.RefObject<HTMLVideoElement>;
  screenVideoRef: React.RefObject<HTMLVideoElement>;
  aiAudioRef: React.RefObject<HTMLAudioElement>;
  camOn: boolean;
  micOn: boolean;
  aiSpeaking: boolean;
  isListening: boolean;
  isScreenSharing: boolean;
  isScreenSharePending: boolean;
  isChatCollapsed: boolean;
  camPermission: boolean;
  faceStatus: string;
  showFaceBanner: boolean;
  onMicToggle: () => void;
  onCamToggle: () => void;
  onToggleScreenShare: () => void;
  onToggleChatPanel: () => void;
  onEndSession: () => void;
  isEnding: boolean;
}

export default function ZoomVideoArea({
  userVideoRef,
  screenVideoRef,
  aiAudioRef,
  camOn,
  micOn,
  aiSpeaking,
  isListening,
  isScreenSharing,
  isScreenSharePending,
  isChatCollapsed,
  camPermission,
  faceStatus,
  showFaceBanner,
  onMicToggle,
  onCamToggle,
  onToggleScreenShare,
  onToggleChatPanel,
  onEndSession,
  isEnding,
}: ZoomVideoAreaProps) {
  const renderAiCard = (thumbnail = false) => (
    <div
      className={`vid-card vid-ai${aiSpeaking ? " speaking" : ""}${thumbnail ? " vid-thumbnail" : ""}`}
    >
      <div className="vid-inner">
        <div className="vid-placeholder vid-placeholder-ai">
          <div className="vid-avatar-ring">
            <div className="vid-avatar">
              <audio ref={aiAudioRef} />
            </div>
          </div>

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

        <div className="vid-speaking-bar">
          <WaveBars active={aiSpeaking} />
          <span className="vid-speaking-label">
            {aiSpeaking ? "AI is speaking..." : "Listening"}
          </span>
        </div>
      </div>

      <div className="vid-nametag">
        <span className="dot-accent-static" />
        <span className="vid-name">Interviewer</span>
      </div>
    </div>
  );

  const renderUserCard = (thumbnail = false) => (
    <div
      className={`vid-card vid-user${!camOn ? " cam-off" : ""}${thumbnail ? " vid-thumbnail" : ""}`}
      style={{ position: "relative" }}
    >
      {showFaceBanner && !thumbnail && (
        <FaceStatusBanner status={faceStatus as "no-face" | "multiple"} />
      )}

      <div className="vid-inner">
        {camOn && camPermission ? (
          <div className="vid-placeholder vid-placeholder-user">
            <div className="vid-avatar-user">
              <video ref={userVideoRef} autoPlay muted playsInline />
            </div>

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

      <div className="vid-nametag">
        <span className="dot-accent-static dot-user" />
        <span className="vid-name" />
        <span className="tag tag-sky">You</span>

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
  );

  return (
    <div className={`video-area${isScreenSharing ? " video-area-sharing" : ""}`}>
      {isScreenSharing ? (
        <div className="screen-stage">
          <div className="screen-stage-inner">
            <video
              ref={screenVideoRef}
              autoPlay
              muted
              playsInline
              className="screen-stage-video"
            />
            <div className="screen-stage-overlay">
              <div className="screen-stage-chip">
                <span className="dot-accent-static" />
                <span>Screen share live</span>
              </div>
              <div className="screen-stage-tip">
                Shared content stays center stage while participant videos move into the mini dock.
              </div>
            </div>
          </div>

          <div className="video-dock">
            {renderAiCard(true)}
            {renderUserCard(true)}
          </div>
        </div>
      ) : (
        <>
          {renderAiCard()}
          {renderUserCard()}
        </>
      )}

      <div className="controls-bar">
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

        <button
          className={`ctrl-btn${isScreenSharing ? "" : " ctrl-btn-ghost"}`}
          onClick={onToggleScreenShare}
          disabled={isScreenSharePending || isEnding}
        >
          {isScreenSharing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v7A2.5 2.5 0 0117.5 16h-4.75L9 20v-4H6.5A2.5 2.5 0 014 13.5v-7z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8 8l8 8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect
                x="3"
                y="5"
                width="18"
                height="12"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M8 20h8M12 17v3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          )}
          <span>
            {isScreenSharePending ? "Starting..." : isScreenSharing ? "Stop share" : "Share screen"}
          </span>
        </button>

        <button
          className={`ctrl-btn${isChatCollapsed ? " ctrl-btn-ghost" : ""}`}
          onClick={onToggleChatPanel}
          disabled={isEnding}
        >
          {isChatCollapsed ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect
                x="3"
                y="4"
                width="18"
                height="16"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect
                x="3"
                y="4"
                width="18"
                height="16"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M15 4v16"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          )}
          <span>{isChatCollapsed ? "Open chat" : "Hide chat"}</span>
        </button>

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
