/**
 * ============================================================================
 * useTabSwitchDetection Hook
 * ============================================================================
 * 
 * Detects when user switches away from the interview tab/window.
 * 
 * Features:
 *  - Uses document.visibilityState to detect tab switches
 *  - Warns on first switch, terminates on second switch
 *  - Prevents false positives (respects isEnding flag)
 * 
 * Returns:
 *  - tabSwitchCount: number (0-2)
 *  - showTabWarning: boolean
 *  - handleDismissTabWarning: function
 * 
 * ============================================================================
 */

import { useState, useRef, useCallback, useEffect } from "react";

interface UseTabSwitchDetectionProps {
  isEnding: boolean;
  onTerminate: (reason: "tab_switch") => void;
}

export function useTabSwitchDetection({
  isEnding,
  onTerminate,
}: UseTabSwitchDetectionProps) {
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);

  const tabSwitchCountRef = useRef(0);

  /**
   * Dismiss warning modal.
   * If this was the second switch, terminate instead.
   */
  const handleDismissTabWarning = useCallback(() => {
    if (tabSwitchCountRef.current >= 2) {
      onTerminate("tab_switch");
    } else {
      setShowTabWarning(false);
    }
  }, [onTerminate]);

  /**
   * Listen for visibility changes (tab switches/minimization).
   * Only count when tab becomes hidden, not when it becomes visible again.
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Only count when document becomes hidden (user switches away)
      if (document.visibilityState !== "hidden" || isEnding) return;

      tabSwitchCountRef.current += 1;
      const n = tabSwitchCountRef.current;
      setTabSwitchCount(n);
      setShowTabWarning(true);

      // On second switch, terminate immediately
      if (n >= 2) {
        setTimeout(() => onTerminate("tab_switch"), 800);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isEnding, onTerminate]);

  return {
    tabSwitchCount,
    showTabWarning,
    handleDismissTabWarning,
  };
}