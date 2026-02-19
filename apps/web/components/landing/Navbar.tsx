"use client";
import { useState, useEffect } from "react";
import { NavLink } from "../NavLink";


export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "1.1rem 3.5rem",
      background: scrolled ? "rgba(8,10,15,0.85)" : "rgba(8,10,15,0.4)",
      backdropFilter: "blur(20px)",
      borderBottom: `1px solid ${scrolled ? "rgba(255,255,255,0.08)" : "transparent"}`,
      transition: "all 0.3s",
    }}>
      <a href="#" style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text)", textDecoration: "none" }}>
        Interview<span style={{ color: "var(--accent)" }}>AI</span>
      </a>
      <div className="nav-links-desktop" style={{ display: "flex", gap: "2.5rem", alignItems: "center" }}>
        <NavLink href="#features">Features</NavLink>
        <NavLink href="#how">How it works</NavLink>
        <NavLink href="#pricing">Pricing</NavLink>
        <NavLink href="/signup" cta>Sign Up</NavLink>
      </div>
    </nav>
  );
}