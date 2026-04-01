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
  input: string;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
}

export default function ChatPanel({
  messages,
  aiSpeaking,
  input,
  onInputChange,
  onSendMessage,
  onKeyDown,
  chatEndRef,
}: ChatPanelProps) {
  return (
    <aside className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-icon">◎</span>
          <span className="chat-title">Transcript</span>
        </div>
        <span className="chat-count">{messages.length} msgs</span>
      </div>

      {/* Messages Container */}
      <div className="chat-messages">
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
          placeholder="Type a response or note…"
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