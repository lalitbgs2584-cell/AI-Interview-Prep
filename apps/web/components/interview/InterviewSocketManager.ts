/**
 * ============================================================================
 * InterviewSocketManager Class
 * ============================================================================
 * 
 * Manages all WebSocket communication with the backend.
 * 
 * Handles:
 *  - Joining interview session
 *  - Submitting answers
 *  - Receiving questions
 *  - Handling intent replies
 *  - Emitting interruptions
 *  - Emitting face violations
 *  - Session completion
 * 
 * ============================================================================
 */

import { getSocket } from "@/ws-client-config/socket";

interface AnswerAnalyticsEnvelope {
  question_received_at_ms: number;
  first_speech_at_ms: number | null;
  submitted_at_ms: number;
  audio: {
    samples: number;
    active_samples: number;
    speaking_ms: number;
    silence_ms: number;
    pause_ratio: number;
    long_pause_count: number;
    rms_mean: number;
    rms_std: number;
    zcr_mean: number;
    zcr_std: number;
  };
  speech: {
    word_count: number;
    response_latency_ms: number;
    words_per_minute: number;
    interrupted_ai: boolean;
  };
}

interface SetupListenersConfig {
  onQuestion?: (data: {
    question: string;
    index: number;
    difficulty: string;
    time?: number;
  }) => void;
  onIntentReply?: (reply: string) => void;
  onComplete?: () => void;
}

export class InterviewSocketManager {
  private interviewId: string;
  private socket = getSocket();
  private lastQuestionKey: string = "";
  private interruptionCount: number = 0;
  private answerThrottle: ReturnType<typeof setTimeout> | null = null;

  // Throttle interval for answer submission (prevent duplicates)
  private readonly ANSWER_THROTTLE_MS = 2000;

  constructor(interviewId: string) {
    this.interviewId = interviewId;
  }

  /**
   * Join the interview session.
   * Called after socket connection is established.
   */
  joinInterview(): void {
    try {
      this.socket.emit("join_interview", { interviewId: this.interviewId });
    } catch (err) {
      console.error("[socket] join_interview failed:", err);
    }
  }

  /**
   * Submit user's answer to the backend.
   * Includes full analytics from mic samples.
   *
   * @param answerText - The user's spoken/typed answer
   * @param analytics - Detailed analytics envelope built from audio data
   */
  submitAnswer(answerText: string, analytics: AnswerAnalyticsEnvelope): void {
    const trimmed = answerText.trim();
    if (!trimmed) return;

    // Throttle to prevent duplicate submissions within ANSWER_THROTTLE_MS
    if (this.answerThrottle) return;

    this.answerThrottle = setTimeout(() => {
      this.answerThrottle = null;
    }, this.ANSWER_THROTTLE_MS);

    try {
      this.socket.emit("submit_answer", {
        interviewId: this.interviewId,
        answer: {
          text: trimmed,
          analytics,
        },
      });
    } catch (err) {
      console.error("[socket] submit_answer failed:", err);
    }
  }

  /**
   * Emit interruption event to backend.
   * Called when user starts speaking while AI is speaking.
   */
  emitInterruption(): void {
    this.interruptionCount += 1;
    try {
      this.socket.emit("interview:interruption", {
        interviewId: this.interviewId,
        count: this.interruptionCount,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.warn("[socket] interruption emit failed:", err);
    }
  }

  /**
   * Emit face mismatch event to backend.
   * Called by identity verification when different person detected.
   */
  emitFaceMismatch(distance: number): void {
    try {
      this.socket.emit("interview:face_mismatch", {
        interviewId: this.interviewId,
        distance: Number(distance.toFixed(4)),
        timestamp: Date.now(),
      });
    } catch (err) {
      console.warn("[socket] face_mismatch emit failed:", err);
    }
  }

  /**
   * Emit session end event to backend.
   * Includes end reason and duration.
   */
  emitSessionEnd(reason: string, durationSec: number = 0): void {
    try {
      this.socket.emit("interview:end", {
        interviewId: this.interviewId,
        reason,
        durationSec,
      });
    } catch (err) {
      console.error("[socket] end event failed:", err);
    }
  }

  /**
   * Setup event listeners for backend messages.
   * Returns unsubscribe function to clean up listeners.
   *
   * @param config - Configuration object with event handlers
   * @returns Unsubscribe function
   */
  setupListeners(config: SetupListenersConfig): () => void {
    const socket = this.socket;

    /**
     * Handle incoming question from backend.
     * De-duplicates using question index and text.
     */
    const handleQuestion = (data: any) => {
      if (!data?.question) return;

      // Prevent duplicate processing
      const key = `${data.index}::${data.question}`;
      if (key === this.lastQuestionKey) return;
      this.lastQuestionKey = key;

      config.onQuestion?.(data);
    };

    /**
     * Handle intent-based reply from backend.
     * E.g., clarification requests or meta-responses from classifier.
     */
    const handleIntentReply = (data: { reply: string; intent: string }) => {
      if (!data?.reply) return;
      config.onIntentReply?.(data.reply);
    };

    /**
     * Handle interview completion from backend.
     */
    const handleComplete = () => {
      config.onComplete?.();
    };

    /**
     * Handle reconnection to socket.
     * Re-join the interview session.
     */
    const handleReconnect = () => {
      this.joinInterview();
    };

    // Register listeners
    socket.off("interview:question", handleQuestion);
    socket.off("interview:intent_reply", handleIntentReply);
    socket.off("interview:complete", handleComplete);
    socket.off("connect", handleReconnect);

    socket.on("interview:question", handleQuestion);
    socket.on("interview:intent_reply", handleIntentReply);
    socket.on("interview:complete", handleComplete);
    socket.on("connect", handleReconnect);

    // If already connected, join immediately
    if (socket.connected) {
      this.joinInterview();
    }

    // Return unsubscribe function
    return () => {
      socket.off("interview:question", handleQuestion);
      socket.off("interview:intent_reply", handleIntentReply);
      socket.off("interview:complete", handleComplete);
      socket.off("connect", handleReconnect);
    };
  }

  /**
   * Clean up socket manager.
   * Call on component unmount.
   */
  destroy(): void {
    if (this.answerThrottle) {
      clearTimeout(this.answerThrottle);
    }
  }
}