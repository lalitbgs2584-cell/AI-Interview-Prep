export const blockedStyles = {
  root: {
    minHeight: "100vh",
    background: "#080b12",
    backgroundImage: `
      radial-gradient(ellipse 90% 55% at 15% -5%, rgba(255, 92, 53, 0.07) 0%, transparent 55%),
      radial-gradient(ellipse 70% 50% at 88% 110%, rgba(167, 139, 250, 0.06) 0%, transparent 55%),
      radial-gradient(circle 1px at center, rgba(255,255,255,0.04) 1px, transparent 1px)
    `,
    backgroundSize: "100% 100%, 100% 100%, 28px 28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Outfit', sans-serif",
    WebkitFontSmoothing: "antialiased" as const,
    position: "relative" as const,
    overflow: "hidden",
  },

  card: {
    background: "#111620",
    border: "1px solid rgba(255, 255, 255, 0.065)",
    borderRadius: "24px",
    padding: "3rem 2.75rem 2.5rem",
    maxWidth: 460,
    width: "90%",
    position: "relative" as const,
    overflow: "hidden",
    boxShadow: "0 12px 48px rgba(0,0,0,0.55)",
  },

  cardTopLine: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    background:
      "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)",
    pointerEvents: "none" as const,
  },

  glowBehind: {
    position: "absolute" as const,
    top: -40,
    left: "50%",
    transform: "translateX(-50%)",
    width: 280,
    height: 120,
    background:
      "radial-gradient(ellipse, rgba(255,77,109,0.12) 0%, transparent 70%)",
    pointerEvents: "none" as const,
  },

  iconWrap: (pulseScale: number): React.CSSProperties => ({
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: "rgba(255,77,109,0.08)",
    border: "1px solid rgba(255,77,109,0.22)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 1.75rem",
    transition: "transform 0.6s cubic-bezier(0.34,1.56,0.64,1)",
    transform: `scale(${pulseScale})`,
  }),

  lockSvg: {
    width: 30,
    height: 30,
    color: "#ff4d6d",
  } as React.CSSProperties,

  tagCenter: {
    textAlign: "center" as const,
    marginBottom: "1rem",
  },

  tag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "0.22em 0.75em",
    borderRadius: 9999,
    fontFamily: "'Geist Mono', monospace",
    fontSize: "0.63rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    border: "1px solid rgba(255,77,109,0.28)",
    background: "rgba(255,77,109,0.06)",
    color: "#ff4d6d",
  } as React.CSSProperties,

  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#ff4d6d",
    display: "inline-block",
    animation: "dotPulse 2s ease infinite",
  } as React.CSSProperties,

  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: "1.65rem",
    fontWeight: 800,
    letterSpacing: "-0.03em",
    color: "#eef0f8",
    marginBottom: "0.65rem",
    lineHeight: 1.15,
    textAlign: "center" as const,
  },

  desc: {
    fontSize: "0.875rem",
    color: "#b0b8cc",
    lineHeight: 1.7,
    marginBottom: "1.75rem",
    textAlign: "center" as const,
  },

  divider: {
    height: 1,
    background:
      "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)",
    marginBottom: "1.5rem",
  },

  metaGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.75rem",
    marginBottom: "1.75rem",
  },

  metaItem: {
    background: "#161c28",
    border: "1px solid rgba(255,255,255,0.065)",
    borderRadius: 10,
    padding: "0.7rem 0.9rem",
  } as React.CSSProperties,

  metaLabel: {
    fontFamily: "'Geist Mono', monospace",
    fontSize: "0.6rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "#6b7590",
    marginBottom: "0.25rem",
  },

  metaValueRed: {
    fontSize: "0.82rem",
    color: "#ff4d6d",
    fontWeight: 600,
  } as React.CSSProperties,

  metaValue: {
    fontSize: "0.82rem",
    color: "#eef0f8",
    fontWeight: 600,
  } as React.CSSProperties,

  metaValueMuted: {
    fontSize: "0.82rem",
    color: "#b0b8cc",
    fontWeight: 500,
  } as React.CSSProperties,

  metaValueMono: {
    fontSize: "0.78rem",
    color: "#b0b8cc",
    fontWeight: 500,
    fontFamily: "'Geist Mono', monospace",
  } as React.CSSProperties,

  btnPrimary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "0.75rem 1.4rem",
    borderRadius: 9999,
    border: "none",
    background: "linear-gradient(135deg, #ff5c35 0%, #ff3010 100%)",
    color: "#fff",
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 600,
    fontSize: "0.9rem",
    cursor: "pointer",
    boxShadow: "0 0 30px rgba(255,92,53,0.22), 0 1px 3px rgba(0,0,0,0.35)",
    transition:
      "transform 0.22s cubic-bezier(0.22,1,0.36,1), box-shadow 0.22s cubic-bezier(0.22,1,0.36,1)",
    marginBottom: "0.75rem",
    textDecoration: "none",
  } as React.CSSProperties,

  btnPrimaryHover: {
    transform: "translateY(-2px)",
    boxShadow: "0 0 40px rgba(255,92,53,0.38), 0 4px 20px rgba(0,0,0,0.45)",
  } as React.CSSProperties,

  btnSecondary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "0.7rem 1.2rem",
    borderRadius: 9999,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "transparent",
    color: "#b0b8cc",
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 500,
    fontSize: "0.875rem",
    cursor: "pointer",
    transition: "border-color 0.22s, background 0.22s, color 0.12s",
    textDecoration: "none",
  } as React.CSSProperties,

  btnSecondaryHover: {
    borderColor: "rgba(255,92,53,0.38)",
    background: "rgba(255,92,53,0.07)",
    color: "#eef0f8",
  } as React.CSSProperties,

  footer: {
    marginTop: "1.5rem",
    textAlign: "center" as const,
    fontFamily: "'Geist Mono', monospace",
    fontSize: "0.62rem",
    letterSpacing: "0.07em",
    color: "#6b7590",
  },

  footerCode: {
    color: "#ff5c35",
    opacity: 0.8,
  } as React.CSSProperties,
} as const;

export const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500&display=swap');

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(20px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes dotPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.25; transform: scale(0.6); }
  }

  .blocked-card-enter {
    animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  ::selection { background: rgba(255, 92, 53, 0.28); color: #eef0f8; }

  :focus-visible {
    outline: 2px solid #ff5c35;
    outline-offset: 3px;
    border-radius: 6px;
  }
`;