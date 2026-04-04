"use client";

import { adminMediaUrl, type RecordingItem } from "@/lib/admin-api";

interface AdminRecordingGalleryProps {
  recordings: RecordingItem[];
  emptyLabel?: string;
}

function formatBytes(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminRecordingGallery({
  recordings,
  emptyLabel = "No recordings available for this interview yet.",
}: AdminRecordingGalleryProps) {
  if (!recordings.length) {
    return <div style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>{emptyLabel}</div>;
  }

  return (
    <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
      {recordings.map((recording) => (
        <div key={recording.name} className="panel" style={{ padding: "0.9rem" }}>
          <video
            controls
            preload="metadata"
            src={adminMediaUrl(recording.url)}
            style={{ width: "100%", borderRadius: 12, background: "#05070b", border: "1px solid var(--border)" }}
          />
          <div style={{ marginTop: "0.7rem", display: "grid", gap: "0.25rem" }}>
            <div style={{ color: "var(--text)", fontSize: "0.82rem", fontWeight: 600, wordBreak: "break-all" }}>
              {recording.name}
            </div>
            <div style={{ color: "var(--muted)", fontSize: "0.72rem", fontFamily: "var(--ff-mono)" }}>
              {new Date(recording.createdAt).toLocaleString("en-IN")} - {formatBytes(recording.size)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
