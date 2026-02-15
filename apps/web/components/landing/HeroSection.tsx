
import { BtnPrimary } from "../BtnPrimary";
import { MockVideoUI } from "./MockVideoUI";

export function HeroSection() {
  return (
    <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "8rem 2rem 5rem", position: "relative", overflow: "hidden" }}>
      {/* glows */}
      <div style={{ position: "absolute", width: 800, height: 800, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,229,176,0.065) 0%, transparent 70%)", top: "50%", left: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 500, height: 300, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(92,159,255,0.05) 0%, transparent 70%)", top: "20%", right: "8%", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255,107,107,0.04) 0%, transparent 70%)", bottom: "20%", left: "5%", pointerEvents: "none" }} />

      <div className="hero-anim-0" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(0,229,176,0.07)", border: "1px solid rgba(0,229,176,0.2)", color: "var(--accent)", fontFamily: "var(--ff-mono)", fontSize: "0.73rem", padding: "0.35rem 1rem", borderRadius: 100, marginBottom: "2rem", letterSpacing: "0.05em" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "dotPulse 2s infinite" }} />
        Live AI Interview Simulation 
      </div>

      <h1 className="hero-anim-1" style={{ fontFamily: "var(--ff-display)", fontSize: "clamp(3rem, 8.5vw, 7.5rem)", fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1, marginBottom: "1.5rem", maxWidth: 960 }}>
        Ace Every Interview<br />
        with{" "}
        <span style={{ color: "var(--accent)", position: "relative" }}>
          AI Precision
          <span style={{ position: "absolute", bottom: -4, left: 0, right: 0, height: 3, background: "var(--accent)", borderRadius: 2, opacity: 0.3 }} />
        </span>
      </h1>

      <p className="hero-anim-2" style={{ fontSize: "clamp(1rem, 2vw, 1.2rem)", color: "var(--muted)", maxWidth: 560, marginBottom: "3rem", lineHeight: 1.7 }}>
        Real-time video mock interviews powered by AI — personalized to your resume, scored on vocabulary, confidence, and technical depth.
      </p>

      <div className="hero-anim-3" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
        <BtnPrimary>Start Free Interview →</BtnPrimary>
        <a href="#how" className="btn-ghost-hover" style={{ background: "transparent", color: "var(--text)", padding: "0.85rem 2.2rem", borderRadius: 8, fontSize: "1rem", fontWeight: 600, fontFamily: "var(--ff-body)", border: "1px solid var(--border)", cursor: "pointer", textDecoration: "none", display: "inline-block", transition: "all 0.2s" }}>
          See how it works
        </a>
      </div>

      <div className="hero-anim-4 float-anim" style={{ marginTop: "5rem", width: "100%", maxWidth: 920, position: "relative" }}>
        <MockVideoUI />
      </div>
    </section>
  );
}