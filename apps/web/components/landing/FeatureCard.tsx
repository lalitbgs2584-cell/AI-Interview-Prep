"use client";
import { useState } from "react";

interface FeatureCardProps { icon: string; title: string; desc: string; color: string; bg: string; visible: boolean; delay: number; }

export function FeatureCard({ icon, title, desc, color, bg, visible, delay }: FeatureCardProps) {
  const [hov, setHov] = useState(false);
  return (
    <div className="feat-card-hover" onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "2rem", position: "relative", overflow: "hidden", transition: "all 0.3s", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(28px)", transitionDelay: `${delay}s` }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: hov ? 1 : 0, transition: "opacity 0.3s" }} />
      <div style={{ width: 44, height: 44, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", marginBottom: "1.2rem" }}>{icon}</div>
      <h3 style={{ fontFamily: "var(--ff-display)", fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.5rem" }}>{title}</h3>
      <p style={{ fontSize: "0.88rem", color: "var(--muted)", lineHeight: 1.75, marginBottom: "1rem" }}>{desc}</p>
    </div>
  );
}