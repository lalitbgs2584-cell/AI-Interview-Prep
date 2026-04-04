"use client";

interface RadarPoint {
  label: string;
  value: number;
  color: string;
}

interface DifficultyPoint {
  label: string;
  avg: number | null;
  count: number;
  color: string;
}

interface ProgressRadarPanelProps {
  points: RadarPoint[];
  difficulties: DifficultyPoint[];
}

export function ProgressRadarPanel({ points, difficulties }: ProgressRadarPanelProps) {
  const centerX = 150;
  const centerY = 150;
  const radius = 92;
  const polygon = points
    .map((point, index) => {
      const angle = (-Math.PI / 2) + (Math.PI * 2 * index) / Math.max(points.length, 1);
      const scaled = radius * ((point.value || 0) / 100);
      const x = centerX + Math.cos(angle) * scaled;
      const y = centerY + Math.sin(angle) * scaled;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 0.8fr)", gap: "1rem" }}>
      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem", background: "var(--bg2)" }}>
        <div style={{ fontSize: "0.74rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.8rem" }}>
          Performance radar
        </div>
        <svg viewBox="0 0 300 300" style={{ width: "100%", maxWidth: 320, margin: "0 auto", display: "block" }}>
          {[25, 50, 75, 100].map((ring) => (
            <circle
              key={ring}
              cx={centerX}
              cy={centerY}
              r={(radius * ring) / 100}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
            />
          ))}
          {points.map((point, index) => {
            const angle = (-Math.PI / 2) + (Math.PI * 2 * index) / Math.max(points.length, 1);
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            return (
              <g key={point.label}>
                <line x1={centerX} y1={centerY} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" />
                <text x={x} y={y} textAnchor="middle" fill="#9ca3af" fontSize="11">
                  {point.label}
                </text>
              </g>
            );
          })}
          <polygon points={polygon} fill="rgba(139,92,246,0.22)" stroke="#8b5cf6" strokeWidth="2" />
          {points.map((point, index) => {
            const angle = (-Math.PI / 2) + (Math.PI * 2 * index) / Math.max(points.length, 1);
            const scaled = radius * ((point.value || 0) / 100);
            const x = centerX + Math.cos(angle) * scaled;
            const y = centerY + Math.sin(angle) * scaled;
            return <circle key={`${point.label}-dot`} cx={x} cy={y} r="4" fill={point.color} />;
          })}
        </svg>
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem", background: "var(--bg2)" }}>
        <div style={{ fontSize: "0.74rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.8rem" }}>
          Difficulty snapshot
        </div>
        <div style={{ display: "grid", gap: "0.8rem" }}>
          {difficulties.map((difficulty) => (
            <div key={difficulty.label}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.35rem", fontSize: "0.8rem" }}>
                <span style={{ color: difficulty.color, fontWeight: 700, textTransform: "capitalize" }}>{difficulty.label}</span>
                <span style={{ color: "var(--text)" }}>{difficulty.avg ?? "-"}{difficulty.avg != null ? "/100" : ""} - {difficulty.count} q</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ width: `${Math.min(100, difficulty.avg ?? 0)}%`, height: "100%", background: difficulty.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
