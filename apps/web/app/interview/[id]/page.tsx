"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import "../style.css";
import { useParams, useRouter } from "next/navigation";
import { useSpeechToText } from "@/hooks/useSpeechHook";
import { getSocket } from "@/ws-client-config/socket";
import { useInterviewStore } from "@/store/useInterviewStore";

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */

/**
 * Why the session ended.
 * Sent to the backend so feedback can flag early exits,
 * violations, and compute an "integrity score".
 */
type EndReason =
  | "completed"       // backend sent interview:complete — full session done
  | "user_ended"      // candidate clicked "End Session"
  | "fullscreen"      // exited fullscreen twice
  | "tab_switch"      // switched tabs twice
  | "face_violation"  // face not detected / multiple faces within countdown
  | "policy_violation"; // repeated non-English or abusive answers

type AnswerAnalyticsPayload = {
  speech_duration_ms: number;
  latency_ms: number;
  pause_ratio: number;
  long_pause_count: number;
  interruption_count: number;
  word_count: number;
  filler_words: {
    count: number;
    bursts: number;
    counts: Record<string, number>;
  };
  hedge_count: number;
  self_corrections: number;
  voice_risk_score?: number;
  suspected_help_events?: number;
  camera_integrity_status?: string;
};

type IntegrityStatus = "ok" | "warning" | "terminal";

const FILLER_TERMS = [
  "um",
  "uh",
  "like",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "basically",
  "actually",
];

const HEDGE_PATTERNS = [
  /\bmaybe\b/gi,
  /\bprobably\b/gi,
  /\bperhaps\b/gi,
  /\bi think\b/gi,
  /\bi guess\b/gi,
  /\bi believe\b/gi,
  /\bnot sure\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
];

const SELF_CORRECTION_PATTERNS = [
  /\bi mean\b/gi,
  /\bsorry\b/gi,
  /\blet me rephrase\b/gi,
  /\bor rather\b/gi,
  /\bwhat i meant\b/gi,
];
const ABUSIVE_PATTERNS = [
  /\bfuck\b/i,
  /\bfucking\b/i,
  /\bshit\b/i,
  /\bbitch\b/i,
  /\basshole\b/i,
  /\bbastard\b/i,
  /\bcunt\b/i,
  /\bmadarchod\b/i,
  /\bmc\b/i,
  /\bbehenchod\b/i,
  /\bbc\b/i,
  /\bchutiya\b/i,
  /\bgandu\b/i,
  /\bharami\b/i,
];

function containsAbusiveLanguage(text: string) {
  return ABUSIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function containsNonEnglishScript(text: string) {
  return /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}\p{Number}\s]/u.test(text);
}

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function computeAnswerAnalytics(args: {
  text: string;
  speechStartedAt: number | null;
  questionAskedAt: number | null;
  aiFinishedAt: number | null;
  interruptions: number;
}): AnswerAnalyticsPayload {
  const { text, speechStartedAt, questionAskedAt, aiFinishedAt, interruptions } = args;
  const normalized = text.trim().toLowerCase();
  const words = normalized.match(/\b[\w'-]+\b/g) ?? [];
  const wordCount = words.length;
  const answerEndedAt = Date.now();
  const startAt = speechStartedAt ?? answerEndedAt;
  const promptReferenceAt = aiFinishedAt ?? questionAskedAt ?? startAt;
  const speechDurationMs = Math.max(1000, answerEndedAt - startAt);
  const latencyMs = Math.max(0, startAt - promptReferenceAt);

  const fillerCounts: Record<string, number> = {};
  let fillerCount = 0;
  for (const term of FILLER_TERMS) {
    const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, "gi");
    const matches = normalized.match(regex)?.length ?? 0;
    if (matches > 0) {
      fillerCounts[term] = matches;
      fillerCount += matches;
    }
  }

  let bursts = 0;
  let run = 0;
  for (const token of words) {
    if (token === "um" || token === "uh" || token === "like") {
      run += 1;
      if (run >= 2) bursts += 1;
    } else {
      run = 0;
    }
  }

  const pauseRatio = clamp(
    latencyMs / Math.max(latencyMs + speechDurationMs, 1),
    0,
    0.9,
  );
  const hedgeCount = HEDGE_PATTERNS.reduce((sum, pattern) => sum + (normalized.match(pattern)?.length ?? 0), 0);
  const selfCorrections = SELF_CORRECTION_PATTERNS.reduce((sum, pattern) => sum + (normalized.match(pattern)?.length ?? 0), 0);

  return {
    speech_duration_ms: speechDurationMs,
    latency_ms: latencyMs,
    pause_ratio: Number(pauseRatio.toFixed(3)),
    long_pause_count: latencyMs >= 2500 ? 1 : 0,
    interruption_count: interruptions,
    word_count: wordCount,
    filler_words: {
      count: fillerCount,
      bursts,
      counts: fillerCounts,
    },
    hedge_count: hedgeCount,
    self_corrections: selfCorrections,
  };
}

/* ─────────────────────────────────────────────
   TIMER
───────────────────────────────────────────── */

function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  const secondsRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return { display: `${mm}:${ss}`, seconds: secondsRef };
}

/* ─────────────────────────────────────────────
   WAVE BARS
───────────────────────────────────────────── */

function WaveBars({ active }: { active: boolean }) {
  return (
    <div className={`wave-bars${active ? " wave-active" : ""}`}>
      {[...Array(5)].map((_, i) => (
        <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   FULLSCREEN GATE
───────────────────────────────────────────── */

function FullscreenGate({ onEnter }: { onEnter: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10001,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#09090d",
    }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "rgba(139,92,246,0.1)", border: "1.5px solid rgba(139,92,246,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"
              stroke="#8b5cf6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#f3f4f6" }}>
          Ready to begin?
        </h2>
        <p style={{ margin: "0 0 28px", fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
          The interview runs in fullscreen. Click below to enter fullscreen and start.
        </p>
        <button
          onClick={onEnter}
          style={{
            width: "100%", padding: "13px", borderRadius: 10,
            background: "linear-gradient(135deg,#7c3aed,#8b5cf6)",
            color: "#fff", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer",
          }}
        >
          Enter Fullscreen & Start Interview
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FULLSCREEN WARNING MODAL
───────────────────────────────────────────── */

function FullscreenWarningModal({ count, onReenter }: { count: number; onReenter: () => void }) {
  const isTerminal = count >= 2;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
      <style>{`
        @keyframes slideUpModal{from{opacity:0;transform:translateY(24px) scale(0.97);}to{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes pulseRed{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4);}50%{box-shadow:0 0 0 12px rgba(239,68,68,0);}}
        @keyframes pulseViolet{0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,0.4);}50%{box-shadow:0 0 0 12px rgba(139,92,246,0);}}
      `}</style>
      <div style={{ background: "#0f0f13", border: `1.5px solid ${isTerminal ? "#ef4444" : "#8b5cf6"}`, borderRadius: "16px", padding: "36px 40px", maxWidth: "420px", width: "90%", animation: "slideUpModal 0.25s ease", boxShadow: isTerminal ? "0 0 40px rgba(239,68,68,0.25),0 24px 48px rgba(0,0,0,0.6)" : "0 0 40px rgba(139,92,246,0.2),0 24px 48px rgba(0,0,0,0.6)" }}>
        <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: isTerminal ? "rgba(239,68,68,0.12)" : "rgba(139,92,246,0.12)", border: `1.5px solid ${isTerminal ? "rgba(239,68,68,0.4)" : "rgba(139,92,246,0.4)"}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px", animation: isTerminal ? "pulseRed 1.5s ease infinite" : "pulseViolet 1.5s ease infinite" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke={isTerminal ? "#ef4444" : "#8b5cf6"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 style={{ margin: "0 0 10px", fontSize: "18px", fontWeight: 700, color: isTerminal ? "#ef4444" : "#a78bfa" }}>
          {isTerminal ? "Interview Terminated" : "Fullscreen Exited"}
        </h2>
        <p style={{ margin: "0 0 24px", fontSize: "14px", lineHeight: "1.65", color: "#9ca3af" }}>
          {isTerminal
            ? <><strong style={{ color: "#f3f4f6" }}>You exited fullscreen twice.</strong> This interview has been <strong style={{ color: "#ef4444" }}>automatically ended</strong>.</>
            : <>You exited fullscreen mode. <strong style={{ color: "#f3f4f6" }}>Warning {count} of 2.</strong> Exiting again will <strong style={{ color: "#a78bfa" }}>end</strong> your interview.</>
          }
        </p>
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
          {[1, 2].map((n) => (
            <div key={n} style={{ flex: 1, height: "6px", borderRadius: "99px", background: n <= count ? (isTerminal ? "#ef4444" : "#8b5cf6") : "rgba(255,255,255,0.08)", transition: "background 0.3s ease" }} />
          ))}
        </div>
        <button onClick={onReenter} style={{ width: "100%", padding: "12px", borderRadius: "10px", background: isTerminal ? "#ef4444" : "linear-gradient(135deg,#7c3aed,#8b5cf6)", color: "#fff", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer" }}>
          {isTerminal ? "View Results" : "Re-enter Fullscreen"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TAB SWITCH WARNING MODAL
───────────────────────────────────────────── */

function TabSwitchWarningModal({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  const isTerminal = count >= 2;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}>
      <style>{`
        @keyframes slideUpModal{from{opacity:0;transform:translateY(24px) scale(0.97);}to{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes pulseRed{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4);}50%{box-shadow:0 0 0 12px rgba(239,68,68,0);}}
      `}</style>
      <div style={{ background: "#0f0f13", border: `1.5px solid ${isTerminal ? "#ef4444" : "#f59e0b"}`, borderRadius: "16px", padding: "36px 40px", maxWidth: "420px", width: "90%", animation: "slideUpModal 0.25s ease", boxShadow: isTerminal ? "0 0 40px rgba(239,68,68,0.25),0 24px 48px rgba(0,0,0,0.6)" : "0 0 40px rgba(245,158,11,0.2),0 24px 48px rgba(0,0,0,0.6)" }}>
        <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: isTerminal ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)", border: `1.5px solid ${isTerminal ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)"}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px", animation: isTerminal ? "pulseRed 1.5s ease infinite" : "none" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={isTerminal ? "#ef4444" : "#f59e0b"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h2 style={{ margin: "0 0 10px", fontSize: "18px", fontWeight: 700, color: isTerminal ? "#ef4444" : "#f59e0b" }}>{isTerminal ? "Interview Terminated" : "Tab Switch Detected"}</h2>
        <p style={{ margin: "0 0 24px", fontSize: "14px", lineHeight: "1.65", color: "#9ca3af" }}>
          {isTerminal
            ? <><strong style={{ color: "#f3f4f6" }}>You switched tabs 2 times.</strong> This interview has been <strong style={{ color: "#ef4444" }}>automatically ended</strong>.</>
            : <>You switched away. <strong style={{ color: "#f3f4f6" }}>Warning {count} of 2.</strong> Switching again will <strong style={{ color: "#f59e0b" }}>end</strong> your interview.</>
          }
        </p>
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
          {[1, 2].map((n) => <div key={n} style={{ flex: 1, height: "6px", borderRadius: "99px", background: n <= count ? (isTerminal ? "#ef4444" : "#f59e0b") : "rgba(255,255,255,0.08)", transition: "background 0.3s ease" }} />)}
        </div>
        <button onClick={onDismiss} style={{ width: "100%", padding: "12px", borderRadius: "10px", background: isTerminal ? "#ef4444" : "rgba(245,158,11,0.12)", color: isTerminal ? "#fff" : "#f59e0b", fontSize: "14px", fontWeight: 600, border: isTerminal ? "none" : "1px solid rgba(245,158,11,0.3)", cursor: "pointer" }}>
          {isTerminal ? "View Results" : "I Understand — Resume Interview"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FACE VIOLATION MODAL
───────────────────────────────────────────── */

function FaceViolationModal({ status, countdown, onDismiss }: { status: FaceStatus; countdown: number; onDismiss: () => void }) {
  const titleMap: Record<Exclude<FaceStatus, "ok">, string> = {
    "no-face": "No Face Detected",
    "multiple": "Multiple People Detected",
    "moved": "Stay Centered In Frame",
    "identity-risk": "Candidate Identity Check Failed",
  };
  const bodyMap: Record<Exclude<FaceStatus, "ok">, string> = {
    "no-face": "Your face is not visible. Please move into the camera frame.",
    "multiple": "Only you should be visible. Please ask others to move away or reposition your camera.",
    "moved": "Your face moved too much or stayed off-position for too long. Please sit back in the original position.",
    "identity-risk": "The face now visible does not match the earlier interview position. Please return the original candidate to the camera.",
  };
  const isMultiple = status === "multiple";
  const pct = (countdown / 15) * 100;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)" }}>
      <style>{`
        @keyframes faceModalIn{from{opacity:0;transform:scale(0.95) translateY(16px);}to{opacity:1;transform:scale(1) translateY(0);}}
        @keyframes pulseRing{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.5);}50%{box-shadow:0 0 0 14px rgba(239,68,68,0);}}
      `}</style>
      <div style={{ background: "#0f0f13", border: "1.5px solid #ef4444", borderRadius: "20px", padding: "40px", maxWidth: "440px", width: "90%", animation: "faceModalIn 0.3s ease", boxShadow: "0 0 60px rgba(239,68,68,0.2),0 32px 64px rgba(0,0,0,0.7)" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "rgba(239,68,68,0.1)", border: "2px solid rgba(239,68,68,0.4)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pulseRing 1.5s ease infinite" }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              {isMultiple ? (<><circle cx="9" cy="7" r="3" stroke="#ef4444" strokeWidth="1.8" /><circle cx="15" cy="7" r="3" stroke="#ef4444" strokeWidth="1.8" /><path d="M3 20c0-3.3 2.7-6 6-6h6c3.3 0 6 2.7 6 6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /><path d="M2 3l20 18" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></>) : (<><circle cx="12" cy="8" r="4" stroke="#ef4444" strokeWidth="1.8" strokeDasharray="4 2" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></>)}
            </svg>
          </div>
        </div>
        <h2 style={{ textAlign: "center", margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#ef4444" }}>{titleMap[status as Exclude<FaceStatus, "ok">]}</h2>
        <p style={{ textAlign: "center", margin: "0 0 28px", fontSize: "14px", lineHeight: "1.7", color: "#9ca3af" }}>
          {bodyMap[status as Exclude<FaceStatus, "ok">]}
        </p>
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}>Interview ends in</span>
            <span style={{ fontSize: "20px", fontWeight: 700, color: countdown <= 5 ? "#ef4444" : "#f59e0b", fontVariantNumeric: "tabular-nums" }}>{countdown}s</span>
          </div>
          <div style={{ height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "99px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: countdown <= 5 ? "#ef4444" : "#f59e0b", borderRadius: "99px", transition: "width 1s linear, background 0.3s ease" }} />
          </div>
        </div>
        <button onClick={onDismiss} style={{ width: "100%", padding: "13px", borderRadius: "12px", background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: "14px", fontWeight: 600, border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer" }}>
          I Fixed It — Check Again
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FACE STATUS BANNER
───────────────────────────────────────────── */

function FaceStatusBanner({ status }: { status: Exclude<FaceStatus, "ok"> }) {
  const bannerMap: Record<Exclude<FaceStatus, "ok">, { text: string; background: string; icon: string }> = {
    "no-face": {
      text: "No face detected — please stay in frame",
      background: "rgba(245,158,11,0.9)",
      icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
    },
    "multiple": {
      text: "Multiple people visible — adjust camera",
      background: "rgba(239,68,68,0.9)",
      icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 11a4 4 0 100-8 4 4 0 000 8z",
    },
    "moved": {
      text: "Camera framing changed too much — return to your position",
      background: "rgba(245,158,11,0.9)",
      icon: "M4 7h6M4 17h6M20 7h-6M20 17h-6M12 4v16",
    },
    "identity-risk": {
      text: "Candidate swap suspected — restore the original candidate",
      background: "rgba(239,68,68,0.92)",
      icon: "M12 8v4M12 16h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
    },
  };
  const banner = bannerMap[status];
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", background: banner.background, backdropFilter: "blur(6px)", fontSize: "11px", fontWeight: 600, color: "#fff", borderTopLeftRadius: "inherit", borderTopRightRadius: "inherit" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <path d={banner.icon} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {banner.text}
    </div>
  );
}

/* ─────────────────────────────────────────────
   INTERRUPTION BADGE  (new)
   Shows live how many times user interrupted AI.
───────────────────────────────────────────── */

function InterruptionBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "6px",
      padding: "4px 10px", borderRadius: "99px",
      background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.3)",
      fontSize: "12px", color: "#fb923c", fontWeight: 600,
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M9 18V5l12-2v13M9 18a3 3 0 01-3 3 3 3 0 01-3-3 3 3 0 013-3 3 3 0 013 3zM21 16a3 3 0 01-3 3 3 3 0 01-3-3 3 3 0 013-3 3 3 0 013 3z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Interruptions: {count}
    </div>
  );
}

/* ─────────────────────────────────────────────
   FACE DETECTION HOOK (MediaPipe)
───────────────────────────────────────────── */

type FaceStatus = "ok" | "no-face" | "multiple" | "moved" | "identity-risk";

type FaceSignature = {
  centerX: number;
  centerY: number;
  areaRatio: number;
  aspectRatio: number;
};

function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const [status, setStatus] = useState<FaceStatus>("ok");
  const [count, setCount] = useState(1);
  const [modelsReady, setModelsReady] = useState(false);

  const detectorRef = useRef<{
    detectForVideo: (video: HTMLVideoElement, timestamp: number) => { detections: unknown[] };
    close: () => void;
  } | null>(null);
  const statusRef     = useRef<FaceStatus>("ok");
  const badFrames     = useRef(0);
  const animFrameRef  = useRef<number | null>(null);
  const lastVideoTime = useRef(-1);
  const lastPollTime  = useRef(0);
  const baselineRef   = useRef<FaceSignature | null>(null);
  const stableOkFramesRef = useRef(0);
  const priorGapFramesRef = useRef(0);

  const GRACE_FRAMES    = 3;
  const POLL_INTERVAL_MS = 600;
  const getSignature = (video: HTMLVideoElement, detection: any): FaceSignature | null => {
    const box = detection?.boundingBox;
    if (!box || !video.videoWidth || !video.videoHeight) return null;
    const width = Math.max(1, Number(box.width ?? 0));
    const height = Math.max(1, Number(box.height ?? 0));
    const originX = Number(box.originX ?? 0);
    const originY = Number(box.originY ?? 0);
    return {
      centerX: (originX + width / 2) / video.videoWidth,
      centerY: (originY + height / 2) / video.videoHeight,
      areaRatio: (width * height) / Math.max(video.videoWidth * video.videoHeight, 1),
      aspectRatio: width / height,
    };
  };
  const diffSignature = (a: FaceSignature, b: FaceSignature) => ({
    centerShift: Math.hypot(a.centerX - b.centerX, a.centerY - b.centerY),
    areaShift: Math.abs(a.areaRatio - b.areaRatio),
    aspectShift: Math.abs(a.aspectRatio - b.aspectRatio),
  });

  useEffect(() => {
    let cancelled = false;

    async function loadModel() {
      try {
        const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
        );
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.45,
          minSuppressionThreshold: 0.3,
        });
        if (!cancelled) { detectorRef.current = detector; setModelsReady(true); }
      } catch (err) {
        console.warn("[MediaPipe FaceDetector] Load failed:", err);
      }
    }

    loadModel();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!modelsReady || !enabled) {
      badFrames.current = 0;
      statusRef.current = "ok";
      setStatus("ok");
      setCount(1);
      baselineRef.current = null;
      stableOkFramesRef.current = 0;
      priorGapFramesRef.current = 0;
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;

      if (now - lastPollTime.current >= POLL_INTERVAL_MS) {
        lastPollTime.current = now;
        const video    = videoRef.current;
        const detector = detectorRef.current;

        if (
          video && detector &&
          video.readyState >= 2 && !video.paused &&
          video.videoWidth > 0 &&
          video.currentTime !== lastVideoTime.current
        ) {
          lastVideoTime.current = video.currentTime;
          try {
            const result = detector.detectForVideo(video, performance.now());
            const n      = result.detections.length;
            setCount(n);
            const detection = (result.detections as any[])?.[0];
            const signature = n === 1 ? getSignature(video, detection) : null;
            let raw: FaceStatus = n === 0 ? "no-face" : n > 1 ? "multiple" : "ok";

            if (raw === "no-face") {
              stableOkFramesRef.current = 0;
              priorGapFramesRef.current += 1;
            } else if (raw === "multiple") {
              stableOkFramesRef.current = 0;
              priorGapFramesRef.current = 0;
            } else if (signature) {
              if (!baselineRef.current) {
                stableOkFramesRef.current += 1;
                if (stableOkFramesRef.current >= 3) {
                  baselineRef.current = signature;
                }
              } else {
                const drift = diffSignature(signature, baselineRef.current);
                const identitySwapLikely =
                  priorGapFramesRef.current >= 2 &&
                  (drift.centerShift > 0.22 || drift.areaShift > 0.08 || drift.aspectShift > 0.4);
                const movedTooMuch =
                  drift.centerShift > 0.15 || drift.areaShift > 0.045;

                if (identitySwapLikely) {
                  raw = "identity-risk";
                } else if (movedTooMuch) {
                  raw = "moved";
                } else {
                  stableOkFramesRef.current += 1;
                  if (stableOkFramesRef.current >= 3) {
                    baselineRef.current = {
                      centerX: baselineRef.current.centerX * 0.7 + signature.centerX * 0.3,
                      centerY: baselineRef.current.centerY * 0.7 + signature.centerY * 0.3,
                      areaRatio: baselineRef.current.areaRatio * 0.7 + signature.areaRatio * 0.3,
                      aspectRatio: baselineRef.current.aspectRatio * 0.7 + signature.aspectRatio * 0.3,
                    };
                  }
                }
              }
              priorGapFramesRef.current = 0;
            }

            if (raw !== "ok") {
              stableOkFramesRef.current = 0;
              badFrames.current += 1;
              if (badFrames.current >= GRACE_FRAMES && statusRef.current !== raw) {
                statusRef.current = raw;
                setStatus(raw);
              }
            } else {
              badFrames.current = 0;
              if (statusRef.current !== "ok") {
                statusRef.current = "ok";
                setStatus("ok");
              }
            }
          } catch { /* swallow per-frame errors */ }
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      badFrames.current = 0;
      statusRef.current = "ok";
      baselineRef.current = null;
      stableOkFramesRef.current = 0;
      priorGapFramesRef.current = 0;
    };
  }, [modelsReady, enabled, videoRef]);

  return { status, count, modelsReady };
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */

export default function InterviewPage() {
  const router      = useRouter();
  const params      = useParams();
  const interviewId = params.id as string;

  const [input, setInput]               = useState("");
  const [micOn, setMicOn]               = useState(true);
  const [camOn, setCamOn]               = useState(true);
  const [aiSpeaking, setAiSpeaking]     = useState(false);
  const [sessionRunning, setSessionRunning] = useState(true);
  const [isEnding, setIsEnding]         = useState(false);

  const endLockRef = useRef(false);

  /* ── Fullscreen ───────────────────────────────────────────────────────── */
  const [showGate, setShowGate]             = useState(true);
  const [isFullscreen, setIsFullscreen]     = useState(false);
  const [fsWarningCount, setFsWarningCount] = useState(0);
  const [showFsWarning, setShowFsWarning]   = useState(false);
  const fsWarningCountRef      = useRef(0);
  const hasEnteredFsOnce       = useRef(false);
  const suppressFsExitRef      = useRef(false);

  /* ── Tab switch ───────────────────────────────────────────────────────── */
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const tabSwitchCountRef = useRef(0);

  /* ── Face modal ───────────────────────────────────────────────────────── */
  const [showFaceModal, setShowFaceModal]   = useState(false);
  const [faceCountdown, setFaceCountdown]   = useState(15);
  const faceCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─────────────────────────────────────────────
     INTERRUPTION STATE  (Problem 1)
     interruptionCount  — how many times user spoke while AI was speaking
     Stored to Redis/backend as a negative signal.
  ───────────────────────────────────────────── */
  const [interruptionCount, setInterruptionCount] = useState(0);
  const interruptionCountRef = useRef(0);
  const currentAnswerInterruptionRef = useRef(0);
  const currentQuestionAskedAtRef = useRef<number | null>(null);
  const aiFinishedSpeakingAtRef = useRef<number | null>(null);
  const answerSpeechStartedAtRef = useRef<number | null>(null);
  const [policyWarningCount, setPolicyWarningCount] = useState(0);
  const policyWarningCountRef = useRef(0);
  const [integrityWarningCount, setIntegrityWarningCount] = useState(0);
  const integrityWarningCountRef = useRef(0);
  const voiceRiskScoreRef = useRef(0);
  const suspectedHelpEventsRef = useRef(0);
  const helpCooldownRef = useRef(0);

  /* ─────────────────────────────────────────────
     END REASON  (Problem 2)
     Tracks WHY the session ended so the feedback
     page can show appropriate messaging and the
     backend can flag integrity issues.
  ───────────────────────────────────────────── */
  const endReasonRef = useRef<EndReason>("user_ended");

  /* ── Media refs ───────────────────────────────────────────────────────── */
  const chatEndRef       = useRef<HTMLDivElement>(null);
  const userVideoRef     = useRef<HTMLVideoElement>(null);
  const aiAudioRef       = useRef<HTMLAudioElement>(null);
  const userStreamRef    = useRef<MediaStream | null>(null);
  const recorderRef      = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<BlobPart[]>([]);
  const audioContextRef  = useRef<AudioContext | null>(null);
  const isRecordingRef   = useRef(false);
  const aiSourceCreatedRef = useRef(false);

  const lastQuestionKeyRef  = useRef("");
  const lastAnswerRef       = useRef("");
  const answerThrottleRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [micPermission, setMicPermission] = useState(false);
  const [camPermission, setCamPermission] = useState(false);

  const { display: timerDisplay, seconds: timerSeconds } = useTimer(sessionRunning);

  /* ── Face detection ───────────────────────────────────────────────────── */
  const { status: faceStatus, count: faceCount, modelsReady } = useFaceDetection(
    userVideoRef,
    camOn && camPermission && sessionRunning && !isEnding,
  );

  const { addMessage, messages, reset } = useInterviewStore();

  const issueIntegrityWarning = useCallback((message: string) => {
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const nextCount = integrityWarningCountRef.current + 1;
    const state: IntegrityStatus = nextCount >= 2 ? "terminal" : "warning";

    integrityWarningCountRef.current = nextCount;
    setIntegrityWarningCount(nextCount);

    addMessage({
      id: Date.now(),
      role: "ai",
      text: state === "terminal"
        ? `${message} This was your second integrity warning. The official interview is now ending and this attempt may be reviewed for outside help.`
        : `${message} This is integrity warning ${nextCount} of 2. Another suspicious event will end the interview.`,
      time: now,
    });

    if (state === "terminal") {
      setTimeout(() => endSessionRef.current(false, "face_violation"), 1000);
    }
  }, [addMessage]);

  const endSessionRef    = useRef<(fromBackend?: boolean, reason?: EndReason) => void>(() => { });
  const abortListeningRef = useRef<() => void>(() => { });

  /* ─────────────────────────────────────────────
     END SESSION
  ───────────────────────────────────────────── */
  const endSession = useCallback(
    async (fromBackend = false, reason: EndReason = "user_ended") => {
      if (endLockRef.current) return;
      endLockRef.current = true;
      if (isEnding) return;

      // Persist the reason — used in redirect URL and backend payload
      endReasonRef.current = fromBackend ? "completed" : reason;

      setIsEnding(true);
      setSessionRunning(false);
      setAiSpeaking(false);
      setShowFaceModal(false);
      setShowTabWarning(false);
      setShowFsWarning(false);

      if (faceCountdownRef.current) clearInterval(faceCountdownRef.current);

      // Stop speech recognition
      abortListeningRef.current();

      // Stop AI audio
      try {
        if (aiAudioRef.current) {
          aiAudioRef.current.pause();
          aiAudioRef.current.currentTime = 0;
        }
      } catch { /* ignore */ }

      // Stop recording
      try {
        if (isRecordingRef.current && recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
          isRecordingRef.current = false;
        }
      } catch (err) {
        console.warn("[recording] stop error:", err);
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      try { userStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }

      if (document.fullscreenElement) {
        suppressFsExitRef.current = true;
        try { await document.exitFullscreen(); } catch { /* ignore */ }
      }

      if (!fromBackend) {
        try {
          getSocket().emit("interview:end", {
            interviewId,
            reason: endReasonRef.current,
          });
        } catch (e) {
          console.error("[socket end]", e);
        }
      }

      /* ── Activity / completion API ──────────────────────────────────────
         Sends end reason + interruption count so the backend can:
           - Flag early exits in the feedback summary
           - Record interruptionCount as a negative behavioural signal
           - Compute an "integrity score" from violations
      ─────────────────────────────────────────────────────────────────── */
      try {
        await fetch("/api/activity/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interviewId,
            endReason:          endReasonRef.current,
            interruptionCount:  interruptionCountRef.current,
            tabSwitches:        tabSwitchCountRef.current,
            fsExits:            fsWarningCountRef.current,
            sessionDurationSec: timerSeconds.current,
          }),
        });
      } catch (e) {
        console.warn("[activity] update failed:", e);
      }

      reset();

      // Pass reason in query so the feedback page can show contextual messages
      setTimeout(() => {
        router.push(`/feedback/${interviewId}/?reason=${endReasonRef.current}`);
      }, 2000);
    },
    [interviewId, router, reset, isEnding, timerSeconds],
  );

  useEffect(() => { endSessionRef.current = endSession; }, [endSession]);

  /* ─────────────────────────────────────────────
     FULLSCREEN
  ───────────────────────────────────────────── */

  const enterFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
      hasEnteredFsOnce.current = true;
      setIsFullscreen(true);
    } catch (err) {
      console.warn("[fullscreen] enter failed:", err);
    }
  }, []);

  const handleGateEnter = useCallback(async () => {
    await enterFullscreen();
    setShowGate(false);
  }, [enterFullscreen]);

  useEffect(() => {
    const onChange = () => {
      const inFs = !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
      setIsFullscreen(inFs);

      if (inFs || !hasEnteredFsOnce.current || suppressFsExitRef.current || isEnding || !sessionRunning) {
        suppressFsExitRef.current = false;
        return;
      }

      fsWarningCountRef.current += 1;
      const n = fsWarningCountRef.current;
      setFsWarningCount(n);
      setShowFsWarning(true);
      if (n >= 2) setTimeout(() => endSessionRef.current(false, "fullscreen"), 800);
    };

    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [isEnding, sessionRunning]);

  const handleReenterFullscreen = useCallback(async () => {
    if (fsWarningCountRef.current >= 2) { endSessionRef.current(false, "fullscreen"); return; }
    setShowFsWarning(false);
    await enterFullscreen();
  }, [enterFullscreen]);

  /* ─────────────────────────────────────────────
     FACE MODAL
  ───────────────────────────────────────────── */

  useEffect(() => {
    if (!modelsReady || isEnding || !sessionRunning) return;
    if (faceStatus !== "ok" && !showFaceModal) { setFaceCountdown(15); setShowFaceModal(true); }
    if (faceStatus === "ok" && showFaceModal) {
      if (faceCountdownRef.current) clearInterval(faceCountdownRef.current);
      setShowFaceModal(false);
      setFaceCountdown(15);
    }
  }, [faceStatus, modelsReady, isEnding, sessionRunning, showFaceModal]);

  useEffect(() => {
    if (!showFaceModal) return;
    faceCountdownRef.current = setInterval(() => {
      setFaceCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(faceCountdownRef.current!);
          endSessionRef.current(false, "face_violation");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (faceCountdownRef.current) clearInterval(faceCountdownRef.current); };
  }, [showFaceModal]);

  const handleDismissFaceModal = useCallback(() => {
    if (faceCountdownRef.current) clearInterval(faceCountdownRef.current);
    setShowFaceModal(false);
    setFaceCountdown(15);
  }, []);

  /* ─────────────────────────────────────────────
     TAB SWITCH
  ───────────────────────────────────────────── */

  useEffect(() => {
    const handle = () => {
      if (document.visibilityState !== "hidden" || isEnding) return;
      tabSwitchCountRef.current += 1;
      const n = tabSwitchCountRef.current;
      setTabSwitchCount(n);
      setShowTabWarning(true);
      if (n >= 2) setTimeout(() => endSessionRef.current(false, "tab_switch"), 800);
    };
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, [isEnding]);

  const handleDismissTabWarning = useCallback(() => {
    if (tabSwitchCountRef.current >= 2) endSessionRef.current(false, "tab_switch");
    else setShowTabWarning(false);
  }, []);

  /* ─────────────────────────────────────────────
     TTS
  ───────────────────────────────────────────── */

  const playAIAudio = useCallback(async (text: string) => {
    if (!aiAudioRef.current || showGate) return;

    try {
      setAiSpeaking(true);

      const res  = await fetch("/api/tts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text, voice: "alloy" }),
      });

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);

      aiAudioRef.current.src = url;
      await aiAudioRef.current.play();

      aiAudioRef.current.onended = () => {
        setAiSpeaking(false);
        aiFinishedSpeakingAtRef.current = Date.now();
        URL.revokeObjectURL(url);
      };
    } catch (err) {
      console.error("[TTS]", err);
      setAiSpeaking(false);
    }
  }, [showGate]);

  /* ─────────────────────────────────────────────
     SOCKET
  ───────────────────────────────────────────── */

  const handleQuestion = useCallback(
    (data: { question: string; index: number; difficulty: string; time?: number }) => {
      if (!data?.question) return;

      const key = `${data.index}::${data.question}`;
      if (key === lastQuestionKeyRef.current) return;
      lastQuestionKeyRef.current = key;
      currentQuestionAskedAtRef.current = data.time ?? Date.now();
      aiFinishedSpeakingAtRef.current = null;
      answerSpeechStartedAtRef.current = null;
      currentAnswerInterruptionRef.current = 0;

      const now = data.time
        ? new Date(data.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      addMessage({ id: Date.now(), role: "ai", text: data.question, time: now });
      playAIAudio(data.question);
    },
    [addMessage, playAIAudio],
  );

  const handleQuestionRef = useRef(handleQuestion);
  useEffect(() => { handleQuestionRef.current = handleQuestion; }, [handleQuestion]);

  useEffect(() => {
    if (showGate) return;

    const socket = getSocket();

    const onQuestion  = (data: any) => handleQuestionRef.current(data);
    const onComplete  = ()           => endSessionRef.current(true, "completed");

    socket.off("interview:question", onQuestion);
    socket.off("interview:complete",  onComplete);
    socket.on("interview:question",   onQuestion);
    socket.on("interview:complete",   onComplete);

    if (socket.connected) socket.emit("join_interview", { interviewId });

    const onReconnect = () => socket.emit("join_interview", { interviewId });
    socket.on("connect", onReconnect);

    return () => {
      socket.off("connect",            onReconnect);
      socket.off("interview:question", onQuestion);
      socket.off("interview:complete",  onComplete);
    };
  }, [interviewId, showGate]);

  /* ─────────────────────────────────────────────
     MEDIA PERMISSIONS
  ───────────────────────────────────────────── */

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((stream) => {
        userStreamRef.current = stream;
        setMicPermission(true);
        setCamPermission(true);
      })
      .catch((err) => console.error("[media]", err));

    return () => {
      try { userStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    if (userVideoRef.current && userStreamRef.current) {
      userVideoRef.current.srcObject = userStreamRef.current;
    }
  }, [micPermission, camOn]);

  /* ─────────────────────────────────────────────
     SUBMIT ANSWER
  ───────────────────────────────────────────── */

  const submitAnswer = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (trimmed === lastAnswerRef.current) return;
      if (answerThrottleRef.current) return;

      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const issuePolicyWarning = (message: string) => {
        const nextCount = policyWarningCountRef.current + 1;
        const isTerminal = nextCount >= 2;

        policyWarningCountRef.current = nextCount;
        setPolicyWarningCount(nextCount);

        addMessage({
          id: Date.now(),
          role: "ai",
          text: isTerminal
            ? `${message} This was your second warning. This official interview is now ending as a policy violation. Continued misconduct can lead to a ban.`
            : `${message} This is warning ${nextCount} of 2. If you repeat this, the interview will end and your account can be banned.`,
          time: now,
        });
        setInput("");

        if (isTerminal) {
          setTimeout(() => endSessionRef.current(false, "policy_violation"), 1200);
        }
      };

      if (containsNonEnglishScript(trimmed)) {
        issuePolicyWarning("This is an official interview. You must answer only in English.");
        return;
      }

      if (containsAbusiveLanguage(trimmed)) {
        issuePolicyWarning("This is an official interview. Abusive or harsh language is not allowed. Speak professionally.");
        return;
      }

      lastAnswerRef.current = trimmed;
      answerThrottleRef.current = setTimeout(() => {
        answerThrottleRef.current = null;
      }, 2000);

      addMessage({ id: Date.now(), role: "user", text: trimmed, time: now });
      setInput("");

      const analytics = computeAnswerAnalytics({
        text: trimmed,
        speechStartedAt: answerSpeechStartedAtRef.current,
        questionAskedAt: currentQuestionAskedAtRef.current,
        aiFinishedAt: aiFinishedSpeakingAtRef.current,
        interruptions: currentAnswerInterruptionRef.current,
      });
      analytics.voice_risk_score = voiceRiskScoreRef.current;
      analytics.suspected_help_events = suspectedHelpEventsRef.current;
      analytics.camera_integrity_status = faceStatus;
      answerSpeechStartedAtRef.current = null;
      currentAnswerInterruptionRef.current = 0;

      if (!endLockRef.current) {
        getSocket().emit("submit_answer", {
          interviewId,
          answer: { text: trimmed, analytics },
        });
      }

      setAiSpeaking(true);
    },
    [addMessage, interviewId, faceStatus],
  );

  /* ─────────────────────────────────────────────
     SPEECH TO TEXT  (Problem 1 + Problem 3)

     onSpeechStart  — fires the instant the browser detects ANY sound.
                      If AI is speaking at that moment:
                        1. Pause + reset AI audio immediately (interrupt)
                        2. Increment the interruptionCount (negative signal)
                        3. Emit the count to the socket for backend logging

     onFinalMessage — fires only after `silenceThresholdMs` (3 s) of silence.
                      Receives the FULL accumulated answer, not just the last chunk.
  ───────────────────────────────────────────── */

  const aiSpeakingRef = useRef(aiSpeaking);
  useEffect(() => { aiSpeakingRef.current = aiSpeaking; }, [aiSpeaking]);

  const { transcript, isListening, startListening, stopListening, abortListening } =
    useSpeechToText({
      silenceThresholdMs: 3000,

      onSpeechStart: useCallback(() => {
        if (answerSpeechStartedAtRef.current === null) {
          answerSpeechStartedAtRef.current = Date.now();
        }
        if (faceStatus === "multiple" || faceStatus === "identity-risk") {
          suspectedHelpEventsRef.current += 1;
          voiceRiskScoreRef.current = Math.min(100, voiceRiskScoreRef.current + 20);
          if (Date.now() - helpCooldownRef.current > 6000) {
            helpCooldownRef.current = Date.now();
            issueIntegrityWarning(
              faceStatus === "multiple"
                ? "We detected speech while more than one person was visible. Outside help is not allowed."
                : "We detected speech after a candidate identity change. The original candidate must remain on camera."
            );
          }
        } else if (faceStatus === "moved") {
          voiceRiskScoreRef.current = Math.min(100, voiceRiskScoreRef.current + 8);
        }
        // Only count as interruption if AI was actually speaking
        if (!aiSpeakingRef.current) return;

        // 1. Stop AI audio immediately
        if (aiAudioRef.current) {
          aiAudioRef.current.pause();
          aiAudioRef.current.currentTime = 0;
        }
        setAiSpeaking(false);

        // 2. Track interruption
        interruptionCountRef.current += 1;
        const count = interruptionCountRef.current;
        currentAnswerInterruptionRef.current += 1;
        setInterruptionCount(count);

        // 3. Notify backend in real-time so it's logged even if session ends mid-interview
        try {
          getSocket().emit("interview:interruption", {
            interviewId,
            count,
            timestamp: Date.now(),
          });
        } catch (e) {
          console.warn("[interruption] socket emit failed:", e);
        }
      }, [interviewId, faceStatus, issueIntegrityWarning]),

      // Receives the FULL accumulated answer after 3 s of silence
      onFinalMessage: submitAnswer,
    });

  // Keep abortListening ref fresh for endSession
  useEffect(() => { abortListeningRef.current = abortListening; }, [abortListening]);

  // Sync transcript into the textarea
  useEffect(() => { if (transcript) setInput(transcript); }, [transcript]);

  useEffect(() => {
    if (!userStreamRef.current || isEnding || !sessionRunning) return;

    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const audioContext = new AudioCtx();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;
    const source = audioContext.createMediaStreamSource(userStreamRef.current);
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let frameId: number | null = null;
    let suspiciousFrames = 0;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((sum, value) => sum + value, 0) / Math.max(data.length, 1);
      const loud = avg > 38;
      const cameraCompromised = faceStatus === "multiple" || faceStatus === "identity-risk";

      if (loud && cameraCompromised) {
        suspiciousFrames += 1;
      } else {
        suspiciousFrames = Math.max(0, suspiciousFrames - 1);
      }

      if (loud) {
        voiceRiskScoreRef.current = Math.min(
          100,
          voiceRiskScoreRef.current + (cameraCompromised ? 0.9 : 0.18),
        );
      }

      if (suspiciousFrames >= 8 && Date.now() - helpCooldownRef.current > 9000) {
        suspiciousFrames = 0;
        helpCooldownRef.current = Date.now();
        suspectedHelpEventsRef.current += 1;
        issueIntegrityWarning("We detected sustained audio activity while camera integrity was compromised. Outside assistance is not allowed.");
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => {});
    };
  }, [faceStatus, issueIntegrityWarning, isEnding, sessionRunning]);

  /* ── Start / stop listening based on mic toggle and AI speaking state ── */
  useEffect(() => {
    if (showGate) return;
    if (micOn && !aiSpeaking) {
      startListening();
    } else {
      // When AI starts speaking we stop the recogniser entirely so there's
      // no accidental capture of the AI's own voice (echo). The `onSpeechStart`
      // callback will re-enable it the moment the user speaks.
      stopListening();
    }
    return () => { stopListening(); };
  }, [micOn, aiSpeaking, showGate, startListening, stopListening]);

  /* ─────────────────────────────────────────────
     RECORDING
  ───────────────────────────────────────────── */

  const startRecording = useCallback(() => {
    if (!userStreamRef.current || isRecordingRef.current) return;
    try {
      isRecordingRef.current = true;
      const stream       = userStreamRef.current;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const mixedDest = audioContext.createMediaStreamDestination();
      audioContext.createMediaStreamSource(stream).connect(mixedDest);

      if (aiAudioRef.current && !aiSourceCreatedRef.current) {
        const aiSource = audioContext.createMediaElementSource(aiAudioRef.current);
        aiSource.connect(mixedDest);
        aiSource.connect(audioContext.destination);
        aiSourceCreatedRef.current = true;
      }

      const mixedStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...mixedDest.stream.getAudioTracks(),
      ]);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

      const recorder = new MediaRecorder(mixedStream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current   = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const fd   = new FormData();
        fd.append("file", blob, "recording.webm");
        fd.append("interviewId", interviewId);
        await fetch("/api/save-recording", { method: "POST", body: fd });
      };

      recorder.start(1000);
    } catch (err) {
      console.error("[recording]", err);
      isRecordingRef.current = false;
    }
  }, [interviewId]);

  useEffect(() => {
    if (micPermission && camPermission && !isRecordingRef.current) startRecording();
  }, [micPermission, camPermission, startRecording]);

  /* ─────────────────────────────────────────────
     CHAT SCROLL
  ───────────────────────────────────────────── */

  const liveTranscript = transcript.trim();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveTranscript, aiSpeaking]);

  const sendMessage = () => { submitAnswer(input); };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const showFaceBanner =
    camOn && camPermission && modelsReady && faceStatus !== "ok" && !showFaceModal;

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */

  return (
    <>
      <div className="noise" />

      {showGate && <FullscreenGate onEnter={handleGateEnter} />}

      {!showGate && showFsWarning && (
        <FullscreenWarningModal count={fsWarningCount} onReenter={handleReenterFullscreen} />
      )}

      {showFaceModal && (
        <FaceViolationModal
          status={faceStatus}
          countdown={faceCountdown}
          onDismiss={handleDismissFaceModal}
        />
      )}

      {showTabWarning && (
        <TabSwitchWarningModal count={tabSwitchCount} onDismiss={handleDismissTabWarning} />
      )}

      <div className="interview-root">
        {/* ── TOPBAR ─────────────────────────────────────────────────────── */}
        <header className="interview-topbar">
          <div className="topbar-left">
            <Link href="/dashboard" className="topbar-logo">
              Interview<span>AI</span>
            </Link>
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
              <span className="timer">{timerDisplay}</span>
            </div>
          </div>

          <div className="topbar-right">
            {/* Fullscreen toggle */}
            <button
              onClick={() =>
                isFullscreen
                  ? (() => {
                      suppressFsExitRef.current = true;
                      document.exitFullscreen().catch(() => { });
                    })()
                  : enterFullscreen()
              }
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              style={{
                display: "flex", alignItems: "center", gap: "5px",
                padding: "4px 10px", borderRadius: "99px",
                background: isFullscreen ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${isFullscreen ? "rgba(139,92,246,0.35)" : "rgba(255,255,255,0.1)"}`,
                color: isFullscreen ? "#a78bfa" : "#6b7280",
                fontSize: "12px", fontWeight: 600, cursor: "pointer",
              }}
            >
              {isFullscreen
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              }
              {isFullscreen ? "Exit FS" : "Fullscreen"}
            </button>

            {/* FS exit counter */}
            {fsWarningCount > 0 && !isEnding && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "99px", background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", fontSize: "12px", color: "#a78bfa", fontWeight: 600 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                FS exits: {fsWarningCount}/2
              </div>
            )}

            {/* Tab switch counter */}
            {tabSwitchCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "99px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", fontSize: "12px", color: "#f59e0b", fontWeight: 600 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Tab switches: {tabSwitchCount}/2
              </div>
            )}
            {policyWarningCount > 0 && !isEnding && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "99px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: "12px", color: "#ef4444", fontWeight: 600 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Policy warnings: {policyWarningCount}/2
              </div>
            )}
            {integrityWarningCount > 0 && !isEnding && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "99px", background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.3)", fontSize: "12px", color: "#fb923c", fontWeight: 600 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M3 12a9 9 0 1118 0 9 9 0 01-18 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Integrity warnings: {integrityWarningCount}/2
              </div>
            )}

            {/* Face violation indicator */}
            {modelsReady && faceStatus !== "ok" && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "99px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: "12px", color: "#ef4444", fontWeight: 600 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {faceStatus === "multiple"
                  ? `${faceCount} faces`
                  : faceStatus === "identity-risk"
                    ? "Identity risk"
                    : faceStatus === "moved"
                      ? "Moved off position"
                      : "No face"}
              </div>
            )}

            {/* Interruption badge — NEW */}
            <InterruptionBadge count={interruptionCount} />

            <button
              className="btn-end-session"
              onClick={() => endSession(false, "user_ended")}
              disabled={isEnding}
            >
              {isEnding ? "Ending…" : "End Session"}
            </button>
          </div>
        </header>

        {/* ── BODY ───────────────────────────────────────────────────────── */}
        <div className="interview-body">
          {/* ── VIDEO AREA ──────────────────────────────────────────────── */}
          <div className="video-area">
            {/* AI video card */}
            <div className={`vid-card vid-ai${aiSpeaking ? " speaking" : ""}`}>
              <div className="vid-inner">
                <div className="vid-placeholder vid-placeholder-ai">
                  <div className="vid-avatar-ring">
                    <div className="vid-avatar"><audio ref={aiAudioRef} /></div>
                  </div>
                  <div className="vid-circuit">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="circuit-line" style={{ animationDelay: `${i * 0.4}s` }} />
                    ))}
                  </div>
                </div>
                <div className="vid-speaking-bar">
                  <WaveBars active={aiSpeaking} />
                  <span className="vid-speaking-label">
                    {aiSpeaking ? "AI is speaking…" : "Listening"}
                  </span>
                </div>
              </div>
              <div className="vid-nametag">
                <span className="dot-accent-static" />
                <span className="vid-name">Interviewer</span>
              </div>
            </div>

            {/* User video card */}
            <div
              className={`vid-card vid-user${!camOn ? " cam-off" : ""}`}
              style={{ position: "relative" }}
            >
              {showFaceBanner && <FaceStatusBanner status={faceStatus as Exclude<FaceStatus, "ok">} />}
              <div className="vid-inner">
                {camOn && micPermission ? (
                  <div className="vid-placeholder vid-placeholder-user">
                    <div className="vid-avatar-user">
                      <video ref={userVideoRef} autoPlay muted playsInline />
                    </div>
                    {[...Array(8)].map((_, i) => (
                      <div
                        key={i}
                        className="bokeh"
                        style={{ left: `${10 + i * 11}%`, top: `${20 + (i % 3) * 25}%`, animationDelay: `${i * 0.3}s`, zIndex: 0 }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="cam-off-state h-full! flex! items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.5 10.5A2 2 0 0013.5 13.5M9 5h7l2 2h3v12H9m-5-5V7h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    <span>Camera off</span>
                  </div>
                )}
              </div>
              <div className="vid-nametag">
                <span className="dot-accent-static dot-user" />
                <span className="vid-name"></span>
                <span className="tag tag-sky">You</span>
                {/* Live mic indicator */}
                {isListening && micOn && !aiSpeaking && (
                  <span style={{
                    marginLeft: "6px", fontSize: "10px", color: "#22c55e",
                    fontWeight: 600, display: "flex", alignItems: "center", gap: "4px",
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: "#22c55e",
                      animation: "pulse 1s ease infinite",
                      display: "inline-block",
                    }} />
                    Listening
                  </span>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="controls-bar">
              <button
                className={`ctrl-btn${!micOn ? " ctrl-off" : ""}`}
                onClick={() => setMicOn((p) => !p)}
              >
                {micOn ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M9 9v5a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.94-.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M17 16.95A7 7 0 015 10M12 19v3M9 22h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                )}
                <span>{micOn ? "Mute" : "Unmute"}</span>
              </button>
              <button
                className={`ctrl-btn${!camOn ? " ctrl-off" : ""}`}
                onClick={() => setCamOn((v) => !v)}
              >
                {camOn ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.5 8.5H13a2 2 0 012 2v.5m1 4.47V16a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h.5M15 10l4.553-2.276A1 1 0 0121 8.723v6.554" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                )}
                <span>{camOn ? "Camera" : "No cam"}</span>
              </button>
              <button
                className="ctrl-btn ctrl-btn-end"
                onClick={() => endSession(false, "user_ended")}
                disabled={isEnding}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6.827 6.175A8 8 0 0117.173 17.173M12 6v6l4 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M3.05 11a9 9 0 1017.9 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                <span>End</span>
              </button>
            </div>
          </div>

          {/* ── CHAT PANEL ──────────────────────────────────────────────── */}
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
                  {m.role === "ai" && <div className="chat-msg-avatar chat-msg-avatar-ai">AI</div>}
                  <div className="chat-msg-body">
                    <div className="chat-bubble">{m.text}</div>
                    <div className="chat-time">{m.time}</div>
                  </div>
                  {m.role === "user" && <div className="chat-msg-avatar chat-msg-avatar-user">AR</div>}
                </div>
              ))}

              {liveTranscript && !aiSpeaking && (
                <div className="chat-msg chat-msg-user">
                  <div className="chat-msg-body">
                    <div className="chat-bubble" style={{ opacity: 0.85 }}>
                      {liveTranscript}
                    </div>
                    <div className="chat-time">Speaking…</div>
                  </div>
                  <div className="chat-msg-avatar chat-msg-avatar-user">AR</div>
                </div>
              )}

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
                  <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
