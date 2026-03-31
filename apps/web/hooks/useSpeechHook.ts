import { useCallback, useRef, useState } from "react";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface UseSpeechToTextOptions {
  /** Called when the user has been silent for `silenceThresholdMs` after speaking. Receives the FULL accumulated answer. */
  onFinalMessage?: (text: string) => void;
  /** Called the moment voice activity is detected — used for AI interruption. */
  onSpeechStart?: () => void;
  /** Milliseconds of silence before the accumulated answer is submitted. Default: 3000 */
  silenceThresholdMs?: number;
}

export const useSpeechToText = ({
  onFinalMessage,
  onSpeechStart,
  silenceThresholdMs = 3000,
}: UseSpeechToTextOptions = {}) => {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);

  // ── Refs (don't trigger re-renders, safe in closures) ──────────────────
  const recognitionRef       = useRef<any>(null);
  const silenceTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedRef       = useRef<string>("");   // full answer being built
  const isListeningRef       = useRef(false);
  const shouldListenRef      = useRef(false);        // desired state
  const speechStartFiredRef  = useRef(false);        // only fire onSpeechStart once per utterance
  const restartTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callback refs fresh so closures inside recognition handlers always
  // call the latest version without needing to re-create the recognition object.
  const onFinalMessageRef = useRef(onFinalMessage);
  const onSpeechStartRef  = useRef(onSpeechStart);
  onFinalMessageRef.current = onFinalMessage;
  onSpeechStartRef.current  = onSpeechStart;

  // ── Clear silence timer helper ──────────────────────────────────────────
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // ── Schedule submission after silence ──────────────────────────────────
  const scheduleSend = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      const text = accumulatedRef.current.trim();
      if (text) {
        onFinalMessageRef.current?.(text);
        accumulatedRef.current = "";
        setTranscript("");
        speechStartFiredRef.current = false;
      }
    }, silenceThresholdMs);
  }, [clearSilenceTimer, silenceThresholdMs]);

  // ── Build and attach a recognition instance ────────────────────────────
  const createAndStart = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error("[useSpeechToText] SpeechRecognition not supported in this browser.");
      return;
    }

    // Tear down previous instance cleanly
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous      = true;   // don't auto-stop on silence
    recognition.interimResults  = true;   // get live partial results
    recognition.lang            = "en-US";
    recognition.maxAlternatives = 1;

    // ── Handlers ──────────────────────────────────────────────────────────

    recognition.onstart = () => {
      isListeningRef.current = true;
      setIsListening(true);
    };

    /**
     * onsoundstart fires as soon as ANY sound is detected — before isFinal.
     * This is the earliest possible signal that the user is speaking,
     * which is what we need to interrupt the AI.
     */
    recognition.onsoundstart = () => {
      if (!speechStartFiredRef.current) {
        speechStartFiredRef.current = true;
        onSpeechStartRef.current?.();
      }
    };

    recognition.onresult = (event: any) => {
      let interimText = "";
      let newFinalChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          newFinalChunk += text + " ";
        } else {
          interimText += text;
        }
      }

      if (newFinalChunk) {
        // Append the new confirmed chunk to our running accumulator
        accumulatedRef.current = (accumulatedRef.current + " " + newFinalChunk).trimStart();
        // Show full accumulated + any current interim in the textarea
        setTranscript(accumulatedRef.current + interimText);
        // Reset silence countdown — user is still speaking
        scheduleSend();
      } else if (interimText) {
        // Show live partial without committing it yet
        setTranscript(accumulatedRef.current + " " + interimText);
      }
    };

    recognition.onerror = (event: any) => {
      // "no-speech" and "aborted" are expected during normal operation
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.warn("[useSpeechToText] Recognition error:", event.error);
    };

    /**
     * onend fires whenever the browser auto-stops the recogniser
     * (network error, tab blur, silence timeout, etc.).
     * We auto-restart ONLY if the consumer still wants listening.
     */
    recognition.onend = () => {
      isListeningRef.current = false;
      setIsListening(false);

      if (shouldListenRef.current) {
        // Brief delay to avoid thrashing on rapid stop/start cycles
        restartTimeoutRef.current = setTimeout(() => {
          if (shouldListenRef.current) createAndStart();
        }, 300);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      console.warn("[useSpeechToText] start() failed:", err);
    }
  }, [scheduleSend]);

  // ── Public API ──────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    shouldListenRef.current = true;
    if (!isListeningRef.current) createAndStart();
  }, [createAndStart]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    clearSilenceTimer();
    speechStartFiredRef.current = false;

    // Flush any accumulated text before stopping
    const remaining = accumulatedRef.current.trim();
    if (remaining) {
      onFinalMessageRef.current?.(remaining);
      accumulatedRef.current = "";
      setTranscript("");
    }

    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    isListeningRef.current = false;
    setIsListening(false);
  }, [clearSilenceTimer]);

  /**
   * Abort: stops listening and discards any accumulated text.
   * Used when the AI is speaking and we don't want a partial answer sent.
   */
  const abortListening = useCallback(() => {
    shouldListenRef.current = false;

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    clearSilenceTimer();
    speechStartFiredRef.current = false;
    accumulatedRef.current = "";
    setTranscript("");

    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    isListeningRef.current = false;
    setIsListening(false);
  }, [clearSilenceTimer]);

  return {
    transcript,
    isListening,
    startListening,
    stopListening,
    abortListening,
  };
};