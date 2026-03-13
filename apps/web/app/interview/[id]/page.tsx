"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import "../style.css";
import { useParams, useRouter } from "next/navigation";
import { useSpeechToText } from "@/hooks/useSpeechHook";
import { getSocket } from "@/ws-client-config/socket";
import { useInterviewStore } from "@/store/useInterviewStore";

/* ---------------------- TIMER ---------------------- */

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

/* ---------------------- WAVE BARS ---------------------- */

function WaveBars({ active }: { active: boolean }) {
  return (
    <div className={`wave-bars${active ? " wave-active" : ""}`}>
      {[...Array(5)].map((_, i) => (
        <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

/* ---------------------- FULLSCREEN GATE ---------------------- */

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

/* ---------------------- FULLSCREEN WARNING MODAL ---------------------- */

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

/* ---------------------- TAB SWITCH WARNING MODAL ---------------------- */

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

/* ---------------------- FACE VIOLATION MODAL ---------------------- */

function FaceViolationModal({ status, countdown, onDismiss }: { status: "no-face" | "multiple"; countdown: number; onDismiss: () => void }) {
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
        <h2 style={{ textAlign: "center", margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#ef4444" }}>{isMultiple ? "Multiple People Detected" : "No Face Detected"}</h2>
        <p style={{ textAlign: "center", margin: "0 0 28px", fontSize: "14px", lineHeight: "1.7", color: "#9ca3af" }}>
          {isMultiple ? "Only you should be visible. Please ask others to move away or reposition your camera." : "Your face is not visible. Please move into the camera frame."}
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

/* ---------------------- FACE STATUS BANNER ---------------------- */

function FaceStatusBanner({ status }: { status: "no-face" | "multiple" }) {
  const isMultiple = status === "multiple";
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", background: isMultiple ? "rgba(239,68,68,0.9)" : "rgba(245,158,11,0.9)", backdropFilter: "blur(6px)", fontSize: "11px", fontWeight: 600, color: "#fff", borderTopLeftRadius: "inherit", borderTopRightRadius: "inherit" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        {isMultiple ? <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 11a4 4 0 100-8 4 4 0 000 8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {isMultiple ? "Multiple people visible — adjust camera" : "No face detected — please stay in frame"}
    </div>
  );
}

/* ---------------------- FACE DETECTION HOOK ---------------------- */

type FaceStatus = "ok" | "no-face" | "multiple";

function useFaceDetection(videoRef: React.RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const [status, setStatus] = useState<FaceStatus>("ok");
  const [count, setCount] = useState(1);
  const [modelsReady, setModelsReady] = useState(false);
  const badFrames = useRef(0);
  const statusRef = useRef<FaceStatus>("ok");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const POLL_MS = 600;
  const GRACE_FRAMES = 3;

  useEffect(() => {
    import("face-api.js").then((faceapi) => {
      faceapi.nets.tinyFaceDetector.loadFromUri("/models")
        .then(() => setModelsReady(true))
        .catch((err) => console.warn("[face-api] Load failed:", err));
    });
  }, []);

  useEffect(() => {
    if (!modelsReady || !enabled) {
      badFrames.current = 0; statusRef.current = "ok"; setStatus("ok"); return;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.paused || video.videoWidth === 0) return;
      try {
        const faceapi = await import("face-api.js");
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
        const canvas = canvasRef.current;
        if (canvas.width !== vw || canvas.height !== vh) { canvas.width = vw; canvas.height = vh; }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, vw, vh);
        const detections = await faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }));
        if (cancelled) return;
        const n = detections.length;
        setCount(n);
        const raw: FaceStatus = n === 0 ? "no-face" : n > 1 ? "multiple" : "ok";
        if (raw !== "ok") {
          badFrames.current += 1;
          if (badFrames.current >= GRACE_FRAMES && statusRef.current !== raw) { statusRef.current = raw; setStatus(raw); }
        } else {
          badFrames.current = 0;
          if (statusRef.current !== "ok") { statusRef.current = "ok"; setStatus("ok"); }
        }
      } catch { /* swallow */ }
    };
    const intervalId = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(intervalId); badFrames.current = 0; statusRef.current = "ok"; };
  }, [modelsReady, enabled, videoRef]);

  return { status, count, modelsReady };
}

/* ---------------------- MAIN PAGE ---------------------- */

export default function InterviewPage() {
  const router = useRouter();
  const params = useParams();
  const interviewId = params.id as string;

  const [input, setInput] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [sessionRunning, setSessionRunning] = useState(true);
  const [isEnding, setIsEnding] = useState(false);

  const endLockRef = useRef(false);

  // ── Fullscreen state ──────────────────────────────────
  const [showGate, setShowGate] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsWarningCount, setFsWarningCount] = useState(0);
  const [showFsWarning, setShowFsWarning] = useState(false);
  const fsWarningCountRef = useRef(0);
  const hasEnteredFsOnce = useRef(false);
  const suppressFsExitRef = useRef(false);

  // ── Tab switch state ──────────────────────────────────
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const tabSwitchCountRef = useRef(0);

  // ── Face modal state ──────────────────────────────────
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [faceCountdown, setFaceCountdown] = useState(15);
  const faceCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Media / recording refs ────────────────────────────
  const chatEndRef = useRef<HTMLDivElement>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const aiAudioRef = useRef<HTMLAudioElement>(null);
  const userStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isRecordingRef = useRef(false);
  const aiSourceCreatedRef = useRef(false);
  const lastQuestionRef = useRef<string>("");

  const [micPermission, setMicPermission] = useState(false);
  const [camPermission, setCamPermission] = useState(false);

  const timer = useTimer(sessionRunning);

  const { status: faceStatus, count: faceCount, modelsReady } = useFaceDetection(
    userVideoRef,
    camOn && camPermission && sessionRunning && !isEnding,
  );

  const { addMessage, messages, reset } = useInterviewStore();

  const handleQuestionRef = useRef<(data: any) => void>(() => {});
  const endSessionRef = useRef<(fromBackend?: boolean) => void>(() => {});

  /* ---------------------- END SESSION ---------------------- */

  const endSession = useCallback(
    async (fromBackend = false) => {
      if (endLockRef.current) return;
      endLockRef.current = true;

      if (isEnding) return;

      setIsEnding(true);
      setSessionRunning(false);
      setAiSpeaking(false);
      setShowFaceModal(false);
      setShowTabWarning(false);
      setShowFsWarning(false);

      if (faceCountdownRef.current) clearInterval(faceCountdownRef.current);

      try {
        if (isRecordingRef.current && recorderRef.current) {
          recorderRef.current.stop();
          isRecordingRef.current = false;
        }
      } catch {}

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      try {
        userStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}

      if (document.fullscreenElement) {
        suppressFsExitRef.current = true;
        try { await document.exitFullscreen(); } catch {}
      }

      if (!fromBackend) {
        try { getSocket().emit("interview:end", { interviewId }); } catch {}
      }

      try {
        await fetch(`http://localhost:4000/api/interview/${interviewId}/complete`, {
          method: "POST",
          credentials: "include",
        });
      } catch (e) {
        console.error("[persist]", e);
      }

      reset();
      router.push(`/feedback/${interviewId}/`);
    },
    [interviewId, router, reset, isEnding],
  );

  useEffect(() => { endSessionRef.current = endSession; }, [endSession]);

  /* ---------------------- FULLSCREEN ---------------------- */

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
      if (n >= 2) setTimeout(() => endSessionRef.current(false), 800);
    };

    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [isEnding, sessionRunning]);

  const handleReenterFullscreen = useCallback(async () => {
    if (fsWarningCountRef.current >= 2) { endSessionRef.current(false); return; }
    setShowFsWarning(false);
    await enterFullscreen();
  }, [enterFullscreen]);

  /* ---------------------- FACE MODAL ---------------------- */

  useEffect(() => {
    if (!modelsReady || isEnding || !sessionRunning) return;
    if (faceStatus !== "ok" && !showFaceModal) { setFaceCountdown(15); setShowFaceModal(true); }
    if (faceStatus === "ok" && showFaceModal) {
      if (faceCountdownRef.current) clearInterval(faceCountdownRef.current);
      setShowFaceModal(false); setFaceCountdown(15);
    }
  }, [faceStatus, modelsReady, isEnding, sessionRunning, showFaceModal]);

  useEffect(() => {
    if (!showFaceModal) return;
    faceCountdownRef.current = setInterval(() => {
      setFaceCountdown((prev) => {
        if (prev <= 1) { clearInterval(faceCountdownRef.current!); endSessionRef.current(false); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (faceCountdownRef.current) clearInterval(faceCountdownRef.current); };
  }, [showFaceModal]);

  const handleDismissFaceModal = useCallback(() => {
    if (faceCountdownRef.current) clearInterval(faceCountdownRef.current);
    setShowFaceModal(false); setFaceCountdown(15);
  }, []);

  /* ---------------------- TAB SWITCH ---------------------- */

  useEffect(() => {
    const handle = () => {
      if (document.visibilityState !== "hidden" || isEnding) return;
      tabSwitchCountRef.current += 1;
      const n = tabSwitchCountRef.current;
      setTabSwitchCount(n); setShowTabWarning(true);
      if (n >= 2) setTimeout(() => endSessionRef.current(false), 800);
    };
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, [isEnding]);

  const handleDismissTabWarning = useCallback(() => {
    if (tabSwitchCountRef.current >= 2) endSessionRef.current(false);
    else setShowTabWarning(false);
  }, []);

  /* ---------------------- TTS ---------------------- */

  const playAIAudio = useCallback(async (text: string) => {
    if (!aiAudioRef.current || showGate) return;

    try {
      setAiSpeaking(true);

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "alloy" }),
      });

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      aiAudioRef.current.src = url;
      await aiAudioRef.current.play();

      aiAudioRef.current.onended = () => {
        setAiSpeaking(false);
        URL.revokeObjectURL(url);
      };
    } catch (err) {
      console.error("[TTS]", err);
      setAiSpeaking(false);
    }
  }, [showGate]);

  /* ---------------------- SOCKET ---------------------- */

  const handleQuestion = useCallback(
    (data: { question: string; index: number; difficulty: string; time?: number }) => {
      if (!data?.question || data.question === lastQuestionRef.current) return;
      lastQuestionRef.current = data.question;

      const now = data.time
        ? new Date(data.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      addMessage({ id: Date.now(), role: "ai", text: data.question, time: now });
      playAIAudio(data.question);
    },
    [addMessage, playAIAudio],
  );

  useEffect(() => { handleQuestionRef.current = handleQuestion; }, [handleQuestion]);

  useEffect(() => {
    if (showGate) return;

    const socket = getSocket();
    const onQuestion = (data: any) => handleQuestionRef.current(data);
    const onComplete = () => endSessionRef.current(true);

    socket.on("interview:question", onQuestion);
    socket.on("interview:complete", onComplete);
    socket.emit("join_interview", { interviewId });

    return () => {
      socket.off("interview:question", onQuestion);
      socket.off("interview:complete", onComplete);
    };
  }, [interviewId, showGate]);

  /* ---------------------- MEDIA PERMISSIONS ---------------------- */

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
      try { userStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    };
  }, []);

  useEffect(() => {
    if (userVideoRef.current && userStreamRef.current) {
      userVideoRef.current.srcObject = userStreamRef.current;
    }
  }, [micPermission, camOn]);

  /* ---------------------- SPEECH ---------------------- */

  const { transcript, startListening, stopListening } = useSpeechToText(
    (finalText) => {
      if (!finalText.trim()) return;

      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      addMessage({ id: Date.now(), role: "user", text: finalText, time: now });
      setInput("");

      if (!endLockRef.current) {
        getSocket().emit("submit_answer", { interviewId, answer: finalText });
      }

      setAiSpeaking(true);
    },
  );

  const startListeningRef = useRef(startListening);
  const stopListeningRef = useRef(stopListening);
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);
  useEffect(() => { stopListeningRef.current = stopListening; }, [stopListening]);

  useEffect(() => { if (transcript) setInput(transcript); }, [transcript]);

  useEffect(() => {
    if (showGate) return;
    if (micOn && !aiSpeaking) startListeningRef.current();
    else stopListeningRef.current();
    return () => { stopListeningRef.current(); };
  }, [micOn, aiSpeaking, showGate]);

  /* ---------------------- RECORDING ---------------------- */

  const startRecording = useCallback(() => {
    if (!userStreamRef.current || isRecordingRef.current) return;
    try {
      isRecordingRef.current = true;
      const stream = userStreamRef.current;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const mixedDest = audioContext.createMediaStreamDestination();
      audioContext.createMediaStreamSource(stream).connect(mixedDest);
      if (aiAudioRef.current && !aiSourceCreatedRef.current) {
        const aiSource = audioContext.createMediaElementSource(aiAudioRef.current);
        aiSource.connect(mixedDest); aiSource.connect(audioContext.destination);
        aiSourceCreatedRef.current = true;
      }
      const mixedStream = new MediaStream([...stream.getVideoTracks(), ...mixedDest.stream.getAudioTracks()]);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const recorder = new MediaRecorder(mixedStream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const fd = new FormData();
        fd.append("file", blob, "recording.webm");
        fd.append("interviewId", interviewId);
        await fetch("/api/save-recording", { method: "POST", body: fd });
      };
      recorder.start(1000);
    } catch (err) { console.error("[recording]", err); isRecordingRef.current = false; }
  }, [interviewId]);

  useEffect(() => {
    if (micPermission && camPermission && !isRecordingRef.current) startRecording();
  }, [micPermission, camPermission, startRecording]);

  /* ---------------------- CHAT ---------------------- */

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;

    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    addMessage({ id: Date.now(), role: "user", text, time: now });
    setInput("");

    if (!endLockRef.current) {
      getSocket().emit("submit_answer", { interviewId, answer: text });
    }

    setAiSpeaking(true);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const showFaceBanner = camOn && camPermission && modelsReady && faceStatus !== "ok" && !showFaceModal;

  /* ---------------------- RENDER ---------------------- */

  return (
    <>
      <div className="noise" />

      {/* One-click fullscreen gate */}
      {showGate && <FullscreenGate onEnter={handleGateEnter} />}

      {/* Fullscreen exit warnings */}
      {!showGate && showFsWarning && (
        <FullscreenWarningModal count={fsWarningCount} onReenter={handleReenterFullscreen} />
      )}

      {showFaceModal && (
        <FaceViolationModal status={faceStatus as "no-face" | "multiple"} countdown={faceCountdown} onDismiss={handleDismissFaceModal} />
      )}
      {showTabWarning && (
        <TabSwitchWarningModal count={tabSwitchCount} onDismiss={handleDismissTabWarning} />
      )}

      <div className="interview-root">
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
              <span className="timer">{timer}</span>
            </div>
          </div>

          <div className="topbar-right">
            {/* Manual fullscreen toggle */}
            <button
              onClick={() =>
                isFullscreen
                  ? (() => { suppressFsExitRef.current = true; document.exitFullscreen().catch(() => {}); })()
                  : enterFullscreen()
              }
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "99px", background: isFullscreen ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.06)", border: `1px solid ${isFullscreen ? "rgba(139,92,246,0.35)" : "rgba(255,255,255,0.1)"}`, color: isFullscreen ? "#a78bfa" : "#6b7280", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              {isFullscreen
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              }
              {isFullscreen ? "Exit FS" : "Fullscreen"}
            </button>

            {fsWarningCount > 0 && !isEnding && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "99px", background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", fontSize: "12px", color: "#a78bfa", fontWeight: 600 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                FS exits: {fsWarningCount}/2
              </div>
            )}
            {tabSwitchCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "99px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", fontSize: "12px", color: "#f59e0b", fontWeight: 600 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Tab switches: {tabSwitchCount}/2
              </div>
            )}
            {modelsReady && faceStatus !== "ok" && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "99px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: "12px", color: "#ef4444", fontWeight: 600 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {faceStatus === "multiple" ? `${faceCount} faces` : "No face"}
              </div>
            )}
            <div className="score-preview">
              <span className="score-preview-label">Score</span>
              <span className="score-preview-value score-high">78</span>
            </div>
            <button className="btn-end-session" onClick={() => endSession(false)} disabled={isEnding}>
              {isEnding ? "Ending…" : "End Session"}
            </button>
          </div>
        </header>

        <div className="interview-body">
          <div className="video-area">
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
                  <span className="vid-speaking-label">{aiSpeaking ? "AI is speaking…" : "Listening"}</span>
                </div>
              </div>
              <div className="vid-nametag">
                <span className="dot-accent-static" />
                <span className="vid-name">Interviewer</span>
              </div>
            </div>

            <div className={`vid-card vid-user${!camOn ? " cam-off" : ""}`} style={{ position: "relative" }}>
              {showFaceBanner && <FaceStatusBanner status={faceStatus as "no-face" | "multiple"} />}
              <div className="vid-inner">
                {camOn && micPermission ? (
                  <div className="vid-placeholder vid-placeholder-user">
                    <div className="vid-avatar-user">
                      <video ref={userVideoRef} autoPlay muted playsInline />
                    </div>
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="bokeh" style={{ left: `${10 + i * 11}%`, top: `${20 + (i % 3) * 25}%`, animationDelay: `${i * 0.3}s`, zIndex: 0 }} />
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
              </div>
            </div>

            <div className="controls-bar">
              <button className={`ctrl-btn${!micOn ? " ctrl-off" : ""}`} onClick={() => setMicOn((p) => !p)}>
                {micOn ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M9 9v5a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.94-.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M17 16.95A7 7 0 015 10M12 19v3M9 22h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                )}
                <span>{micOn ? "Mute" : "Unmute"}</span>
              </button>
              <button className={`ctrl-btn${!camOn ? " ctrl-off" : ""}`} onClick={() => setCamOn((v) => !v)}>
                {camOn ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.5 8.5H13a2 2 0 012 2v.5m1 4.47V16a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h.5M15 10l4.553-2.276A1 1 0 0121 8.723v6.554" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                )}
                <span>{camOn ? "Camera" : "No cam"}</span>
              </button>
              <button className="ctrl-btn ctrl-btn-end" onClick={() => endSession(false)} disabled={isEnding}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6.827 6.175A8 8 0 0117.173 17.173M12 6v6l4 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M3.05 11a9 9 0 1017.9 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                <span>End</span>
              </button>
            </div>
          </div>

          <aside className="chat-panel">
            <div className="chat-header">
              <div className="chat-header-left"><span className="chat-icon">◎</span><span className="chat-title">Transcript</span></div>
              <span className="chat-count">{messages.length} msgs</span>
            </div>
            <div className="chat-messages">
              {messages.map((m, i) => (
                <div key={m.id} className={`chat-msg chat-msg-${m.role}`} style={{ animationDelay: `${i * 40}ms` }}>
                  {m.role === "ai" && <div className="chat-msg-avatar chat-msg-avatar-ai">AI</div>}
                  <div className="chat-msg-body">
                    <div className="chat-bubble">{m.text}</div>
                    <div className="chat-time">{m.time}</div>
                  </div>
                  {m.role === "user" && <div className="chat-msg-avatar chat-msg-avatar-user">AR</div>}
                </div>
              ))}
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
              <button className="chat-send-btn" onClick={sendMessage} disabled={!input.trim()} aria-label="Send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}