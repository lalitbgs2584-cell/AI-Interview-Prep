"use client";
import { Navbar, HeroSection, HowItWorksSection, FeaturesSection, ScoresDemoSection, CtaSection, Footer  } from "@/components/landing";
import {PricingSection} from "./PricingSection";

export default function LandingPage() {
  return (
    <>
      <div className="noise" />
      <Navbar />
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <PricingSection />
      <ScoresDemoSection />
      <CtaSection />
      <Footer />
    </>
  );
}