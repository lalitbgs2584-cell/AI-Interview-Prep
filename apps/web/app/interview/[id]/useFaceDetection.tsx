import { useState,useEffect,useRef } from "react";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

/* ---------------------- FACE DETECTION HOOK (MediaPipe) ---------------------- */
type FaceStatus = "ok" | "no-face" | "multiple";

function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean
) {
  const [status, setStatus] = useState<FaceStatus>("ok");
  const [count, setCount] = useState(1);
  const [modelsReady, setModelsReady] = useState(false);

  const detectorRef = useRef<any>(null);
  const statusRef = useRef<FaceStatus>("ok");
  const badFrames = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const lastVideoTime = useRef(-1);

  const GRACE_FRAMES = 3;
  // Only run detection every N ms to save CPU
  const POLL_INTERVAL_MS = 600;
  const lastPollTime = useRef(0);

  // ── Load MediaPipe FaceDetector once ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadModel() {
      try {

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

  // ── Detection loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!modelsReady || !enabled) {
      // Reset state when disabled
      badFrames.current = 0;
      statusRef.current = "ok";
      setStatus("ok");
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;

      // Throttle: only run every POLL_INTERVAL_MS
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
            setCount(n);

            const raw: FaceStatus =
              n === 0 ? "no-face" : n > 1 ? "multiple" : "ok";

            if (raw !== "ok") {
              badFrames.current += 1;
              if (
                badFrames.current >= GRACE_FRAMES &&
                statusRef.current !== raw
              ) {
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
          } catch (err) {
            // Swallow per-frame errors silently
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

  return { status, count, modelsReady };
}