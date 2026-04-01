/**
 * ============================================================================
 * useMediaManager Hook
 * ============================================================================
 * 
 * Manages media device access (camera and microphone).
 * Handles mic audio analysis for analytics (RMS, ZCR).
 * 
 * Features:
 *  - Request getUserMedia permissions
 *  - Analyze mic audio in real-time
 *  - Collect RMS (loudness) and ZCR (zero-crossing rate) samples
 *  - Buffers samples for analytics building
 * 
 * Returns:
 *  - micPermission: boolean
 *  - camPermission: boolean
 *  - userStreamRef: RefObject<MediaStream>
 *  - micSampleBufferRef: RefObject<MicSample[]>
 *  - startMicMeter: function
 *  - stopMicMeter: function
 * 
 * ============================================================================
 */

import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Represents a single audio sample with timing and metrics.
 */
interface MicSample {
  t: number; // Timestamp
  rms: number; // Root mean square (loudness)
  zcr: number; // Zero-crossing rate (frequency indicator)
}

export function useMediaManager() {
  const [micPermission, setMicPermission] = useState(false);
  const [camPermission, setCamPermission] = useState(false);

  // Media stream from getUserMedia
  const userStreamRef = useRef<MediaStream | null>(null);

  // Audio analysis refs
  const micMeterCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micMeterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Buffer of mic samples for analytics
  // Each sample contains timestamp, RMS, and ZCR
  const micSampleBufferRef = useRef<MicSample[]>([]);

  /**
   * Start analyzing microphone audio.
   * Collects RMS and ZCR every 120ms.
   *
   * RMS (Root Mean Square):
   *  - Measures audio loudness
   *  - Higher values = louder audio
   *  - Used to detect speaking vs silence
   *
   * ZCR (Zero-Crossing Rate):
   *  - Counts how often audio signal crosses zero
   *  - Higher ZCR = higher frequencies
   *  - Lower ZCR = lower frequencies / speech
   */
  const startMicMeter = useCallback((stream: MediaStream) => {
    // Don't double-start
    if (micMeterTimerRef.current) return;

    // Create audio context if needed
    if (!micMeterCtxRef.current) {
      micMeterCtxRef.current = new AudioContext();
    }

    const ctx = micMeterCtxRef.current;
    if (!ctx || micAnalyserRef.current) return;

    try {
      // Connect mic stream to analyser
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024; // FFT size for frequency analysis

      source.connect(analyser);
      micAnalyserRef.current = analyser;

      // Pre-allocate buffer for audio data
      const fftSize = analyser.fftSize;
      const frame = new Float32Array(fftSize);

      /**
       * Sample collection loop.
       * Runs every 120ms (~8.33 samples per second).
       */
      micMeterTimerRef.current = setInterval(() => {
        // Get current audio frame data
        analyser.getFloatTimeDomainData(frame);

        // Calculate RMS (loudness)
        let sumSquares = 0;
        for (let i = 0; i < frame.length; i++) {
          sumSquares += frame[i]! * frame[i]!;
        }
        const rms = Math.sqrt(sumSquares / frame.length);

        // Calculate ZCR (zero-crossing rate)
        let crossings = 0;
        for (let i = 1; i < frame.length; i++) {
          // Count zero crossings: where sign changes from negative to positive
          if (frame[i - 1]! <= 0 && frame[i]! > 0) {
            crossings += 1;
          }
        }
        const zcr = crossings / frame.length;

        // Store sample
        micSampleBufferRef.current.push({
          t: Date.now(),
          rms,
          zcr,
        });

        // Keep only last 3000 samples (~6 minutes at 120ms intervals)
        if (micSampleBufferRef.current.length > 3000) {
          micSampleBufferRef.current.splice(
            0,
            micSampleBufferRef.current.length - 3000
          );
        }
      }, 120); // Sample every 120ms
    } catch (err) {
      console.error("[mic meter] setup failed:", err);
      stopMicMeter();
    }
  }, []);

  /**
   * Stop analyzing microphone audio.
   * Cleans up analyser, timer, and audio context.
   */
  const stopMicMeter = useCallback(() => {
    if (micMeterTimerRef.current) {
      clearInterval(micMeterTimerRef.current);
      micMeterTimerRef.current = null;
    }
    micAnalyserRef.current = null;
    if (micMeterCtxRef.current) {
      micMeterCtxRef.current.close().catch(() => {
        /* ignore */
      });
      micMeterCtxRef.current = null;
    }
  }, []);

  /**
   * Request microphone and camera permissions.
   * Runs once on mount.
   */
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((stream) => {
        userStreamRef.current = stream;
        setMicPermission(true);
        setCamPermission(true);
        // Start mic metering once we have the stream
        startMicMeter(stream);
      })
      .catch((err) => {
        console.error("[media permissions]", err);
        setMicPermission(false);
        setCamPermission(false);
      });

    // Cleanup on unmount
    return () => {
      try {
        userStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      stopMicMeter();
    };
  }, [startMicMeter, stopMicMeter]);

  return {
    micPermission,
    camPermission,
    userStreamRef,
    micSampleBufferRef,
    startMicMeter,
    stopMicMeter,
  };
}