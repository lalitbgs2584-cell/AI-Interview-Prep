import { useRef, useCallback, useEffect } from "react";

interface UseRecordingManagerProps {
  userStreamRef: React.MutableRefObject<MediaStream | null>;
  aiAudioRef: React.MutableRefObject<HTMLAudioElement | null>;
  interviewId: string;
  enabled: boolean;
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

  const startRecording = useCallback(() => {
    if (!enabled || !userStreamRef.current || isRecordingRef.current) return;

    try {
      isRecordingRef.current = true;
      const stream = userStreamRef.current;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const mixedDestination = audioContext.createMediaStreamDestination();
      audioContext.createMediaStreamSource(stream).connect(mixedDestination);

      if (aiAudioRef.current && !aiSourceCreatedRef.current) {
        const aiSource = audioContext.createMediaElementSource(aiAudioRef.current);
        aiSource.connect(mixedDestination);
        aiSource.connect(audioContext.destination);
        aiSourceCreatedRef.current = true;
      }

      const mixedStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...mixedDestination.stream.getAudioTracks(),
      ]);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

      const recorder = new MediaRecorder(mixedStream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: "video/webm" });
          const formData = new FormData();
          formData.append("file", blob, `interview-${interviewId}.webm`);
          formData.append("interviewId", interviewId);

          const response = await fetch("/api/save-recording", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            console.error("[recording upload] failed:", response.statusText);
          }
        } catch (error) {
          console.error("[recording upload]", error);
        }
      };

      recorder.start(1000);
    } catch (error) {
      console.error("[recording start]", error);
      isRecordingRef.current = false;
    }
  }, [aiAudioRef, enabled, interviewId, userStreamRef]);

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current || !recorderRef.current) return;

    try {
      if (recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      isRecordingRef.current = false;
    } catch (error) {
      console.error("[recording stop]", error);
    }
  }, []);

  const cleanup = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
        // Ignore cleanup failures when the browser tears the context down itself.
      });
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
      cleanup();
    };
  }, [cleanup, stopRecording]);

  return {
    isRecording: isRecordingRef,
    startRecording,
    stopRecording,
    cleanup,
  };
}
