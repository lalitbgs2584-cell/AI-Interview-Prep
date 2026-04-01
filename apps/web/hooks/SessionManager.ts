/**
 * ============================================================================
 * SessionManager Class
 * ============================================================================
 * 
 * Encapsulates the complete session lifecycle.
 * Provides a clean API for managing interview session state and cleanup.
 * 
 * Responsibilities:
 *  - Track session state
 *  - Manage cleanup operations
 *  - Coordinate end-of-session actions
 *  - Log session events
 * 
 * Usage:
 *  const session = new SessionManager(interviewId);
 *  session.start();
 *  // ... interview runs ...
 *  session.end("user_ended", { durationSec: 300, tabSwitches: 0 });
 * 
 * ============================================================================
 */

type SessionState = "idle" | "running" | "ending" | "ended";
type EndReason =
  | "completed"
  | "user_ended"
  | "fullscreen"
  | "tab_switch"
  | "face_violation"
  | "identity_mismatch";

interface SessionMetrics {
  durationSec: number;
  interruptionCount: number;
  tabSwitches: number;
  fsExits: number;
  identityMismatches: number;
  faceViolations: number;
}

interface SessionActivityPayload {
  interviewId: string;
  endReason: EndReason;
  sessionDurationSec: number;
  tabSwitches: number;
  fsExits: number;
  identityMismatches: number;
}

/**
 * Callback types for session events
 */
type SessionEventListener = (event: SessionEvent) => void;

interface SessionEvent {
  type: "started" | "metrics_collected" | "activity_saved" | "ended";
  timestamp: number;
  data?: { payload: SessionActivityPayload } | Record<string, unknown>;
}

export class SessionManager {
  private interviewId: string;
  private state: SessionState = "idle";
  private startTime: number = 0;
  private endReason: EndReason = "user_ended";
  private metrics: SessionMetrics = {
    durationSec: 0,
    interruptionCount: 0,
    tabSwitches: 0,
    fsExits: 0,
    identityMismatches: 0,
    faceViolations: 0,
  };

  // Event listeners
  private listeners: SessionEventListener[] = [];

  // Cleanup callbacks
  private cleanupCallbacks: Array<() => void | Promise<void>> = [];

  constructor(interviewId: string) {
    this.interviewId = interviewId;
  }

  /**
   * Start the session.
   */
  start(): void {
    if (this.state !== "idle") {
      console.warn("[SessionManager] Cannot start - already in state:", this.state);
      return;
    }

    this.state = "running";
    this.startTime = Date.now();

    this._emit({
      type: "started",
      timestamp: Date.now(),
      data: { interviewId: this.interviewId },
    });
  }

  /**
   * End the session with reason and metrics.
   */
  async end(
    reason: EndReason,
    metrics: Partial<SessionMetrics>
  ): Promise<void> {
    if (this.state !== "running") {
      console.warn("[SessionManager] Cannot end - not running");
      return;
    }

    this.state = "ending";
    this.endReason = reason;

    // Update metrics
    if (metrics.durationSec === undefined) {
      metrics.durationSec = Math.floor((Date.now() - this.startTime) / 1000);
    }
    this.metrics = { ...this.metrics, ...metrics };

    try {
      // Run cleanup callbacks
      await this._cleanup();

      // Save activity to backend
      await this._saveActivity();

      this.state = "ended";

      this._emit({
        type: "ended",
        timestamp: Date.now(),
        data: {
          reason: this.endReason,
          metrics: this.metrics,
        },
      });
    } catch (err) {
      console.error("[SessionManager] Error ending session:", err);
      this.state = "ended"; // Mark as ended even if cleanup failed
    }
  }

  /**
   * Register a cleanup callback.
   * Called before session ends to clean up resources.
   */
  onCleanup(callback: () => void | Promise<void>): void {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * Register event listener.
   */
  addEventListener(listener: SessionEventListener): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Update metrics during session.
   */
  updateMetrics(partial: Partial<SessionMetrics>): void {
    this.metrics = { ...this.metrics, ...partial };
  }

  /**
   * Get current session state.
   */
  getState(): SessionState {
    return this.state;
  }

  /**
   * Get current metrics.
   */
  getMetrics(): Readonly<SessionMetrics> {
    return Object.freeze({ ...this.metrics });
  }

  /**
   * Get duration so far in seconds.
   */
  getDuration(): number {
    if (this.state === "idle") return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Check if session is running.
   */
  isRunning(): boolean {
    return this.state === "running";
  }

  /**
   * Internal: Emit session event to all listeners.
   */
  private _emit(event: SessionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[SessionManager] Listener error:", err);
      }
    }
  }

  /**
   * Internal: Run all cleanup callbacks.
   */
  private async _cleanup(): Promise<void> {
    for (const callback of this.cleanupCallbacks) {
      try {
        await callback();
      } catch (err) {
        console.error("[SessionManager] Cleanup error:", err);
      }
    }
  }

  /**
   * Internal: Save activity to backend.
   */
  private async _saveActivity(): Promise<void> {
    const payload: SessionActivityPayload = {
      interviewId: this.interviewId,
      endReason: this.endReason,
      sessionDurationSec: this.metrics.durationSec,
      tabSwitches: this.metrics.tabSwitches,
      fsExits: this.metrics.fsExits,
      identityMismatches: this.metrics.identityMismatches,
    };

    try {
      const response = await fetch("/api/activity/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this._emit({
        type: "activity_saved",
        timestamp: Date.now(),
        data: { payload },
      });
    } catch (err) {
      console.error("[SessionManager] Activity save failed:", err);
      throw err;
    }
  }
}