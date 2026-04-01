"use client";
import { useEffect, useRef, useState, useCallback } from "react";

/* ─────────────────────────────────────────────
   useFaceIdentityVerification
   
   Sits ON TOP of the existing MediaPipe presence detection.
   MediaPipe answers: "Is a face present?"
   This hook answers: "Is it the SAME face as when we started?"

   HOW IT WORKS:
   1. On `startVerification()` — capture the reference descriptor from
      the current video frame. This is the enrolled face.
   2. Every `checkIntervalMs` (default 6 s) — compare the current frame's
      face descriptor against the reference using euclidean distance.
   3. If distance > THRESHOLD → `onMismatch` fires → caller handles it
      (show modal, end session, emit to backend, etc.)
   4. `stopVerification()` cancels the interval.

   THRESHOLD GUIDE:
     < 0.4  very strict (lighting changes can false-positive)
     0.45   recommended default
     > 0.55 too lenient for proctoring

   MODELS:
   Put these in /public/models/ (download from face-api.js GitHub releases):
     - ssd_mobilenetv1_model-weights_manifest.json + shards
     - face_landmark_68_model-weights_manifest.json + shards
     - face_recognition_model-weights_manifest.json + shards
───────────────────────────────────────────── */

export type IdentityStatus =
  | "idle"           // not yet enrolled
  | "enrolling"      // capturing reference face
  | "enrolled"       // reference captured, verification running
  | "mismatch"       // different person detected
  | "no_face"        // no face visible during check (handled by MediaPipe separately)
  | "error";         // model load / API error

export interface UseFaceIdentityVerificationOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;                   // tied to session running + cam on
  checkIntervalMs?: number;           // how often to verify (default: 6000)
  threshold?: number;                 // euclidean distance cap (default: 0.45)
  onMismatch?: (distance: number) => void;
  onEnrolled?: () => void;
  onError?: (err: Error) => void;
}

export interface UseFaceIdentityVerificationReturn {
  status: IdentityStatus;
  mismatchCount: number;
  startVerification: () => Promise<void>;
  stopVerification: () => void;
  resetVerification: () => void;
}

const MODEL_URL = "/models"; // served from /public/models/
const DEFAULT_THRESHOLD = 0.45;
const DEFAULT_INTERVAL_MS = 6000;

export function useFaceIdentityVerification({
  videoRef,
  enabled,
  checkIntervalMs = DEFAULT_INTERVAL_MS,
  threshold = DEFAULT_THRESHOLD,
  onMismatch,
  onEnrolled,
  onError,
}: UseFaceIdentityVerificationOptions): UseFaceIdentityVerificationReturn {
  const [status, setStatus] = useState<IdentityStatus>("idle");
  const [mismatchCount, setMismatchCount] = useState(0);

  const referenceDescriptorRef = useRef<Float32Array | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modelsLoadedRef = useRef(false);
  const loadingModelsRef = useRef(false);
  const mismatchCountRef = useRef(0);

  // ── Load models once ──────────────────────────────────────────────────
  const loadModels = useCallback(async () => {
    if (modelsLoadedRef.current || loadingModelsRef.current) return;
    loadingModelsRef.current = true;

    try {
      // Dynamic import so face-api.js is not bundled into the main chunk
      const faceapi = await import("face-api.js");
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoadedRef.current = true;
      console.log("[FaceIdentity] Models loaded");
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error("[FaceIdentity] Model load failed:", e);
      setStatus("error");
      onError?.(e);
    } finally {
      loadingModelsRef.current = false;
    }
  }, [onError]);

  // ── Capture a single face descriptor from the video frame ─────────────
  const captureDescriptor = useCallback(async (): Promise<Float32Array | null> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.paused || video.videoWidth === 0) {
      return null;
    }

    const faceapi = await import("face-api.js");
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    return detection?.descriptor ?? null;
  }, [videoRef]);

  // ── Enroll: capture reference face ───────────────────────────────────
  const startVerification = useCallback(async () => {
    if (!enabled) return;

    setStatus("enrolling");

    try {
      await loadModels();

      if (!modelsLoadedRef.current) {
        setStatus("error");
        return;
      }

      // Retry up to 5 times in case the camera frame isn't ready yet
      let descriptor: Float32Array | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        descriptor = await captureDescriptor();
        if (descriptor) break;
        await new Promise((r) => setTimeout(r, 800));
      }

      if (!descriptor) {
        console.warn("[FaceIdentity] Could not capture reference face after 5 attempts");
        setStatus("error");
        onError?.(new Error("No face detected during enrollment"));
        return;
      }

      referenceDescriptorRef.current = descriptor;
      setStatus("enrolled");
      onEnrolled?.();
      console.log("[FaceIdentity] Reference face enrolled");

      // ── Start periodic verification ───────────────────────────────────
      intervalRef.current = setInterval(async () => {
        if (!referenceDescriptorRef.current) return;

        const current = await captureDescriptor();

        if (!current) {
          // No face visible — MediaPipe handles this separately.
          // We don't fire onMismatch here to avoid double-penalising.
          return;
        }

        const faceapi = await import("face-api.js");
        const distance = faceapi.euclideanDistance(
          referenceDescriptorRef.current,
          current
        );

        console.log(`[FaceIdentity] Distance: ${distance.toFixed(4)}`);

        if (distance > threshold) {
          mismatchCountRef.current += 1;
          setMismatchCount(mismatchCountRef.current);
          setStatus("mismatch");
          onMismatch?.(distance);
          console.warn(
            `[FaceIdentity] MISMATCH #${mismatchCountRef.current} — distance=${distance.toFixed(4)}`
          );
        } else {
          // If it was mismatch but face is back to matching, recover
          setStatus((prev) => (prev === "mismatch" ? "enrolled" : prev));
        }
      }, checkIntervalMs);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error("[FaceIdentity] startVerification error:", e);
      setStatus("error");
      onError?.(e);
    }
  }, [enabled, loadModels, captureDescriptor, checkIntervalMs, threshold, onEnrolled, onMismatch, onError]);

  // ── Stop ──────────────────────────────────────────────────────────────
  const stopVerification = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    console.log("[FaceIdentity] Verification stopped");
  }, []);

  // ── Reset (e.g., after a false positive "I Fixed It" dismissal) ───────
  const resetVerification = useCallback(() => {
    stopVerification();
    referenceDescriptorRef.current = null;
    mismatchCountRef.current = 0;
    setMismatchCount(0);
    setStatus("idle");
  }, [stopVerification]);

  // ── Auto-stop when disabled or unmounted ─────────────────────────────
  useEffect(() => {
    if (!enabled) stopVerification();
    return () => stopVerification();
  }, [enabled, stopVerification]);

  return {
    status,
    mismatchCount,
    startVerification,
    stopVerification,
    resetVerification,
  };
}