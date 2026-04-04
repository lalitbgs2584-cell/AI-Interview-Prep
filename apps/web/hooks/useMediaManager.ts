// Handles camera and mic setup for the interview page and keeps a rolling
// buffer of simple audio stats for answer analytics.

import { useState, useRef, useCallback, useEffect } from "react";

interface MicSample {
  t: number;
  rms: number;
  zcr: number;
}

export function useMediaManager() {
  const [micPermission, setMicPermission] = useState(false);
  const [camPermission, setCamPermission] = useState(false);

  const userStreamRef = useRef<MediaStream | null>(null);
  const micMeterCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micMeterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micSampleBufferRef = useRef<MicSample[]>([]);

  const startMicMeter = useCallback((stream: MediaStream) => {
    if (micMeterTimerRef.current) return;

    if (!micMeterCtxRef.current) {
      micMeterCtxRef.current = new AudioContext();
    }

    const ctx = micMeterCtxRef.current;
    if (!ctx || micAnalyserRef.current) return;

    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;

      source.connect(analyser);
      micAnalyserRef.current = analyser;

      const fftSize = analyser.fftSize;
      const frame = new Float32Array(fftSize);

      micMeterTimerRef.current = setInterval(() => {
        analyser.getFloatTimeDomainData(frame);

        let sumSquares = 0;
        for (let i = 0; i < frame.length; i++) {
          sumSquares += frame[i]! * frame[i]!;
        }
        const rms = Math.sqrt(sumSquares / frame.length);

        let crossings = 0;
        for (let i = 1; i < frame.length; i++) {
          if (frame[i - 1]! <= 0 && frame[i]! > 0) {
            crossings += 1;
          }
        }
        const zcr = crossings / frame.length;

        micSampleBufferRef.current.push({
          t: Date.now(),
          rms,
          zcr,
        });

        // Keep a rolling window so analytics stay bounded.
        if (micSampleBufferRef.current.length > 3000) {
          micSampleBufferRef.current.splice(
            0,
            micSampleBufferRef.current.length - 3000
          );
        }
      }, 120);
    } catch (err) {
      console.error("[mic meter] setup failed:", err);
      stopMicMeter();
    }
  }, []);

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

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((stream) => {
        userStreamRef.current = stream;
        setMicPermission(true);
        setCamPermission(true);
        startMicMeter(stream);
      })
      .catch((err) => {
        console.error("[media permissions]", err);
        setMicPermission(false);
        setCamPermission(false);
      });

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
