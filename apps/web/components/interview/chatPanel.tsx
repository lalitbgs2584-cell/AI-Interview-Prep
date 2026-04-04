/**
 * ============================================================================
 * ChatPanel Component
 * ============================================================================
 * 
 * Displays the interview transcript (chat messages).
 * Also provides input textarea for manual response submission.
 * 
 * Props:
 *  - messages: Array of chat messages from store
 *  - aiSpeaking: Boolean (shows typing indicator when true)
 *  - input: Current input textarea value
 *  - onInputChange: Callback when input changes
 *  - onSendMessage: Callback when message is sent
 *  - onKeyDown: Callback for keyboard events (Enter to send)
 *  - chatEndRef: Ref for auto-scroll to bottom
 * 
 * ============================================================================
 */

"use client";

import React from "react";

interface Message {
  id: number;
  role: "user" | "ai";
  text: string;
  time: string;
}

interface ChatPanelProps {
  messages: Message[];
  aiSpeaking: boolean;
  collapsed: boolean;
  notice?: string | null;
  onToggleCollapse: () => void;
  onDismissNotice?: () => void;
  input: string;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
}

export default function ChatPanel({
  messages,
  aiSpeaking,
  collapsed,
  notice,
  onToggleCollapse,
  onDismissNotice,
  input,
  onInputChange,
  onSendMessage,
  onKeyDown,
  chatEndRef,
}: ChatPanelProps) {
  if (collapsed) {
    return (
      <aside className="chat-panel chat-panel-collapsed" aria-label="Collapsed transcript panel">
        <button
          type="button"
          className="chat-collapse-rail"
          onClick={onToggleCollapse}
          aria-label="Expand transcript panel"
          title="Expand transcript"
        >
          <span className="chat-collapse-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="chat-collapse-label">Transcript</span>
          <span className="chat-collapse-count">{messages.length}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-icon">-</span>
          <span className="chat-title">Transcript</span>
        </div>
        <div className="chat-header-actions">
          <span className="chat-count">{messages.length} msgs</span>
          <button
            type="button"
            className="chat-collapse-btn"
            onClick={onToggleCollapse}
            aria-label="Collapse transcript panel"
            title="Collapse transcript"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages Container */}
      <div className="chat-messages">
        {notice && (
          <div
            style={{
              marginBottom: "0.75rem",
              padding: "0.85rem 1rem",
              borderRadius: "14px",
              border: "1px solid rgba(245, 158, 11, 0.35)",
              background: "rgba(245, 158, 11, 0.12)",
              color: "rgba(255,255,255,0.92)",
              fontSize: "0.85rem",
              lineHeight: 1.5,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "0.75rem",
            }}
          >
            <span>{notice}</span>
            {onDismissNotice && (
              <button
                type="button"
                onClick={onDismissNotice}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                }}
                aria-label="Dismiss notice"
              >
                -
              </button>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={m.id}
            className={`chat-msg chat-msg-${m.role}`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            {/* AI Avatar */}
            {m.role === "ai" && (
              <div className="chat-msg-avatar chat-msg-avatar-ai">AI</div>
            )}

            {/* Message Body */}
            <div className="chat-msg-body">
              <div className="chat-bubble">{m.text}</div>
              <div className="chat-time">{m.time}</div>
            </div>

            {/* User Avatar */}
            {m.role === "user" && (
              <div className="chat-msg-avatar chat-msg-avatar-user">AR</div>
            )}
          </div>
        ))}

        {/* Typing Indicator (when AI is speaking) */}
        {aiSpeaking && (
          <div className="chat-msg chat-msg-ai">
            <div className="chat-msg-avatar chat-msg-avatar-ai">AI</div>
            <div className="chat-msg-body">
              <div className="chat-bubble chat-bubble-typing">
                <span className="typing-dot" style={{ animationDelay: "0s" }} />
                <span className="typing-dot" style={{ animationDelay: "0.18s" }} />
                <span className="typing-dot" style={{ animationDelay: "0.36s" }} />
              </div>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="chat-input-wrap">
        <textarea
          className="chat-input"
          rows={1}
          placeholder="Type a response or note"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          className="chat-send-btn"
          onClick={onSendMessage}
          disabled={!input.trim()}
          aria-label="Send message"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </aside>
  );
}
