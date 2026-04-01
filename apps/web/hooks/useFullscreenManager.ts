/**
 * ============================================================================
 * useFullscreenManager Hook
 * ============================================================================
 * 
 * Manages fullscreen state and detects fullscreen exits.
 * 
 * Features:
 *  - Track fullscreen state
 *  - Detect exits and show warnings (max 2 exits = termination)
 *  - Handle reentry after warnings
 * 
 * Returns:
 *  - isFullscreen: boolean
 *  - fsWarningCount: number (0-2)
 *  - showFsWarning: boolean
 *  - handleGateEnter: async function
 *  - handleReenterFullscreen: async function
 * 
 * ============================================================================
 */

import { useState, useRef, useCallback, useEffect } from "react";

interface UseFullscreenManagerProps {
  showGate: boolean;
  isEnding: boolean;
  sessionRunning: boolean;
  onTerminate: (reason: "fullscreen") => void;
}

export function useFullscreenManager({
  showGate,
  isEnding,
  sessionRunning,
  onTerminate,
}: UseFullscreenManagerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsWarningCount, setFsWarningCount] = useState(0);
  const [showFsWarning, setShowFsWarning] = useState(false);

  const fsWarningCountRef = useRef(0);
  const hasEnteredFsOnce = useRef(false);
  const suppressFsExitRef = useRef(false);

  /**
   * Request fullscreen mode for the entire document.
   */
  const enterFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if ((el as any).webkitRequestFullscreen)
        await (el as any).webkitRequestFullscreen();
      hasEnteredFsOnce.current = true;
      setIsFullscreen(true);
    } catch (err) {
      console.warn("[fullscreen] enter failed:", err);
    }
  }, []);

  /**
   * Called from gate modal - enters fullscreen and dismisses gate.
   */
  const handleGateEnter = useCallback(async () => {
    await enterFullscreen();
  }, [enterFullscreen]);

  /**
   * Exits fullscreen (called on first warning retry).
   */
  const handleReenterFullscreen = useCallback(async () => {
    // If user already exited fullscreen twice, terminate session
    if (fsWarningCountRef.current >= 2) {
      onTerminate("fullscreen");
      return;
    }
    setShowFsWarning(false);
    await enterFullscreen();
  }, [enterFullscreen, onTerminate]);

  /**
   * Monitor fullscreen changes.
   * If user exits fullscreen more than once, warn and eventually terminate.
   */
  useEffect(() => {
    const onChange = () => {
      const inFs =
        !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
      setIsFullscreen(inFs);

      // Don't trigger warning if:
      // - User just entered fullscreen
      // - User has never entered fullscreen
      // - Exit is being suppressed (by our code)
      // - Session is ending
      // - Session is not running
      if (
        inFs ||
        !hasEnteredFsOnce.current ||
        suppressFsExitRef.current ||
        isEnding ||
        !sessionRunning
      ) {
        suppressFsExitRef.current = false;
        return;
      }

      // Increment exit count and show warning
      fsWarningCountRef.current += 1;
      const n = fsWarningCountRef.current;
      setFsWarningCount(n);
      setShowFsWarning(true);

      // On second exit, terminate immediately
      if (n >= 2) {
        setTimeout(() => onTerminate("fullscreen"), 800);
      }
    };

    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);

    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [isEnding, sessionRunning, onTerminate]);

  return {
    isFullscreen,
    fsWarningCount,
    showFsWarning,
    handleGateEnter,
    handleReenterFullscreen,
    suppressFsExitRef, // For internal use in endSession
  };
}