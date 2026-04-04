export interface AudioMetrics {
  rmsValues: number[];
  silenceGaps: number[];
  peakCount: number;
  avgRMS: number;
  maxRMS: number;
  totalSilenceMs: number;
  speakingMs: number;
  rmsStd: number;
  zcrMean: number;
  zcrStd: number;
  activeSamples: number;
}

export class AudioMetricsCollector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationFrame: number | null = null;

  private rmsValues: number[] = [];
  private zcrValues: number[] = [];
  private silenceGaps: number[] = [];
  private peakCount = 0;
  private activeSamples = 0;

  private readonly SILENCE_THRESHOLD = 0.015;
  private readonly SILENCE_MIN_MS = 300;
  private readonly PEAK_THRESHOLD = 0.04;

  private silenceStart: number | null = null;
  private wasAboveThreshold = false;

  start(stream: MediaStream) {
    if (this.audioContext) return;

    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.3;

    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);

    this.loop();
  }

  private loop() {
    if (!this.analyser) return;

    const buffer = new Float32Array(this.analyser.fftSize);

    const tick = () => {
      this.analyser?.getFloatTimeDomainData(buffer);

      const rms = this.calculateRMS(buffer);
      const zcr = this.calculateZCR(buffer);

      this.rmsValues.push(rms);
      this.zcrValues.push(zcr);

      if (rms > this.SILENCE_THRESHOLD) {
        this.activeSamples += 1;
      }

      this.detectSilence(rms);
      this.detectPeak(rms);

      this.animationFrame = requestAnimationFrame(tick);
    };

    this.animationFrame = requestAnimationFrame(tick);
  }

  private calculateRMS(buffer: Float32Array): number {
    let sum = 0;

    for (let i = 0; i < buffer.length; i += 1) {
      const sample = buffer[i] ?? 0;
      sum += sample * sample;
    }

    return Math.sqrt(sum / buffer.length);
  }

  // Zero-crossing rate gives a rough signal for articulation changes in the waveform.
  private calculateZCR(buffer: Float32Array): number {
    let crossings = 0;

    for (let i = 1; i < buffer.length; i += 1) {
      const current = buffer[i] ?? 0;
      const previous = buffer[i - 1] ?? 0;
      if ((current >= 0) !== (previous >= 0)) {
        crossings += 1;
      }
    }

    return crossings / buffer.length;
  }

  private calculateStd(values: number[], mean: number): number {
    if (values.length === 0) return 0;

    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  private detectSilence(rms: number) {
    const now = Date.now();

    if (rms < this.SILENCE_THRESHOLD) {
      if (this.silenceStart === null) {
        this.silenceStart = now;
      }
      return;
    }

    if (this.silenceStart !== null) {
      const gap = now - this.silenceStart;
      if (gap >= this.SILENCE_MIN_MS) {
        this.silenceGaps.push(gap);
      }
      this.silenceStart = null;
    }
  }

  private detectPeak(rms: number) {
    if (!this.wasAboveThreshold && rms > this.PEAK_THRESHOLD) {
      this.wasAboveThreshold = true;
      return;
    }

    if (this.wasAboveThreshold && rms < this.PEAK_THRESHOLD) {
      this.wasAboveThreshold = false;
      this.peakCount += 1;
    }
  }

  stop(): AudioMetrics {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.source?.disconnect();
    this.analyser = null;
    this.source = null;
    this.audioContext?.close();
    this.audioContext = null;

    const avgRMS = this.rmsValues.length
      ? this.rmsValues.reduce((sum, value) => sum + value, 0) / this.rmsValues.length
      : 0;

    const maxRMS = Math.max(...this.rmsValues, 0);
    const totalSilenceMs = this.silenceGaps.reduce((sum, gap) => sum + gap, 0);
    const totalMs = this.rmsValues.length * (1000 / 60);
    const speakingMs = Math.max(0, totalMs - totalSilenceMs);
    const zcrMean = this.zcrValues.length
      ? this.zcrValues.reduce((sum, value) => sum + value, 0) / this.zcrValues.length
      : 0;

    return {
      rmsValues: this.rmsValues,
      silenceGaps: this.silenceGaps,
      peakCount: this.peakCount,
      avgRMS,
      maxRMS,
      totalSilenceMs,
      speakingMs,
      rmsStd: this.calculateStd(this.rmsValues, avgRMS),
      zcrMean,
      zcrStd: this.calculateStd(this.zcrValues, zcrMean),
      activeSamples: this.activeSamples,
    };
  }

  reset() {
    this.rmsValues = [];
    this.zcrValues = [];
    this.silenceGaps = [];
    this.peakCount = 0;
    this.activeSamples = 0;
    this.silenceStart = null;
    this.wasAboveThreshold = false;
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.animationFrame = null;
  }
}

