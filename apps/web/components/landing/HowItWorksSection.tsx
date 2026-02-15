"use client";
import { STEPS } from "@/constants/landing";
import { useInView } from "@/hooks/userInView";

export function HowItWorksSection() {
  const [stepsRef, stepsVisible] = useInView();
  return (
    <div style={{ background: "var(--surface)", padding: "7rem 2rem" }} id="how">
      <div ref={stepsRef} style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "var(--ff-display)", fontSize: "clamp(2rem, 4vw, 3.2rem)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.1, marginBottom: "4rem" }}>
          From resume to<br />offer letter
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", background: "var(--border)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", gap: "1px" }}>
          {STEPS.map((s, i) => (
            <div key={i} className="step-card-hover" style={{ background: "var(--card)", padding: "2.5rem 2rem", opacity: stepsVisible ? 1 : 0, transform: stepsVisible ? "translateY(0)" : "translateY(24px)", transition: `opacity 0.6s ${i * 0.12}s, transform 0.6s ${i * 0.12}s` }}>
              <p style={{ fontFamily: "var(--ff-mono)", fontSize: "0.7rem", color: "var(--accent)", opacity: 0.5, marginBottom: "1.5rem", letterSpacing: "0.1em" }}>{s.num}</p>
              <div style={{ fontSize: "2rem", marginBottom: "1.2rem" }}>{s.icon}</div>
              <h3 style={{ fontFamily: "var(--ff-display)", fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.6rem" }}>{s.title}</h3>
              <p style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.75 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}