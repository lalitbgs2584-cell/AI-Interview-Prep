/**
 * ============================================================================
 * INTERVIEW PAGE - Main Component
 * ============================================================================
 * 
 * This is the simplified entry point for the interview page.
 * All complex logic has been extracted into specialized modules.
 * 
 * Responsibilities:
 *  - Page orchestration
 *  - Main layout structure
 *  - Coordinate between different feature modules
 * 
 * ============================================================================
 */

"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

// Feature modules

import { useSpeechToText } from "@/hooks/useSpeechHook";
import { useInterviewStore } from "@/store/useInterviewStore";

// Components



// Utilities

import "../style.css";
import { useFullscreenManager } from "@/hooks/useFullscreenManager";
import { useTabSwitchDetection } from "@/hooks/useTabSwitchDetection";
import { useFaceDetectionManager } from "@/hooks/useFaceDetectionManager";
import { useIdentityVerificationManager } from "@/hooks/useIdentityVerificationManager";
import { useMediaManager } from "@/hooks/useMediaManager";
import { AnswerAnalyticsBuilder } from "@/components/interview/anwerAnalyticsBuilder";
import { InterviewSocketManager } from "@/components/interview/InterviewSocketManager";
import InterviewTopbar from "@/components/interview/InterviewTopbar";
import VideoArea from "@/components/interview/videoArea";
import ChatPanel from "@/components/interview/chatPanel";
import { FullscreenGate } from "@/modals/FullscreenGate";
import { FullscreenWarningModal } from "@/modals/FullscreenWarningModal";
import { FaceViolationModal } from "@/modals/FaceViolationModal";
import { IdentityMismatchModal } from "@/modals/IdentityMismatchModal";
import { TabSwitchWarningModal } from "@/modals/TabSwitchWarningModal";

type EndReason = "completed" | "user_ended" | "fullscreen" | "tab_switch" | "face_violation" | "identity_mismatch";

export default function InterviewPage() {
  const router = useRouter();
  const params = useParams();
  const interviewId = params.id as string;

  // ── State: UI Controls ──────────────────────────────────────────────
  const [input, setInput] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [sessionRunning, setSessionRunning] = useState(true);
  const [isEnding, setIsEnding] = useState(false);

  // ── State: Gates & Modals ──────────────────────────────────────────
  const [showGate, setShowGate] = useState(true);

  // ── Refs: Control ──────────────────────────────────────────────────
  const endLockRef = useRef(false);
  const endReasonRef = useRef<EndReason>("user_ended");
  const endSessionRef = useRef<(fromBackend?: boolean, reason?: EndReason) => void>(() => { });

  // ── Refs: Media ────────────────────────────────────────────────────
  const chatEndRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const userVideoRef = useRef<HTMLVideoElement>(null) as React.RefObject<HTMLVideoElement>;
  const aiAudioRef = useRef<HTMLAudioElement>(null) as React.RefObject<HTMLAudioElement>;

  // ── Store ──────────────────────────────────────────────────────────
  const { addMessage, messages, reset } = useInterviewStore();

  // ── Feature Managers ───────────────────────────────────────────────
  const {
    isFullscreen,
    fsWarningCount,
    showFsWarning,
    handleGateEnter,
    handleReenterFullscreen,
  } = useFullscreenManager({
    showGate,
    isEnding,
    sessionRunning,
    onTerminate: (reason) => endSessionRef.current(false, reason),
  });

  const {
    tabSwitchCount,
    showTabWarning,
    handleDismissTabWarning,
  } = useTabSwitchDetection({
    isEnding,
    onTerminate: (reason) => endSessionRef.current(false, reason),
  });

  const {
    faceStatus,
    faceCount,
    modelsReady,
    showFaceModal,
    faceCountdown,
    faceViolationCount,
    handleDismissFaceModal,
  } = useFaceDetectionManager({
    videoRef: userVideoRef,
    enabled: camOn && sessionRunning && !isEnding,
    onTerminate: (reason) => endSessionRef.current(false, reason),
  });

  const {
    identityStatus,
    identityMismatchCount,
    showIdentityModal,
    identityCountdown,
    handleDismissIdentityModal,
  } = useIdentityVerificationManager({
    videoRef: userVideoRef,
    enabled: camOn && sessionRunning && !isEnding && !showGate,
    onTerminate: (reason) => endSessionRef.current(false, reason),
    checkIntervalMs: 1000,
    threshold: 0.5,
  });

  const {
    micPermission,
    camPermission,
    userStreamRef,
    micSampleBufferRef,
    startMicMeter,
    stopMicMeter,
  } = useMediaManager();

  // ── Utility Managers ───────────────────────────────────────────────

  const analyticsBuilder = useMemo(
    () => new AnswerAnalyticsBuilder(micSampleBufferRef),
    []
  );

  const socketManager = useMemo(
    () => new InterviewSocketManager(interviewId),
    [interviewId]
  );

  // ── Speech Recognition ─────────────────────────────────────────────
  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    abortListening,
  } = useSpeechToText({
    silenceThresholdMs: 3000,
    onSpeechStart: useCallback(() => {
      analyticsBuilder.recordFirstSpeech();
      if (aiSpeaking) {
        if (aiAudioRef.current) {
          aiAudioRef.current.pause();
          aiAudioRef.current.currentTime = 0;
        }
        setAiSpeaking(false);
        socketManager.emitInterruption();
      }
    }, [aiSpeaking, analyticsBuilder, socketManager]),
    onFinalMessage: useCallback((text: string) => {
      submitAnswer(text);
    }, []),
  });

  // ── Abort listening ref ────────────────────────────────────────────
  const abortListeningRef = useRef<() => void>(() => { });

  useEffect(() => {
    abortListeningRef.current = abortListening;
    return () => abortListeningRef.current?.();
  }, [abortListening]);

  // ── Update transcript input ────────────────────────────────────────
  useEffect(() => {
    if (transcript) setInput(transcript);
  }, [transcript]);

  // ── Auto-start/stop listening based on state ───────────────────────
  useEffect(() => {
    if (showGate) return;
    if (micOn && !aiSpeaking) {
      startListening();
    } else {
      stopListening();
    }
    return () => {
      stopListening();
    };
  }, [micOn, aiSpeaking, showGate, startListening, stopListening]);

  /**
   * Submit user's answer to the backend.
   * Builds analytics, stores in chat history, emits to socket.
   */
  const submitAnswer = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const now = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Add to chat history
      addMessage({ id: Date.now(), role: "user", text: trimmed, time: now });
      setInput("");

      // Build analytics from audio samples
      const analytics = analyticsBuilder.build(trimmed);

      // Emit to backend
      socketManager.submitAnswer(trimmed, analytics);

      // Reset for next question
      analyticsBuilder.reset();
      setAiSpeaking(true);
    },
    [addMessage, analyticsBuilder, socketManager]
  );

  /**
   * Play AI-generated speech and add to chat.
   */
  const playAIAudio = useCallback(
    async (text: string) => {
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
    },
    [showGate]
  );

  /**
   * End the interview session.
   * Cleans up all resources, stops recording, sends analytics.
   */
  const endSession = useCallback(
    async (fromBackend = false, reason: EndReason = "user_ended") => {
      if (endLockRef.current) return;
      endLockRef.current = true;
      if (isEnding) return;

      endReasonRef.current = fromBackend ? "completed" : reason;
      setIsEnding(true);
      setSessionRunning(false);
      setAiSpeaking(false);

      // Stop all feature managers
      stopMicMeter();

      // Cleanup audio
      if (aiAudioRef.current) {
        aiAudioRef.current.pause();
        aiAudioRef.current.currentTime = 0;
      }

      // Exit fullscreen if needed
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          /* ignore */
        }
      }

      // Emit end event to backend
      if (!fromBackend) {
        socketManager.emitSessionEnd(endReasonRef.current);
      }

      // Save activity
      try {
        await fetch("/api/activity/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interviewId,
            endReason: endReasonRef.current,
            tabSwitches: tabSwitchCount,
            fsExits: fsWarningCount,
            identityMismatches: identityMismatchCount,
          }),
        });
      } catch (e) {
        console.warn("[activity] update failed:", e);
      }

      reset();

      // Redirect to feedback
      setTimeout(() => {
        router.push(
          `/feedback/${interviewId}/?reason=${endReasonRef.current}`
        );
      }, 2000);
    },
    [
      interviewId,
      router,
      reset,
      isEnding,
      stopMicMeter,
      socketManager,
      tabSwitchCount,
      fsWarningCount,
      identityMismatchCount,
    ]
  );

  useEffect(() => {
    endSessionRef.current = endSession;
  }, [endSession]);

  /**
   * Handle incoming questions from backend.
   */
  const handleQuestion = useCallback(
    (data: {
      question: string;
      index: number;
      difficulty: string;
      time?: number;
    }) => {
      if (!data?.question) return;

      const now = data.time
        ? new Date(data.time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
        : new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

      analyticsBuilder.recordQuestion(data.time ?? Date.now());
      addMessage({ id: Date.now(), role: "ai", text: data.question, time: now });
      playAIAudio(data.question);
    },
    [addMessage, playAIAudio, analyticsBuilder]
  );

  /**
   * Setup socket listeners for backend events.
   */
  useEffect(() => {
    if (showGate) return;

    const unsubscribe = socketManager.setupListeners({
      onQuestion: handleQuestion,
      onIntentReply: (reply: string) => {
        const now = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        addMessage({ id: Date.now(), role: "ai", text: reply, time: now });
        playAIAudio(reply);
      },
      onComplete: () => endSessionRef.current(true, "completed"),
    });

    socketManager.joinInterview();

    return () => unsubscribe();
  }, [showGate, handleQuestion, addMessage, playAIAudio]);

  /**
   * Initialize media (mic, camera) and start recording.
   */
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((stream) => {
        userStreamRef.current = stream;
        startMicMeter(stream);
      })
      .catch((err) => console.error("[media]", err));

    return () => {
      try {
        userStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      stopMicMeter();
    };
  }, [startMicMeter, stopMicMeter]);

  /**
   * Attach user video stream to video element.
   */
  useEffect(() => {
    if (userVideoRef.current && userStreamRef.current) {
      userVideoRef.current.srcObject = userStreamRef.current;
    }
  }, [micPermission, camOn]);

  /**
   * Auto-scroll chat to bottom on new messages.
   */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * Send message handler (manual submit).
   */
  const sendMessage = () => {
    submitAnswer(input);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="noise" />

      {/* ── MODALS ────────────────────────────────────────────────── */}
      {showGate && (
        <FullscreenGate
          onEnter={async () => {
            console.log("Clicked Start");
            try {
              await handleGateEnter();
            } catch (e) {
              console.error("Fullscreen error:", e);
            }

            setShowGate(false); // 🚨 THIS WAS MISSING
          }}
        />
      )}

      {!showGate && showFsWarning && (
        <FullscreenWarningModal
          count={fsWarningCount}
          onReenter={handleReenterFullscreen}
        />
      )}

      {showFaceModal && (
        <FaceViolationModal
          status={faceStatus as "no-face" | "multiple"}
          countdown={faceCountdown}
          violationCount={faceViolationCount}
          onDismiss={handleDismissFaceModal}
        />
      )}

      {showIdentityModal && (
        <IdentityMismatchModal
          mismatchCount={identityMismatchCount}
          countdown={identityCountdown}
          onDismiss={handleDismissIdentityModal}
        />
      )}

      {showTabWarning && (
        <TabSwitchWarningModal
          count={tabSwitchCount}
          onDismiss={handleDismissTabWarning}
        />
      )}

      {/* ── MAIN PAGE ─────────────────────────────────────────────── */}
      <div className="interview-root">
        <InterviewTopbar
          isFullscreen={isFullscreen}
          aiSpeaking={aiSpeaking}
          fsWarningCount={fsWarningCount}
          tabSwitchCount={tabSwitchCount}
          faceStatus={faceStatus}
          modelsReady={modelsReady}
          faceCount={faceCount}
          isEnding={isEnding}
          onToggleFullscreen={() => {
            if (isFullscreen) {
              document.exitFullscreen().catch(() => { });
            } else {
              document.documentElement.requestFullscreen?.();
            }
          }}
          onEndSession={() => endSession(false, "user_ended")}
        />

        <div className="interview-body">
          <VideoArea
            userVideoRef={userVideoRef}
            aiAudioRef={aiAudioRef}
            camOn={camOn}
            micOn={micOn}
            aiSpeaking={aiSpeaking}
            isListening={isListening}
            camPermission={camPermission}
            micPermission={micPermission}
            faceStatus={faceStatus}
            modelsReady={modelsReady}
            showFaceBanner={
              camOn && camPermission && modelsReady && faceStatus !== "ok"
            }
            onMicToggle={() => setMicOn((p) => !p)}
            onCamToggle={() => setCamOn((v) => !v)}
            onEndSession={() => endSession(false, "user_ended")}
            isEnding={isEnding}
          />

          <ChatPanel
            messages={messages}
            aiSpeaking={aiSpeaking}
            input={input}
            onInputChange={setInput}
            onSendMessage={sendMessage}
            onKeyDown={handleKey}
            chatEndRef={chatEndRef}
          />
        </div>
      </div>
    </>
  );
}