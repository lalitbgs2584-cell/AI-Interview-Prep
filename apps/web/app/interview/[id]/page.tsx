"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSpeechToText } from "@/hooks/useSpeechHook";
import { useInterviewStore } from "@/store/useInterviewStore";

import "./style.css";
import { useFullscreenManager } from "@/hooks/useFullscreenManager";
import { useTabSwitchDetection } from "@/hooks/useTabSwitchDetection";
import { useFaceDetectionManager } from "@/hooks/useFaceDetectionManager";
import { useIdentityVerificationManager } from "@/hooks/useIdentityVerificationManager";
import { useMediaManager } from "@/hooks/useMediaManager";
import { useRecordingManager } from "@/hooks/useRecordingManager";
import { AnswerAnalyticsBuilder } from "@/components/interview/anwerAnalyticsBuilder";
import { InterviewSocketManager } from "@/components/interview/InterviewSocketManager";
import InterviewTopbar from "@/components/interview/InterviewTopbar";
import ChatPanel from "@/components/interview/chatPanel";
import ZoomVideoArea from "@/components/interview/ZoomVideoArea";
import { FullscreenGate } from "@/modals/FullscreenGate";
import { FullscreenWarningModal } from "@/modals/FullscreenWarningModal";
import { FaceViolationModal } from "@/modals/FaceViolationModal";
import { IdentityMismatchModal } from "@/modals/IdentityMismatchModal";
import { TabSwitchWarningModal } from "@/modals/TabSwitchWarningModal";
import { AudioMetricsCollector } from "@/lib/audioAnalytics";

type EndReason = "completed" | "user_ended" | "fullscreen" | "tab_switch" | "face_violation" | "identity_mismatch";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
  const [showGate, setShowGate] = useState(true);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [screenShareStream, setScreenShareStream] = useState<MediaStream | null>(null);
  const [isScreenSharePending, setIsScreenSharePending] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);

  const endLockRef = useRef(false);
  const endReasonRef = useRef<EndReason>("user_ended");
  const endSessionRef = useRef<(fromBackend?: boolean, reason?: EndReason) => void>(() => {});

  const chatEndRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const userVideoRef = useRef<HTMLVideoElement>(null) as React.RefObject<HTMLVideoElement>;
  const screenVideoRef = useRef<HTMLVideoElement>(null) as React.RefObject<HTMLVideoElement>;
  const aiAudioRef = useRef<HTMLAudioElement>(null) as React.RefObject<HTMLAudioElement>;
  const audioCollectorRef = useRef<AudioMetricsCollector>(new AudioMetricsCollector());
  const speechStartTimeRef = useRef<number>(0);

  const { addMessage, messages, reset, interviewTitle, interviewType, setInterviewMeta } = useInterviewStore();

  const {
    isFullscreen,
    fsWarningCount,
    showFsWarning,
    handleGateEnter,
    handleReenterFullscreen,
    suppressFsExitRef,
  } = useFullscreenManager({
    showGate,
    isEnding,
    sessionRunning,
    fullscreenExempt: Boolean(screenShareStream) || isScreenSharePending,
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

  const { startRecording, stopRecording } = useRecordingManager({
    userStreamRef,
    aiAudioRef,
    interviewId,
    enabled: !showGate && sessionRunning && !isEnding,
  });

  const analyticsBuilder = useMemo(
    () => new AnswerAnalyticsBuilder(micSampleBufferRef),
    []
  );

  const socketManager = useMemo(
    () => new InterviewSocketManager(interviewId),
    [interviewId]
  );

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
      // Start timing and audio sampling for the current answer.
      speechStartTimeRef.current = Date.now();
      if (userStreamRef.current) {
        audioCollectorRef.current.reset();
        audioCollectorRef.current.start(userStreamRef.current);
      }

      if (aiSpeaking) {
        if (aiAudioRef.current) {
          aiAudioRef.current.pause();
          aiAudioRef.current.currentTime = 0;
        }
        setAiSpeaking(false);
        socketManager.emitInterruption();
      }
    }, [aiSpeaking, analyticsBuilder, socketManager, userStreamRef]),
    onFinalMessage: useCallback((text: string) => {
      submitAnswer(text);
    }, []),
  });

  const abortListeningRef = useRef<() => void>(() => {});

  useEffect(() => {
    abortListeningRef.current = abortListening;
    return () => abortListeningRef.current?.();
  }, [abortListening]);

  useEffect(() => {
    if (transcript) setInput(transcript);
  }, [transcript]);

  useEffect(() => {
    if (!mediaReady || showGate || isEnding || !sessionRunning) return;
    startRecording();
  }, [isEnding, mediaReady, sessionRunning, showGate, startRecording]);

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

  const submitAnswer = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const now = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      addMessage({ id: Date.now(), role: "user", text: trimmed, time: now });
      setInput("");
      // Stop sampling before building the answer analytics payload.
      const audioMetrics = audioCollectorRef.current.stop();
      const durationMs = Date.now() - speechStartTimeRef.current;
      const analytics = analyticsBuilder.build(trimmed, audioMetrics, durationMs);

      socketManager.submitAnswer(trimmed, analytics);

      analyticsBuilder.reset();
      audioCollectorRef.current.reset();
      setAiSpeaking(true);
    },
    [addMessage, analyticsBuilder, socketManager]
  );

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

  const stopScreenShare = useCallback(() => {
    setScreenShareStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, []);

  const restoreFullscreenAfterShare = useCallback(async () => {
    if (showGate || isEnding || !sessionRunning || document.fullscreenElement) {
      return;
    }

    try {
      await document.documentElement.requestFullscreen?.();
      setSessionNotice(null);
    } catch {
      setSessionNotice("Screen sharing ended. Return to fullscreen to continue.");
    }
  }, [isEnding, sessionRunning, showGate]);

  const toggleScreenShare = useCallback(async () => {
    if (screenShareStream) {
      stopScreenShare();
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setSessionNotice("Screen sharing is not supported in this browser.");
      return;
    }

    try {
      suppressFsExitRef.current = true;
      setIsScreenSharePending(true);

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
        } as MediaTrackConstraints,
        audio: false,
      });

      const [videoTrack] = displayStream.getVideoTracks();
      videoTrack?.addEventListener(
        "ended",
        () => {
          setScreenShareStream(null);
          void restoreFullscreenAfterShare();
        },
        { once: true },
      );

      setScreenShareStream(displayStream);
      setSessionNotice(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setSessionNotice("Screen sharing was canceled before it started.");
      } else {
        console.error("[screen share]", err);
        setSessionNotice("Screen sharing could not start. Please try again.");
      }
    } finally {
      setIsScreenSharePending(false);
    }
  }, [restoreFullscreenAfterShare, screenShareStream, stopScreenShare, suppressFsExitRef]);
  const endSession = useCallback(
    async (fromBackend = false, reason: EndReason = "user_ended") => {
      if (endLockRef.current) return;
      endLockRef.current = true;
      if (isEnding) return;

      endReasonRef.current = fromBackend ? "completed" : reason;
      setIsEnding(true);
      setSessionRunning(false);
      setAiSpeaking(false);

      stopMicMeter();
      stopScreenShare();
      stopRecording();
      audioCollectorRef.current.stop();

      if (aiAudioRef.current) {
        aiAudioRef.current.pause();
        aiAudioRef.current.currentTime = 0;
      }

      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch { /* ignore */ }
      }

      if (!fromBackend) {
        socketManager.emitSessionEnd(endReasonRef.current);
      }

      const persistInterview = async (attempt = 1): Promise<void> => {
        try {
          const res = await fetch(`${API_BASE}/api/interview/${interviewId}/complete`, {
            method: "POST",
            credentials: "include",
          });

          if (res.ok) return;

          if (res.status === 404 && attempt < 5) {
            setTimeout(() => { void persistInterview(attempt + 1); }, 1500);
            return;
          }

          let detail = `HTTP ${res.status}`;
          try {
            const json = await res.json();
            detail = json?.error ?? json?.message ?? detail;
          } catch { /* ignore */ }
          console.warn("[interview] storeNeon failed:", detail);
        } catch (err) {
          if (attempt < 5) {
            setTimeout(() => { void persistInterview(attempt + 1); }, 1500);
            return;
          }
          console.warn("[interview] storeNeon error:", err);
        }
      };

      void persistInterview();

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

      setTimeout(() => {
        router.push(`/feedback/${interviewId}/?reason=${endReasonRef.current}`);
      }, 2000);
    },
    [
      interviewId,
      router,
      reset,
      isEnding,
      stopMicMeter,
      stopScreenShare,
      socketManager,
      tabSwitchCount,
      fsWarningCount,
      identityMismatchCount,
      stopRecording,
    ]
  );

  useEffect(() => {
    endSessionRef.current = endSession;
  }, [endSession]);

  const handleQuestion = useCallback(
    (data: { question: string; index: number; difficulty: string; time?: number }) => {
      if (!data?.question) return;

      const now = data.time
        ? new Date(data.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      analyticsBuilder.recordQuestion(data.time ?? Date.now());
      addMessage({ id: Date.now(), role: "ai", text: data.question, time: now });
      playAIAudio(data.question);
    },
    [addMessage, playAIAudio, analyticsBuilder]
  );

  useEffect(() => {
    if (showGate) return;

    const unsubscribe = socketManager.setupListeners({
      onQuestion: handleQuestion,
      onIntentReply: (reply: string) => {
        const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        addMessage({ id: Date.now(), role: "ai", text: reply, time: now });
        playAIAudio(reply);
      },
      onBudgetExceeded: ({ message }) => {
        setSessionNotice(message || "Daily interview limit reached. Resets at midnight.");
        setAiSpeaking(false);
      },
      onJobFailed: ({ message }) => {
        setSessionNotice(message || "A background job failed. Please try again.");
      },
      onComplete: () => endSessionRef.current(true, "completed"),
    });

    socketManager.joinInterview();
    return () => unsubscribe();
  }, [showGate, handleQuestion, addMessage, playAIAudio]);

  // Restore interview meta on refresh (sessionStorage)
  useEffect(() => {
    if (!interviewId || typeof window === "undefined") return;
    const key = `interview_meta:${interviewId}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { title?: string | null; type?: string | null };
      const nextTitle = parsed?.title ?? null;
      const nextType = parsed?.type ?? null;
      if ((nextTitle || nextType) && (!interviewTitle || !interviewType)) {
        setInterviewMeta(nextTitle, nextType);
      }
    } catch {
      // ignore malformed cache
    }
  }, [interviewId, interviewTitle, interviewType, setInterviewMeta]);

  // Keep meta cached during the session
  useEffect(() => {
    if (!interviewId || typeof window === "undefined") return;
    if (!interviewTitle && !interviewType) return;
    const key = `interview_meta:${interviewId}`;
    const payload = { title: interviewTitle ?? null, type: interviewType ?? null };
    sessionStorage.setItem(key, JSON.stringify(payload));
  }, [interviewId, interviewTitle, interviewType]);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((stream) => {
        userStreamRef.current = stream;
        setMediaReady(true);
        startMicMeter(stream);
        // Start detailed answer analytics only when speech begins.
      })
      .catch((err) => console.error("[media]", err));

    return () => {
      try {
        userStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch { /* ignore */ }
      stopScreenShare();
      stopMicMeter();
      audioCollectorRef.current.stop();
    };
  }, [startMicMeter, stopMicMeter, stopRecording, stopScreenShare]);

  useEffect(() => {
    if (userVideoRef.current && userStreamRef.current) {
      userVideoRef.current.srcObject = userStreamRef.current;
    }
  }, [micPermission, camOn]);

  useEffect(() => {
    if (!screenVideoRef.current) return;
    screenVideoRef.current.srcObject = screenShareStream;
  }, [screenShareStream]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => { submitAnswer(input); };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <div className="noise" />

      {showGate && (
        <FullscreenGate
          onEnter={async () => {
            try { await handleGateEnter(); }
            catch (e) { console.error("Fullscreen error:", e); }
            setShowGate(false);
          }}
        />
      )}

      {!showGate && showFsWarning && (
        <FullscreenWarningModal count={fsWarningCount} onReenter={handleReenterFullscreen} />
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
        <TabSwitchWarningModal count={tabSwitchCount} onDismiss={handleDismissTabWarning} />
      )}

      <div className="interview-root">
        <InterviewTopbar
          interviewTitle={interviewTitle}
          interviewType={interviewType}
          isFullscreen={isFullscreen}
          aiSpeaking={aiSpeaking}
          fsWarningCount={fsWarningCount}
          tabSwitchCount={tabSwitchCount}
          faceStatus={faceStatus}
          modelsReady={modelsReady}
          faceCount={faceCount}
          isEnding={isEnding}
          onToggleFullscreen={() => {
            if (isFullscreen) { document.exitFullscreen().catch(() => {}); }
            else { document.documentElement.requestFullscreen?.(); }
          }}
          onEndSession={() => endSession(false, "user_ended")}
        />

        <div className={`interview-body${isChatCollapsed ? " chat-collapsed" : ""}`}>
          <ZoomVideoArea
            userVideoRef={userVideoRef}
            screenVideoRef={screenVideoRef}
            aiAudioRef={aiAudioRef}
            camOn={camOn}
            micOn={micOn}
            aiSpeaking={aiSpeaking}
            isListening={isListening}
            isScreenSharing={Boolean(screenShareStream)}
            isScreenSharePending={isScreenSharePending}
            isChatCollapsed={isChatCollapsed}
            camPermission={camPermission}
            faceStatus={faceStatus}
            showFaceBanner={camOn && camPermission && modelsReady && faceStatus !== "ok"}
            onMicToggle={() => setMicOn((p) => !p)}
            onCamToggle={() => setCamOn((v) => !v)}
            onToggleScreenShare={() => void toggleScreenShare()}
            onToggleChatPanel={() => setIsChatCollapsed((prev) => !prev)}
            onEndSession={() => endSession(false, "user_ended")}
            isEnding={isEnding}
          />

          <ChatPanel
            messages={messages}
            aiSpeaking={aiSpeaking}
            collapsed={isChatCollapsed}
            notice={sessionNotice}
            onToggleCollapse={() => setIsChatCollapsed((prev) => !prev)}
            onDismissNotice={() => setSessionNotice(null)}
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






