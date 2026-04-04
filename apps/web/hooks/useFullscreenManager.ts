// Keeps the interview in fullscreen and handles warning / retry state when
// the user exits it.

import { useState, useRef, useCallback, useEffect } from "react";

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type WebkitFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
};

interface UseFullscreenManagerProps {
  showGate: boolean;
  isEnding: boolean;
  sessionRunning: boolean;
  fullscreenExempt?: boolean;
  onTerminate: (reason: "fullscreen") => void;
}

export function useFullscreenManager({
  showGate,
  isEnding,
  sessionRunning,
  fullscreenExempt = false,
  onTerminate,
}: UseFullscreenManagerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsWarningCount, setFsWarningCount] = useState(0);
  const [showFsWarning, setShowFsWarning] = useState(false);

  const fsWarningCountRef = useRef(0);
  const hasEnteredFsOnce = useRef(false);
  const suppressFsExitRef = useRef(false);

  const enterFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement as FullscreenCapableElement;
      if (typeof el.requestFullscreen === "function") {
        await el.requestFullscreen();
      } else if (typeof el.webkitRequestFullscreen === "function") {
        await Promise.resolve(el.webkitRequestFullscreen());
      }
      hasEnteredFsOnce.current = true;
      setIsFullscreen(true);
      setShowFsWarning(false);
    } catch (err) {
      console.warn("[fullscreen] enter failed:", err);
    }
  }, []);

  const handleGateEnter = useCallback(async () => {
    await enterFullscreen();
  }, [enterFullscreen]);

  const handleReenterFullscreen = useCallback(async () => {
    if (fullscreenExempt) {
      setShowFsWarning(false);
      return;
    }

    if (fsWarningCountRef.current >= 2) {
      onTerminate("fullscreen");
      return;
    }

    setShowFsWarning(false);
    await enterFullscreen();
  }, [enterFullscreen, fullscreenExempt, onTerminate]);

  useEffect(() => {
    if (fullscreenExempt) {
      setShowFsWarning(false);
    }
  }, [fullscreenExempt]);

  useEffect(() => {
    const onChange = () => {
      const inFs =
        !!document.fullscreenElement || !!(document as WebkitFullscreenDocument).webkitFullscreenElement;
      setIsFullscreen(inFs);

      if (inFs) {
        setShowFsWarning(false);
        suppressFsExitRef.current = false;
        return;
      }

      if (
        !hasEnteredFsOnce.current ||
        suppressFsExitRef.current ||
        fullscreenExempt ||
        isEnding ||
        !sessionRunning
      ) {
        suppressFsExitRef.current = false;
        return;
      }

      fsWarningCountRef.current += 1;
      const nextCount = fsWarningCountRef.current;
      setFsWarningCount(nextCount);
      setShowFsWarning(true);

      if (nextCount >= 2) {
        setTimeout(() => onTerminate("fullscreen"), 800);
      }
    };

    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);

    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [fullscreenExempt, isEnding, sessionRunning, onTerminate]);

  return {
    isFullscreen,
    fsWarningCount,
    showFsWarning,
    handleGateEnter,
    handleReenterFullscreen,
    suppressFsExitRef,
  };
}
