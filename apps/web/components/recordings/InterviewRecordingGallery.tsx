"use client";

import type { RecordingItem } from "@/lib/interview-recordings";

interface InterviewRecordingGalleryProps {
  recordings: RecordingItem[];
  emptyLabel?: string;
}

function formatRecordingDate(value: string) {
  try {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function formatRecordingSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export default function InterviewRecordingGallery({
  recordings,
  emptyLabel = "No recordings found for this interview yet.",
}: InterviewRecordingGalleryProps) {
  if (!recordings.length) {
    return (
      <div
        style={{
          padding: "28px 0",
          textAlign: "center",
          color: "#6b7280",
          fontSize: 13,
        }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
      }}
    >
      {recordings.map((recording) => (
        <article
          key={recording.name}
          style={{
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  color: "#f3f4f6",
                  fontSize: 14,
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                {recording.name}
              </div>
              <div
                style={{
                  color: "#9ca3af",
                  fontSize: 12,
                }}
              >
                {formatRecordingDate(recording.createdAt)} - {formatRecordingSize(recording.size)}
              </div>
            </div>

            <a
              href={recording.url}
              target="_blank"
              rel="noreferrer"
              style={{
                color: "#e5e7eb",
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                padding: "8px 12px",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              Open recording
            </a>
          </div>

          <video
            src={recording.url}
            controls
            preload="metadata"
            style={{
              width: "100%",
              borderRadius: 12,
              background: "#030712",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          />
        </article>
      ))}
    </div>
  );
}
