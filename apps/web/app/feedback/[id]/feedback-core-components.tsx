"use client";

import React, { FC, ReactNode, useEffect, useState } from "react";
import { useAnimWidth, useCountUp } from "./feedback-hooks";
import { C, scoreColor, scoreLabel } from "./feedback-shared";

interface ScoreRingProps {
  score: number;
  size?: number;
  stroke?: number;
}

export const ScoreRing: FC<ScoreRingProps> = ({ score, size = 148, stroke = 11 }) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const [dash, setDash] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setDash(circumference * (score / 100)), 150);
    return () => clearTimeout(id);
  }, [circumference, score]);

  const color = scoreColor(score);
  const count = useCountUp(score);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: "stroke-dasharray 1.3s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.22, fontWeight: 900, color, fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>
          {count}
        </span>
        <span style={{ fontSize: size * 0.1, color: "rgba(255,255,255,0.2)", fontFamily: "'DM Mono', monospace" }}>/100</span>
      </div>
    </div>
  );
};

interface AnimBarProps {
  score: number;
  delay?: number;
  color?: string;
}

export const AnimBar: FC<AnimBarProps> = ({ score, delay = 0, color }) => {
  const width = useAnimWidth(score, delay);
  const resolvedColor = color ?? scoreColor(score);

  return (
    <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: `linear-gradient(90deg, ${resolvedColor}70, ${resolvedColor})`,
          borderRadius: 99,
          transition: "width 0.9s cubic-bezier(0.16,1,0.3,1)",
        }}
      />
    </div>
  );
};

export const ChartTip: FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div style={{ background: "#0f1218", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>{label}</div>
      {payload.map((entry: any, index: number) => (
        <div key={index} style={{ color: entry.color, fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
          {entry.name}: {Math.round(entry.value)}
        </div>
      ))}
    </div>
  );
};

interface PanelProps {
  children: ReactNode;
  accent?: boolean;
  style?: React.CSSProperties;
}

export const Panel: FC<PanelProps> = ({ children, accent = false, style = {} }) => (
  <div className="panel" style={style}>
    <div className={`panel-shine${accent ? " panel-shine-accent" : ""}`} />
    {children}
  </div>
);

interface PanelHeaderProps {
  title: string;
  sub?: string;
  right?: ReactNode;
}

export const PanelHeader: FC<PanelHeaderProps> = ({ title, sub, right }) => (
  <div className="panel-header">
    <div>
      <div className="panel-title">{title}</div>
      {sub && <div className="panel-sub">{sub}</div>}
    </div>
    {right}
  </div>
);

interface SkillRowProps {
  label: string;
  score: number;
  note?: string;
  delay?: number;
  color?: string;
}

export const SkillRow: FC<SkillRowProps> = ({ label, score, note, delay = 0, color }) => (
  <div style={{ marginBottom: 14, animation: "fadeUp 0.4s ease both", animationDelay: `${delay}s` }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 99,
            fontFamily: "'DM Mono', monospace",
            background: score >= 75 ? "rgba(16,185,129,0.1)" : score >= 55 ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
            color: scoreColor(score),
            border: `0.5px solid ${scoreColor(score)}40`,
          }}
        >
          {scoreLabel(score)}
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, color: color ?? scoreColor(score), fontFamily: "'DM Mono', monospace" }}>
          {score}
        </span>
      </div>
    </div>
    <AnimBar score={score} delay={delay * 1000} color={color} />
    {note && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 4 }}>{note}</div>}
  </div>
);

export { C };
