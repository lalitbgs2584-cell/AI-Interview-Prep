/**
 * ============================================================================
 * useIdentityVerificationManager Hook
 * ============================================================================
 *
 * Manages face identity verification using @vladmandic/face-api.
 * This is Layer 2: Is it the same person as who enrolled?
 * (Layer 1 is presence detection via MediaPipe)
 *
 * Flow:
 *  1. Models load on mount (tiny detector + landmarks + recognition net)
 *  2. On `enabled` becoming true ' wait 1.5s ' enroll reference face
 *  3. Every `checkIntervalMs` ' compare current face to reference
 *  4. distance > threshold ' mismatch
 *  5. 1st mismatch ' show warning modal with 20s countdown
 *  6. 2nd mismatch ' terminate immediately
 *
 * ============================================================================
 */

import { useState, useRef, useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IdentityStatus =
  | "idle"
  | "loading"     // models loading
  | "enrolling"   // capturing reference descriptor
  | "enrolled"    // reference captured, verification running
  | "mismatch"    // current frame doesn't match reference
  | "error";      // model load or detection failure

interface UseIdentityVerificationManagerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  checkIntervalMs: number;  // how often to compare faces, e.g. 6000
  threshold: number;  // euclidean distance threshold, e.g. 0.45
  onEnrolled?: () => void;
  onMismatch?: (distance: number) => void;
  onError?: (err: Error) => void;
  onTerminate?: (reason: "identity_mismatch") => void;
}

// ---------------------------------------------------------------------------
// Lazy face-api loader " only imported once, cached in module scope
// ---------------------------------------------------------------------------

let faceApiPromise: Promise<typeof import("@vladmandic/face-api")> | null = null;

async function loadFaceApi() {
  if (!faceApiPromise) {
    faceApiPromise = import("@vladmandic/face-api");
  }
  return faceApiPromise;
}

// Models are served from /public/models " copy weights there from:
// https://github.com/vladmandic/face-api/tree/master/model
// Fallback to CDN if local files are missing or corrupted.
const MODEL_URLS = [
  "/models",
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model",
];
let activeModelUrl = MODEL_URLS[0];

let modelsLoadedPromise: Promise<void> | null = null;

async function ensureModelsLoaded() {
  if (!modelsLoadedPromise) {
    modelsLoadedPromise = (async () => {
      const faceapi = await loadFaceApi();
      let lastErr: unknown = null;

      for (const url of MODEL_URLS) {
        try {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(url),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(url),
            faceapi.nets.faceRecognitionNet.loadFromUri(url),
          ]);
          activeModelUrl = url;
          return;
        } catch (err) {
          lastErr = err;
        }
      }

      throw lastErr ?? new Error("Failed to load face-api models");
    })();
  }
  return modelsLoadedPromise;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useIdentityVerificationManager({
  videoRef,
  enabled,
  checkIntervalMs = 6000,
  threshold = 0.55,
  onEnrolled,
  onMismatch,
  onError,
  onTerminate,
}: UseIdentityVerificationManagerProps) {

  const enrollAttemptsRef = useRef(0);
  const [identityStatus, setIdentityStatus] = useState<IdentityStatus>("idle");
  const [identityMismatchCount, setIdentityMismatchCount] = useState(0);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [identityCountdown, setIdentityCountdown] = useState(20);
  const [modelsReady, setModelsReady] = useState(false);

  // refs so callbacks always see current values without re-creating intervals
  const enrolledDescriptorRef = useRef<Float32Array | null>(null);
  const mismatchCountRef = useRef(0);
  const verificationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<IdentityStatus>("idle");

  // keep statusRef in sync
  const updateStatus = useCallback((s: IdentityStatus) => {
    statusRef.current = s;
    setIdentityStatus(s);
  }, []);

  // "" 1. Load models on mount """"""""""""""""""""""""""""""""""""""""
  useEffect(() => {
    let cancelled = false;
    updateStatus("loading");

    ensureModelsLoaded()
      .then(() => {
        if (!cancelled) {
          setModelsReady(true);
          updateStatus("idle");
          console.log(`[identity] models loaded from ${activeModelUrl}`);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[identity] model load failed:", err);
          updateStatus("error");
          onError?.(err as Error);
        }
      });

    return () => { cancelled = true; };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // "" 2. Enroll reference face """""""""""""""""""""""""""""""""""""""
  const enrollFace = useCallback(async () => {
    if (!videoRef.current) return;
    if (!modelsReady) return;
    if (statusRef.current !== "idle") return;

    updateStatus("enrolling");

    try {
      const faceapi = await loadFaceApi();
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });

      // Retry up to 5 times " video may not have a clear frame immediately
      let detection: { descriptor: Float32Array } | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = await faceapi
          .detectSingleFace(videoRef.current, options)
          .withFaceLandmarks(true)   // true = tiny landmark model
          .withFaceDescriptor();

        if (result) { detection = result; break; }

        // Wait 800ms between retries
        await new Promise((r) => setTimeout(r, 800));
      }

      if (!detection) {
        enrollAttemptsRef.current++;

        if (enrollAttemptsRef.current >= 3) {
          updateStatus("error");
          onError?.(new Error("Failed to enroll face"));
          return;
        }

        updateStatus("idle");
        return;
      }

      enrolledDescriptorRef.current = detection.descriptor;
      updateStatus("enrolled");
      onEnrolled?.();

    } catch (err) {
      console.warn("[identity] enroll failed:", err);
      updateStatus("error");
      onError?.(err as Error);
    }
  }, [videoRef, modelsReady, updateStatus, onEnrolled, onError]);

  // "" 3. Verify current face against enrolled descriptor """"""""""""
  const verifyFace = useCallback(async (): Promise<number | null> => {
    if (!videoRef.current) return null;
    if (!enrolledDescriptorRef.current) return null;
    if (statusRef.current !== "enrolled") return null;

    try {
      const faceapi = await loadFaceApi();
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });

      const result = await faceapi
        .detectSingleFace(videoRef.current, options)
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!result) return null;  // no face " Layer 1 handles absence

      const distance = faceapi.euclideanDistance(
        enrolledDescriptorRef.current,
        result.descriptor,
      );

      return distance;

    } catch (err) {
      console.warn("[identity] verify failed:", err);
      return null;
    }
  }, [videoRef]);

  // "" 4. Trigger mismatch logic """""""""""""""""""""""""""""""""""""
  const triggerMismatch = useCallback((distance: number) => {
    mismatchCountRef.current += 1;
    const n = mismatchCountRef.current;
    setIdentityMismatchCount(n);
    onMismatch?.(distance);

    if (n >= 2) {
      // 2nd mismatch " terminate immediately, no modal needed
      updateStatus("mismatch");
      setTimeout(() => onTerminate?.("identity_mismatch"), 800);
      return;
    }

    // 1st mismatch " show warning modal with countdown
    updateStatus("mismatch");
    setIdentityCountdown(20);
    setShowIdentityModal(true);
  }, [updateStatus, onMismatch, onTerminate]);

  // "" 5. Verification interval " runs when enrolled """""""""""""""""
  useEffect(() => {
    if (identityStatus !== "enrolled" || !enabled) return;
    if (verificationIntervalRef.current) return;  // already running

    verificationIntervalRef.current = setInterval(async () => {
      const distance = await verifyFace();
      if (distance === null) return;  // no face or error " not our concern here

      if (distance > threshold) {
        // Stop the interval before triggering " triggerMismatch may terminate
        clearInterval(verificationIntervalRef.current!);
        verificationIntervalRef.current = null;
        triggerMismatch(distance);
      }
    }, checkIntervalMs);

    return () => {
      if (verificationIntervalRef.current) {
        clearInterval(verificationIntervalRef.current);
        verificationIntervalRef.current = null;
      }
    };
  }, [identityStatus, enabled, checkIntervalMs, threshold, verifyFace, triggerMismatch]);

  // "" 6. Countdown timer for warning modal """"""""""""""""""""""""""
  useEffect(() => {
    if (!showIdentityModal) return;

    countdownIntervalRef.current = setInterval(() => {
      setIdentityCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current!);
          onTerminate?.("identity_mismatch");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current)
        clearInterval(countdownIntervalRef.current);
    };
  }, [showIdentityModal, onTerminate]);

  // "" 7. Auto-enroll when enabled and models are ready """""""""""""
  useEffect(() => {
    if (!enabled || !modelsReady || statusRef.current !== "idle") return;

    // Short delay so the video stream is fully stable
    const timer = setTimeout(() => {
      enrollFace();
    }, 1500);

    return () => clearTimeout(timer);
  }, [enabled, modelsReady, enrollFace]);

  // "" 8. Cleanup on unmount """""""""""""""""""""""""""""""""""""""""
  useEffect(() => {
    return () => {
      if (verificationIntervalRef.current) clearInterval(verificationIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  // "" Dismiss handler """""""""""""""""""""""""""""""""""""""""""""""
  const handleDismissIdentityModal = useCallback(() => {
    if (mismatchCountRef.current >= 2) {
      onTerminate?.("identity_mismatch");
      return;
    }

    // Clear countdown
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setShowIdentityModal(false);
    setIdentityCountdown(20);

    // Re-enroll so user gets a fresh reference (they may have adjusted camera)
    enrolledDescriptorRef.current = null;
    updateStatus("idle");

    // Give the video a moment before re-enrolling
    setTimeout(() => enrollFace(), 800);
  }, [updateStatus, enrollFace, onTerminate]);

  // "" Stop verification """""""""""""""""""""""""""""""""""""""""""""
  const stopVerification = useCallback(() => {
    if (verificationIntervalRef.current) {
      clearInterval(verificationIntervalRef.current);
      verificationIntervalRef.current = null;
    }
  }, []);

  return {
    identityStatus,
    identityMismatchCount,
    showIdentityModal,
    identityCountdown,
    modelsReady,
    stopVerification,
    handleDismissIdentityModal,
  };
}
