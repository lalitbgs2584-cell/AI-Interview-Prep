"use client";
import Link from "next/link";
import { useState } from "react";

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  cta?: boolean; // Sign Up  → solid coral
  ctl?: boolean; // Log In  → ghost/outlined
}

export function NavLink({ href, children, cta, ctl }: NavLinkProps) {
  const [hov, setHov] = useState(false);

  const getColor = () => {
    if (cta) return "#ffffff";
    if (ctl) return hov ? "#ff8162" : "#b0b8cc";
    return hov ? "#eef0f8" : "#6b7590";
  };

  const getBackground = () => {
    if (cta)
      return hov
        ? "linear-gradient(135deg, #ff5c35 0%, #ff3010 100%)"
        : "linear-gradient(135deg, #ff5c35 0%, #ff3010 100%)";
    return "transparent";
  };

  const getBorder = () => {
    if (ctl)
      return hov
        ? "1px solid rgba(255, 92, 53, 0.5)"
        : "1px solid rgba(255, 255, 255, 0.13)";
    return "none";
  };

  const getBoxShadow = () => {
    if (cta && hov) return "0 0 40px rgba(255, 92, 53, 0.38), 0 4px 20px rgba(0,0,0,0.45)";
    if (ctl && hov) return "0 0 0 3px rgba(255, 92, 53, 0.1)";
    return "none";
  };

  return (
    <Link
      href={href}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        color: getColor(),
        textDecoration: "none",
        fontSize: "0.88rem",
        fontWeight: cta || ctl ? 600 : 500,
        letterSpacing: "0.01em",
        padding: cta || ctl ? "0.55rem 1.3rem" : "0",
        background: getBackground(),
        border: getBorder(),
        borderRadius: cta ? 9999 : ctl ? 9999 : 0,
        transition: "all 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
        transform: (cta || ctl) && hov ? "translateY(-2px)" : "translateY(0)",
        boxShadow: getBoxShadow(),
        display: "inline-block",
      }}
    >
      {children}
    </Link>
  );
}