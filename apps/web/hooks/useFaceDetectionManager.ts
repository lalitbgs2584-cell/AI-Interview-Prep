/**
 * ============================================================================
 * useFaceDetectionManager Hook
 * ============================================================================
 *
 * Manages face presence detection using MediaPipe FaceDetector.
 * This is Layer 1: Are there faces in frame?
 * (Layer 2 is identity verification - is it the same person?)
 *
 * Features:
 *  - Detects if face is present / missing / multiple
 *  - Tracks violation count (terminate on 2nd violation)
 *  - Shows countdown warning (15 seconds per violation)
 *  - Grace period (3 frames) to avoid false positives
 *
 * Returns:
 *  - faceStatus: "ok" | "no-face" | "multiple"
 *  - faceCount: number of faces detected
 *  - modelsReady: boolean (models loaded)
 *  - showFaceModal: boolean
 *  - faceCountdown: number (15 to 0)
 *  - faceViolationCount: number (1 or 2)
 *  - handleDismissFaceModal: function
 *
 * ============================================================================
 */

'use client';
import { useState, useRef, useCallback, useEffect } from "react";

type FaceStatus = "ok" | "no-face" | "multiple";

interface UseFaceDetectionManagerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  onTerminate: (reason: "face_violation") => void;
}

export function useFaceDetectionManager({
  videoRef,
  enabled,
  onTerminate,
}: UseFaceDetectionManagerProps) {
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("ok");
  const [faceCount, setFaceCount] = useState(1);
  const [modelsReady, setModelsReady] = useState(false);
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [faceCountdown, setFaceCountdown] = useState(15);
  const [faceViolationCount, setFaceViolationCount] = useState(0);

  const detectorRef = useRef<{
    detectForVideo: (
      video: HTMLVideoElement,
      timestamp: number
    ) => { detections: unknown[] };
    close: () => void;
  } | null>(null);

  const faceViolationCountRef = useRef(0);
  const statusRef = useRef<FaceStatus>("ok");
  const badFrames = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const lastVideoTime = useRef(-1);
  const lastPollTime = useRef(0);
  const faceCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const GRACE_FRAMES = 3;
  const POLL_INTERVAL_MS = 600;

  // ── Load MediaPipe model once on mount ────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadModel() {
      try {
        const { FaceDetector, FilesetResolver } = await import(
          "@mediapipe/tasks-vision"
        );
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
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
        if (!cancelled) {
          detectorRef.current = detector;
          setModelsReady(true);
        }
      } catch (err) {
        console.warn("[MediaPipe FaceDetector] Load failed:", err);
      }
    }

    loadModel();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Detection polling loop ─────────────────────────────────────────
  useEffect(() => {
    if (!modelsReady || !enabled) {
      badFrames.current = 0;
      statusRef.current = "ok";
      setFaceStatus("ok");
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
        const video = videoRef.current;
        const detector = detectorRef.current;

        if (
          video &&
          detector &&
          video.readyState >= 2 &&
          !video.paused &&
          video.videoWidth > 0 &&
          video.currentTime !== lastVideoTime.current
        ) {
          lastVideoTime.current = video.currentTime;
          try {
            const result = detector.detectForVideo(video, performance.now());
            const n = result.detections.length;
            setFaceCount(n);

            const raw: FaceStatus =
              n === 0 ? "no-face" : n > 1 ? "multiple" : "ok";

            if (raw !== "ok") {
              badFrames.current += 1;
              if (
                badFrames.current >= GRACE_FRAMES &&
                statusRef.current !== raw
              ) {
                statusRef.current = raw;
                setFaceStatus(raw);
              }
            } else {
              badFrames.current = 0;
              if (statusRef.current !== "ok") {
                statusRef.current = "ok";
                setFaceStatus("ok");
              }
            }
          } catch {
            /* swallow per-frame errors */
          }
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
    };
  }, [modelsReady, enabled, videoRef]);

  // ── Show / hide modal based on face status ────────────────────────
  // FIX: was `if (!modelsReady)` — must be `if (modelsReady)`
  useEffect(() => {
    if (!modelsReady) return;

    if (faceStatus !== "ok" && !showFaceModal) {
      // Increment violation count
      faceViolationCountRef.current += 1;
      const count = faceViolationCountRef.current;
      setFaceViolationCount(count);
      setFaceCountdown(15);
      setShowFaceModal(true);

      // Terminate immediately on 2nd violation (after short delay for UX)
      if (count >= 2) {
        setTimeout(() => onTerminate("face_violation"), 800);
      }
    }

    if (faceStatus === "ok" && showFaceModal) {
      if (faceCountdownRef.current) clearInterval(faceCountdownRef.current);
      setShowFaceModal(false);
      setFaceCountdown(15);
    }
  }, [faceStatus, modelsReady, showFaceModal, onTerminate]);

  // ── Countdown timer — terminate on 0 ──────────────────────────────
  useEffect(() => {
    if (!showFaceModal) return;

    faceCountdownRef.current = setInterval(() => {
      setFaceCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(faceCountdownRef.current!);
          onTerminate("face_violation");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (faceCountdownRef.current) clearInterval(faceCountdownRef.current);
    };
  }, [showFaceModal, onTerminate]);

  // ── Dismiss handler ───────────────────────────────────────────────
  const handleDismissFaceModal = useCallback(() => {
    if (faceCountdownRef.current) clearInterval(faceCountdownRef.current);
    setShowFaceModal(false);
    setFaceCountdown(15);
  }, []);

  return {
    faceStatus,
    faceCount,
    modelsReady,
    showFaceModal,
    faceCountdown,
    faceViolationCount,
    handleDismissFaceModal,
  };
}