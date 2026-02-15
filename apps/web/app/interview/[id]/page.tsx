"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import "../style.css";

// ── Mock chat history ──────────────────────────────────────
const initialMessages = [
  {
    id: 1,
    role: "ai" as const,
    text: "Hello Alex! I'm your AI interviewer today. We'll be doing a system design interview. Are you ready to get started?",
    time: "2:28 PM",
  },
  {
    id: 2,
    role: "user" as const,
    text: "Yes, absolutely! I've been preparing for this. Let's go.",
    time: "2:29 PM",
  },
  {
    id: 3,
    role: "ai" as const,
    text: "Great energy! Here's your question: Design a URL shortening service like Bit.ly. Walk me through your approach — start with requirements gathering.",
    time: "2:29 PM",
  },
  {
    id: 4,
    role: "user" as const,
    text: "Sure. For functional requirements, I'd say we need: shorten a long URL, redirect users to the original URL, and optionally allow custom aliases.",
    time: "2:31 PM",
  },
  {
    id: 5,
    role: "ai" as const,
    text: "Good start! What about non-functional requirements? Think about scale — how many URLs shortened per day, and what's the read/write ratio?",
    time: "2:32 PM",
  },
  {
    id: 6,
    role: "user" as const,
    text: "Let's assume 100M URLs shortened per day. The read to write ratio would be heavily skewed — maybe 100:1 since redirects happen far more than creation.",
    time: "2:33 PM",
  },
];

// ── Timer hook ─────────────────────────────────────────────
function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ── Wave bars (AI speaking indicator) ─────────────────────
function WaveBars({ active }: { active: boolean }) {
  return (
    <div className={`wave-bars${active ? " wave-active" : ""}`}>
      {[...Array(5)].map((_, i) => (
        <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────
export default function InterviewPage() {
 
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [sessionRunning, setSessionRunning] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timer = useTimer(sessionRunning);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", text, time: now }]);
    setInput("");

    // Simulate AI response
    setAiSpeaking(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "ai",
          text: "That's a solid point. Now let's talk about the database schema. How would you store the mappings, and which database type would you choose?",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setAiSpeaking(false);
    }, 2200);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <div className="noise" />

      <div className="interview-root">

        {/* ════ TOP BAR ════ */}
        <header className="interview-topbar">
          <div className="topbar-left">
            <Link href="/dashboard" className="topbar-logo">Prep<span>AI</span></Link>
            <div className="topbar-divider" />
            <div className="topbar-session-info">
              <span className="tag tag-accent">System Design</span>
              <span className="topbar-title">URL Shortener</span>
            </div>
          </div>

          <div className="topbar-center">
            <div className={`live-chip${aiSpeaking ? " ai-pulse" : ""}`}>
              <span className="dot-live" />
              LIVE
            </div>
            <div className="timer-block">
              <span className="timer">{timer}</span>
            </div>
          </div>

          <div className="topbar-right">
            <div className="score-preview">
              <span className="score-preview-label">Score</span>
              <span className="score-preview-value score-high">78</span>
            </div>
            <button className="btn-end-session">End Session</button>
          </div>
        </header>

        {/* ════ BODY ════ */}
        <div className="interview-body">

          {/* ── Video area (left 2/3) ── */}
          <div className="video-area">

            {/* AI interviewer — large */}
            <div className={`vid-card vid-ai${aiSpeaking ? " speaking" : ""}`}>
              <div className="vid-inner">
                {/* Placeholder video with animated gradient */}
                <div className="vid-placeholder vid-placeholder-ai">
                  <div className="vid-avatar-ring">
                    <div className="vid-avatar">AI</div>
                  </div>
                  {/* Animated circuit lines */}
                  <div className="vid-circuit">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="circuit-line" style={{ animationDelay: `${i * 0.4}s` }} />
                    ))}
                  </div>
                </div>

                {/* Speaking indicator */}
                <div className="vid-speaking-bar">
                  <WaveBars active={aiSpeaking} />
                  <span className="vid-speaking-label">
                    {aiSpeaking ? "AI is speaking…" : "Listening"}
                  </span>
                </div>
              </div>

              {/* Name tag */}
              <div className="vid-nametag">
                <span className="dot-accent-static" />
                <span className="vid-name">PrepAI Interviewer</span>
                <span className="tag tag-violet">GPT-o3</span>
              </div>
            </div>

            {/* User — smaller pip */}
            <div className={`vid-card vid-user${!camOn ? " cam-off" : ""}`}>
              <div className="vid-inner">
                {camOn ? (
                  <div className="vid-placeholder vid-placeholder-user">
                    <div className="vid-avatar vid-avatar-user">AR</div>
                    {/* Bokeh dots */}
                    {[...Array(8)].map((_, i) => (
                      <div
                        key={i}
                        className="bokeh"
                        style={{
                          left: `${10 + i * 11}%`,
                          top: `${20 + (i % 3) * 25}%`,
                          animationDelay: `${i * 0.3}s`,
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="cam-off-state">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                      <path d="M3 3l18 18M10.5 10.5A2 2 0 0013.5 13.5M9 5h7l2 2h3v12H9m-5-5V7h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span>Camera off</span>
                  </div>
                )}
              </div>

              {/* Name tag */}
              <div className="vid-nametag">
                <span className="dot-accent-static dot-user" />
                <span className="vid-name">Alex Rivera</span>
                <span className="tag tag-sky">You</span>
              </div>
            </div>

            {/* ── Controls bar ── */}
            <div className="controls-bar">
              <button
                className={`ctrl-btn${!micOn ? " ctrl-off" : ""}`}
                onClick={() => setMicOn((v) => !v)}
                title={micOn ? "Mute mic" : "Unmute mic"}
              >
                {micOn ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8"/>
                    <path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M3 3l18 18M9 9v5a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.94-.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    <path d="M17 16.95A7 7 0 015 10M12 19v3M9 22h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                )}
                <span>{micOn ? "Mute" : "Unmute"}</span>
              </button>

              <button
                className={`ctrl-btn${!camOn ? " ctrl-off" : ""}`}
                onClick={() => setCamOn((v) => !v)}
                title={camOn ? "Stop camera" : "Start camera"}
              >
                {camOn ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M3 3l18 18M10.5 8.5H13a2 2 0 012 2v.5m1 4.47V16a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h.5M15 10l4.553-2.276A1 1 0 0121 8.723v6.554" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                )}
                <span>{camOn ? "Camera" : "No cam"}</span>
              </button>

              <button className="ctrl-btn ctrl-btn-ghost">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                <span>Share</span>
              </button>

              <button className="ctrl-btn ctrl-btn-ghost">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.636 5.636l2.121 2.121M16.243 16.243l2.121 2.121M5.636 18.364l2.121-2.121M16.243 7.757l2.121-2.121" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                <span>Settings</span>
              </button>

              <div className="ctrl-spacer" />

              <button className="ctrl-btn ctrl-btn-end">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M6.827 6.175A8 8 0 0117.173 17.173M12 6v6l4 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <path d="M3.05 11a9 9 0 1017.9 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                <span>End</span>
              </button>
            </div>
          </div>

          {/* ── Chat panel (right 1/3) ── */}
          <aside className="chat-panel">
            <div className="chat-header">
              <div className="chat-header-left">
                <span className="chat-icon">◎</span>
                <span className="chat-title">Transcript</span>
              </div>
              <span className="chat-count">{messages.length} msgs</span>
            </div>

            <div className="chat-messages">
              {messages.map((m, i) => (
                <div
                  key={m.id}
                  className={`chat-msg chat-msg-${m.role}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {m.role === "ai" && (
                    <div className="chat-msg-avatar chat-msg-avatar-ai">AI</div>
                  )}
                  <div className="chat-msg-body">
                    <div className="chat-bubble">{m.text}</div>
                    <div className="chat-time">{m.time}</div>
                  </div>
                  {m.role === "user" && (
                    <div className="chat-msg-avatar chat-msg-avatar-user">AR</div>
                  )}
                </div>
              ))}

              {/* AI typing indicator */}
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

              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="chat-input-wrap">
              <textarea
                className="chat-input"
                rows={1}
                placeholder="Type a response or note…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
              />
              <button
                className="chat-send-btn"
                onClick={sendMessage}
                disabled={!input.trim()}
                aria-label="Send"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}