"use client";

import React, { FC } from "react";
import Link from "next/link";

export const Skeleton: FC = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {[200, 56, 320, 280].map((height, index) => (
      <div
        key={index}
        style={{
          height,
          borderRadius: 18,
          background: "rgba(255,255,255,0.03)",
          animation: `shimmer 1.8s ease-in-out ${index * 0.12}s infinite`,
        }}
      />
    ))}
  </div>
);

interface StatProps {
  val: number;
  label: string;
  color: string;
}

export const Stat: FC<StatProps> = ({ val, label, color }) => (
  <div style={{ textAlign: "center" }}>
    <div
      style={{
        fontSize: 22,
        fontWeight: 900,
        color,
        fontFamily: "'DM Mono', monospace",
        lineHeight: 1,
      }}
    >
      {val}
    </div>
    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>{label}</div>
  </div>
);

interface FeedbackCardProps {
  item: { point: string; tag?: string };
  variant: "good" | "bad";
  index: number;
}

export const FeedbackCard: FC<FeedbackCardProps> = ({ item, variant, index }) => {
  const isGood = variant === "good";
  const color = isGood ? "#10b981" : "#ef4444";
  const background = isGood ? "rgba(16,185,129,0.04)" : "rgba(239,68,68,0.04)";
  const border = isGood ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)";

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        background,
        border: `1px solid ${border}`,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        animation: `fadeUp 0.4s ease ${index * 0.05}s both`,
      }}
    >
      <span style={{ color, fontSize: 13, flexShrink: 0, marginTop: 1 }}>{isGood ? "+" : "-"}</span>
      <div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>{item.point}</div>
        {item.tag && (
          <span
            style={{
              display: "inline-block",
              marginTop: 5,
              fontSize: 9,
              padding: "2px 7px",
              borderRadius: 99,
              background: `${color}15`,
              border: `1px solid ${color}25`,
              color,
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {item.tag}
          </span>
        )}
      </div>
    </div>
  );
};

interface TopBarProps {
  router?: { push: (href: string) => void };
}

export const TopBar: FC<TopBarProps> = ({ router }) => (
  <nav className="fb-topbar">
    <div className="fb-topbar-left">
      <Link href="/dashboard" className="fb-logo">
        Interview<span>AI</span>
      </Link>
      <div className="fb-topbar-divider" />
      <span className="fb-topbar-title">Session Feedback</span>
    </div>
    <div className="fb-topbar-right">
      {router && (
        <button onClick={() => router.push("/dashboard")} className="btn-ghost">
          Dashboard
        </button>
      )}
    </div>
  </nav>
);
