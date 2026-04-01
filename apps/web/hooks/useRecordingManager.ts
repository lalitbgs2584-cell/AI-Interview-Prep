/**
 * ============================================================================
 * useRecordingManager Hook
 * ============================================================================
 * 
 * Manages audio/video recording during the interview.
 * 
 * Features:
 *  - Mixes user audio and AI audio into one stream
 *  - Records user video + mixed audio
 *  - Uploads recording to backend on completion
 *  - Handles cleanup on session end
 * 
 * Flow:
 *  1. Get user stream (camera + mic)
 *  2. Create audio context
 *  3. Mix user audio + AI audio
 *  4. Create recorder with mixed stream
 *  5. Start recording in 1-second chunks
 *  6. On stop → combine chunks → upload to backend
 * 
 * ============================================================================
 */

import { useRef, useCallback, useEffect } from "react";

interface UseRecordingManagerProps {
  userStreamRef: React.MutableRefObject<MediaStream | null>;
  aiAudioRef: React.MutableRefObject<HTMLAudioElement | null>;
  interviewId: string;
  enabled: boolean; // Start recording when true
}

export function useRecordingManager({
  userStreamRef,
  aiAudioRef,
  interviewId,
  enabled,
}: UseRecordingManagerProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isRecordingRef = useRef(false);
  const aiSourceCreatedRef = useRef(false);

  /**
   * Start recording the interview.
   * Mixes user audio + AI audio + video into single stream.
   */
  const startRecording = useCallback(() => {
    if (!userStreamRef.current || isRecordingRef.current) return;

    try {
      isRecordingRef.current = true;
      const stream = userStreamRef.current;

      // Create audio context for mixing
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Create destination for mixed audio
      const mixedDest = audioContext.createMediaStreamDestination();

      // Add user's mic audio to mix
      audioContext.createMediaStreamSource(stream).connect(mixedDest);

      // Add AI audio to mix (if not already done)
      if (aiAudioRef.current && !aiSourceCreatedRef.current) {
        const aiSource =
          audioContext.createMediaElementSource(aiAudioRef.current);
        aiSource.connect(mixedDest);
        // Also connect to speakers so user can hear AI
        aiSource.connect(audioContext.destination);
        aiSourceCreatedRef.current = true;
      }

      // Combine video tracks + mixed audio tracks
      const mixedStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...mixedDest.stream.getAudioTracks(),
      ]);

      // Choose MIME type based on browser support
      const mimeType = MediaRecorder.isTypeSupported(
        "video/webm;codecs=vp9,opus"
      )
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

      // Create recorder
      const recorder = new MediaRecorder(mixedStream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      /**
       * Collect data chunks as they become available.
       */
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      /**
       * When recording stops, combine chunks and upload.
       */
      recorder.onstop = async () => {
        try {
          // Combine all chunks into single blob
          const blob = new Blob(chunksRef.current, { type: "video/webm" });

          // Create form data
          const fd = new FormData();
          fd.append("file", blob, "recording.webm");
          fd.append("interviewId", interviewId);

          // Upload to backend
          const response = await fetch("/api/save-recording", {
            method: "POST",
            body: fd,
          });

          if (!response.ok) {
            console.error(
              "[recording upload] failed:",
              response.statusText
            );
          }
        } catch (err) {
          console.error("[recording upload]", err);
        }
      };

      // Start recording in 1-second chunks
      recorder.start(1000);
    } catch (err) {
      console.error("[recording start]", err);
      isRecordingRef.current = false;
    }
  }, [userStreamRef, aiAudioRef, interviewId]);

  /**
   * Stop the recorder and cleanup.
   */
  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current || !recorderRef.current) return;

    try {
      if (recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      isRecordingRef.current = false;
    } catch (err) {
      console.error("[recording stop]", err);
    }
  }, []);

  /**
   * Cleanup audio context.
   */
  const cleanup = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
        /* ignore */
      });
      audioContextRef.current = null;
    }
  }, []);

  /**
   * Auto-start recording when enabled.
   */
  useEffect(() => {
    if (enabled && !isRecordingRef.current) {
      startRecording();
    }
    return () => {
      // Don't cleanup on dependency change
      // Only cleanup when hook unmounts
    };
  }, [enabled, startRecording]);

  /**
   * Cleanup on unmount.
   */
  useEffect(() => {
    return () => {
      stopRecording();
      cleanup();
    };
  }, [stopRecording, cleanup]);

  return {
    isRecording: isRecordingRef,
    startRecording,
    stopRecording,
    cleanup,
  };
}