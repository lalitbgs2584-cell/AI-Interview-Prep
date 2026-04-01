/**
 * ============================================================================
 * useTimer Hook
 * ============================================================================
 * 
 * Simple timer hook that tracks elapsed seconds during the interview.
 * 
 * Features:
 *  - Starts counting up when running is true
 *  - Formats as MM:SS
 *  - Returns ref to access raw seconds count
 *  - Cleans up interval on unmount
 * 
 * Usage:
 *  const { display, seconds } = useTimer(sessionRunning);
 *  // display = "05:23"
 *  // seconds.current = 323
 * 
 * ============================================================================
 */

import { useState, useRef, useEffect } from "react";

interface UseTimerReturn {
  display: string; // MM:SS format
  seconds: React.MutableRefObject<number>; // Raw seconds count
}

export function useTimer(running: boolean): UseTimerReturn {
  const [seconds, setSeconds] = useState(0);
  const secondsRef = useRef(0);

  useEffect(() => {
    // Stop timer if not running
    if (!running) return;

    // Start interval that increments every second
    const id = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
    }, 1000);

    // Cleanup interval on unmount or when running changes
    return () => clearInterval(id);
  }, [running]);

  /**
   * Format seconds as MM:SS
   * Example: 323 seconds → "05:23"
   */
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return {
    display,
    seconds: secondsRef,
  };
}