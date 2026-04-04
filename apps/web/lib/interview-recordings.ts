export interface RecordingItem {
  name: string;
  url: string;
  createdAt: string;
  size: number;
}

type RecordingPayload =
  | RecordingItem[]
  | {
      recordings?: RecordingItem[];
    };

export async function fetchInterviewRecordings(interviewId: string) {
  const response = await fetch(
    `/api/recordings?interviewId=${encodeURIComponent(interviewId)}`,
  );

  if (!response.ok) return [];

  const payload = (await response.json()) as RecordingPayload;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.recordings)) return payload.recordings;
  return [];
}
