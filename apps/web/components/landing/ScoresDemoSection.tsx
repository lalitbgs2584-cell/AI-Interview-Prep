"use client";
import { SCORES } from "@/constants/landing";
import { useInView } from "@/hooks/userInView";
import { ScoreBar } from "../ScoreBar";


export function ScoresDemoSection() {
  const [scoresRef, scoresVisible] = useInView();
  return (
    <section style={{ padding: "0 2rem 7rem", maxWidth: 1200, margin: "0 auto" }}>
      <h2 style={{ fontFamily: "var(--ff-display)", fontSize: "clamp(2rem, 4vw, 3.2rem)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.1, marginBottom: "3rem" }}>
        Scores that actually<br />help you improve
      </h2>
      <div ref={scoresRef} className="scores-grid" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "2.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3rem", alignItems: "center" }}>
        <div>
          {SCORES.map((s, i) => (
            <div key={i} style={{ marginBottom: "1.6rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{s.label}</span>
                <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.88rem", color: s.color }}>{s.val}/100</span>
              </div>
              <ScoreBar color={s.color} val={s.val} animated={scoresVisible} />
            </div>
          ))}
        </div>
        <div>
          <div style={{ background: "rgba(0,0,0,0.25)", borderLeft: "2px solid var(--accent)", padding: "1.4rem 1.6rem", borderRadius: "0 10px 10px 0", marginBottom: "1.2rem" }}>
            <p style={{ fontFamily: "var(--ff-mono)", fontSize: "0.67rem", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.7rem" }}>AI Feedback</p>
            <p style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.8 }}>
              Your answer demonstrated solid understanding of distributed systems. Consider expanding on fault tolerance strategies — the interviewer probed twice on CAP theorem but you defaulted to high-level answers. Vocabulary score excellent; phrases like "eventual consistency" were used correctly and contextually.
            </p>
          </div>
          <p style={{ fontFamily: "var(--ff-mono)", fontSize: "0.73rem", color: "var(--muted)" }}>
            <span style={{ color: "var(--accent)" }}>↑ 12 pts</span> improvement since last session 
          </p>
        </div>
      </div>
    </section>
  );
}