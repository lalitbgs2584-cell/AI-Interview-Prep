"use client";
import { useState } from "react";

interface BtnPrimaryProps {
  children: React.ReactNode;
  large?: boolean;
  onClick?: () => void;
  loading?: boolean;
}

export function BtnPrimary({ children, large, onClick, loading }: BtnPrimaryProps) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      disabled={loading}
      style={{
        background: "var(--accent)", color: "#000",
        padding: large ? "1rem 2.8rem" : "0.85rem 2.2rem",
        borderRadius: 8, fontSize: large ? "1.1rem" : "1rem",
        fontWeight: 700, fontFamily: "var(--ff-body)",
        border: "none", cursor: loading ? "not-allowed" : "pointer",
        transform: hov && !loading ? "translateY(-2px)" : "none",
        opacity: loading ? 0.75 : hov ? 0.88 : 1,
        transition: "all 0.2s",
        boxShadow: hov && !loading ? "0 8px 30px rgba(0,229,176,0.25)" : "none",
        display: "inline-flex", alignItems: "center", gap: "0.5rem",
      }}
    >
      {loading && (
        <span style={{
          width: 14, height: 14,
          border: "2px solid rgba(0,0,0,0.25)",
          borderTopColor: "#000",
          borderRadius: "50%",
          animation: "spin 0.6s linear infinite",
          flexShrink: 0,
        }} />
      )}
      {children}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}