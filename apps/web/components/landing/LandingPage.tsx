"use client";
import { Navbar, HeroSection, HowItWorksSection, FeaturesSection, ScoresDemoSection, CtaSection, Footer  } from "@/components/landing";

export default function LandingPage() {
  return (
    <>
      <div className="noise" />
      <Navbar />
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <ScoresDemoSection />
      <CtaSection />
      <Footer />
    </>
  );
}