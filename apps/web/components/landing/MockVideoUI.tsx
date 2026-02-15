import { WAVE_BARS, LIVE_SCORES } from "../../constants/landing";
import { WaveBar } from "../WaveBar";

function VidLabel({ text }: { text: string }) {
  return (
    <div style={{
      position: "absolute", bottom: 14, left: 14, zIndex: 5,
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
      border: "1px solid var(--border)", padding: "0.28rem 0.75rem", borderRadius: 6,
      fontFamily: "var(--ff-mono)", fontSize: "0.67rem", color: "var(--muted)",
      display: "flex", alignItems: "center", gap: 6,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", animation: "dotPulse 1.8s infinite" }} />
      {text}
    </div>
  );
}

export function MockVideoUI() {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18,
      overflow: "hidden", aspectRatio: "16/9", position: "relative",
      boxShadow: "0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
    }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(0,229,176,0.03) 0%, transparent 60%)", pointerEvents: "none", zIndex: 1 }} />

      <div className="vid-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100%" }}>
        {/* Human pane */}
        <div style={{ position: "relative", background: "linear-gradient(160deg, #0a1520 0%, #0d1a25 100%)", borderRight: "1px solid var(--border)" }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: 100, height: 150, background: "linear-gradient(180deg, #1c2a3a 0%, #142030 100%)", borderRadius: "55px 55px 0 0", position: "relative" }}>
              <div style={{ position: "absolute", top: -46, left: "50%", transform: "translateX(-50%)", width: 60, height: 60, borderRadius: "50%", background: "#1c2a3a" }} />
            </div>
          </div>
          <div style={{ position: "absolute", top: 14, left: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff6b6b", animation: "dotPulse 2s infinite 0.3s" }} />
            <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.65rem", color: "rgba(255,255,255,0.3)" }}>REC</span>
          </div>
          <VidLabel text="You — Candidate" />
        </div>

        {/* AI pane */}
        <div style={{ position: "relative", background: "linear-gradient(160deg, #0a1a14 0%, #0b1520 100%)" }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.2rem" }}>
            <div style={{
              width: 90, height: 90, borderRadius: "50%",
              background: "radial-gradient(circle at 35% 35%, rgba(0,229,176,0.28), rgba(0,229,176,0.04))",
              border: "1px solid rgba(0,229,176,0.28)", display: "flex", alignItems: "center", justifyContent: "center",
              animation: "orbPulse 3s ease-in-out infinite", position: "relative",
            }}>
              <div style={{ position: "absolute", inset: -7,  borderRadius: "50%", border: "1px solid rgba(0,229,176,0.1)" }} />
              <div style={{ position: "absolute", inset: -15, borderRadius: "50%", border: "1px solid rgba(0,229,176,0.05)" }} />
              <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="18" r="8" stroke="#00e5b0" strokeWidth="1.5" fill="none" opacity="0.85" />
                <circle cx="18" cy="18" r="3" fill="#00e5b0" opacity="0.9" />
                <path d="M18 6 L18 10 M18 26 L18 30 M6 18 L10 18 M26 18 L30 18" stroke="#00e5b0" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
              </svg>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {WAVE_BARS.map((w, i) => <WaveBar key={i} delay={w.delay} height={w.h} />)}
            </div>
          </div>
          <VidLabel text="InterviewGenie — Interviewer" />
        </div>
      </div>

      {/* Live scores overlay */}
      <div style={{
        position: "absolute", top: 16, right: 16, zIndex: 10,
        background: "rgba(10,14,20,0.92)", backdropFilter: "blur(14px)",
        border: "1px solid var(--border)", borderRadius: 11, padding: "0.85rem 1rem", minWidth: 158,
      }}>
        <p style={{ fontFamily: "var(--ff-mono)", fontSize: "0.62rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.7rem" }}>Live Analysis</p>
        {LIVE_SCORES.map((s, i) => (
          <div key={i} style={{ marginBottom: i < 2 ? "0.5rem" : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{s.label}</span>
              <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.7rem", color: s.color }}>{s.val}%</span>
            </div>
            <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${s.val}%`, background: s.color, borderRadius: 2, animation: `barGrow${i} 1.4s ${0.8 + i * 0.2}s ease both` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Question chip */}
      <div style={{
        position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", zIndex: 10,
        background: "rgba(10,14,20,0.95)", backdropFilter: "blur(14px)",
        border: "1px solid rgba(0,229,176,0.22)", borderRadius: 8,
        padding: "0.6rem 1.2rem", whiteSpace: "nowrap",
        fontFamily: "var(--ff-mono)", fontSize: "0.7rem", color: "var(--accent)",
        animation: "chipBlink 2.5s ease-in-out infinite",
      }}>
        ⚡ Explain your approach to system design at scale
      </div>
    </div>
  );
}