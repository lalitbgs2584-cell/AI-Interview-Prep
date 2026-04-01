/**
 * ============================================================================
 * AnswerAnalyticsBuilder Class
 * ============================================================================
 * 
 * Builds detailed analytics for each answer using mic samples.
 * 
 * Metrics include:
 *  - Response latency: time from question to first speech
 *  - Speaking time: duration of actual speech
 *  - Silence time: duration of silence
 *  - Pause ratio: percentage of time silent
 *  - Long pauses: count of pauses > 1.5 seconds
 *  - Words per minute: speaking rate
 *  - RMS/ZCR statistics: audio quality indicators
 *  - Interruptions: whether user spoke during AI speech
 * 
 * ============================================================================
 */

interface MicSample {
  t: number;
  rms: number;
  zcr: number;
}

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

export class AnswerAnalyticsBuilder {
  private micSampleBufferRef: React.MutableRefObject<MicSample[]>;
  private questionReceivedAtRef: React.MutableRefObject<number>;
  private firstSpeechAtRef: React.MutableRefObject<number | null>;
  private interruptedThisAnswerRef: React.MutableRefObject<boolean>;

  // Threshold for detecting active speech (RMS value)
  private readonly ACTIVE_SPEECH_THRESHOLD = 0.014;

  // Duration for a long pause (milliseconds)
  private readonly LONG_PAUSE_THRESHOLD_MS = 1500;

  // Sample interval (matches mic meter interval)
  private readonly SAMPLE_INTERVAL_MS = 120;

  constructor(
    micSampleBufferRef: React.MutableRefObject<MicSample[]>
  ) {
    this.micSampleBufferRef = micSampleBufferRef;
    this.questionReceivedAtRef = { current: Date.now() };
    this.firstSpeechAtRef = { current: null };
    this.interruptedThisAnswerRef = { current: false };
  }

  /**
   * Record the timestamp when a question is received.
   * This is used to calculate response latency.
   */
  recordQuestion(timestamp: number): void {
    this.questionReceivedAtRef.current = timestamp;
    this.firstSpeechAtRef.current = null;
    this.interruptedThisAnswerRef.current = false;
  }

  /**
   * Record the timestamp of first speech.
   * Called when user starts speaking.
   */
  recordFirstSpeech(): void {
    if (!this.firstSpeechAtRef.current) {
      this.firstSpeechAtRef.current = Date.now();
    }
  }

  /**
   * Mark that user interrupted AI speech.
   */
  recordInterruption(): void {
    this.interruptedThisAnswerRef.current = true;
  }

  /**
   * Reset analytics state for next answer.
   */
  reset(): void {
    this.firstSpeechAtRef.current = null;
    this.interruptedThisAnswerRef.current = false;
  }

  /**
   * Build complete analytics envelope for an answer.
   * Called when user submits their response.
   */
  build(answerText: string): AnswerAnalyticsEnvelope {
    const submittedAt = Date.now();
    const questionAt = this.questionReceivedAtRef.current;
    const firstSpeechAt = this.firstSpeechAtRef.current;

    // Determine window of samples to analyze
    const startAt = firstSpeechAt ?? questionAt;
    const sampleWindow = this.micSampleBufferRef.current.filter(
      (s) => s.t >= startAt && s.t <= submittedAt
    );

    // Calculate word count
    const wordCount = answerText
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    // Analyze samples for speaking vs silence
    const { activeCount, longPauseCount, pauseMs, speakingMs } =
      this._analyzeSpeechPattern(sampleWindow);

    const samples = sampleWindow.length;
    const silenceMs = Math.max(0, samples * this.SAMPLE_INTERVAL_MS - speakingMs);
    const pauseRatio = samples > 0 ? silenceMs / (samples * this.SAMPLE_INTERVAL_MS) : 0;

    // Calculate response latency (time from question to first speech)
    const latency = Math.max(0, (firstSpeechAt ?? submittedAt) - questionAt);

    // Calculate words per minute
    // Use max of speaking time or elapsed time to avoid div by zero
    const mins = Math.max(
      0.25,
      speakingMs / 60000 || (submittedAt - questionAt) / 60000
    );
    const wpm = wordCount / mins;

    // Calculate RMS and ZCR statistics
    const rmsValues = sampleWindow.map((s) => s.rms);
    const zcrValues = sampleWindow.map((s) => s.zcr);

    return {
      question_received_at_ms: questionAt,
      first_speech_at_ms: firstSpeechAt,
      submitted_at_ms: submittedAt,
      audio: {
        samples,
        active_samples: activeCount,
        speaking_ms: speakingMs,
        silence_ms: silenceMs,
        pause_ratio: Number(pauseRatio.toFixed(3)),
        long_pause_count: longPauseCount,
        rms_mean: Number(this._mean(rmsValues).toFixed(6)),
        rms_std: Number(this._std(rmsValues).toFixed(6)),
        zcr_mean: Number(this._mean(zcrValues).toFixed(6)),
        zcr_std: Number(this._std(zcrValues).toFixed(6)),
      },
      speech: {
        word_count: wordCount,
        response_latency_ms: latency,
        words_per_minute: Number(wpm.toFixed(2)),
        interrupted_ai: this.interruptedThisAnswerRef.current,
      },
    };
  }

  /**
   * Analyze speech pattern from samples.
   * Determines active vs silent regions and long pauses.
   */
  private _analyzeSpeechPattern(
    sampleWindow: MicSample[]
  ): {
    activeCount: number;
    longPauseCount: number;
    pauseMs: number;
    speakingMs: number;
  } {
    let activeCount = 0;
    let longPauseCount = 0;
    let currentPauseMs = 0;

    for (const sample of sampleWindow) {
      const isSpeaking = sample.rms > this.ACTIVE_SPEECH_THRESHOLD;

      if (isSpeaking) {
        // User is speaking - check if pause was long
        if (currentPauseMs >= this.LONG_PAUSE_THRESHOLD_MS) {
          longPauseCount += 1;
        }
        currentPauseMs = 0;
        activeCount += 1;
      } else {
        // User is silent
        currentPauseMs += this.SAMPLE_INTERVAL_MS;
      }
    }

    const speakingMs = activeCount * this.SAMPLE_INTERVAL_MS;

    return {
      activeCount,
      longPauseCount,
      pauseMs: currentPauseMs,
      speakingMs,
    };
  }

  /**
   * Calculate arithmetic mean of array.
   */
  private _mean(arr: number[]): number {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Calculate standard deviation of array.
   */
  private _std(arr: number[]): number {
    if (!arr.length) return 0;
    const m = this._mean(arr);
    const variance = arr.reduce((acc, x) => acc + (x - m) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }
}