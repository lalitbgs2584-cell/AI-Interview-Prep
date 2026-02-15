"use client";
import { FEATURES } from "@/constants/landing";
import { useInView } from "@/hooks/userInView";
import { FeatureCard } from "./FeatureCard";

export function FeaturesSection() {
  const [featRef, featVisible] = useInView();
  return (
    <section id="features" style={{ padding: "7rem 2rem", maxWidth: 1200, margin: "0 auto" }}>
      <h2 style={{ fontFamily: "var(--ff-display)", fontSize: "clamp(2rem, 4vw, 3.2rem)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.1, marginBottom: "0.8rem" }}>
        Everything you need<br />to prepare smarter
      </h2>
      <p style={{ color: "var(--muted)", maxWidth: 520, marginBottom: "4rem", fontSize: "1.05rem", lineHeight: 1.7 }}>
        A full-stack AI pipeline built around your success — not generic interview scripts.
      </p>
      <div ref={featRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
        {FEATURES.map((f, i) => <FeatureCard key={i} {...f} visible={featVisible} delay={i * 0.1} />)}
      </div>
    </section>
  );
}