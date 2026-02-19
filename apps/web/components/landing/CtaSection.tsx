import { BtnPrimary } from "../BtnPrimary";
import { redirect } from "next/navigation";


export async function CtaSection() {


  const handleEarlyAccess = async () => {
    redirect("/login")
  }
  return (
    <section style={{ padding: "9rem 2rem", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 700, height: 500, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,229,176,0.06) 0%, transparent 70%)", top: "50%", left: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none" }} />
      <div style={{ position: "relative" }}>
        <h2 style={{ fontFamily: "var(--ff-display)", fontSize: "clamp(2.2rem, 5.5vw, 4.5rem)", fontWeight: 800, letterSpacing: "-0.04em", marginBottom: "1.5rem", lineHeight: 1.1 }}>
          Ready to interview<br />with confidence?
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "1.1rem", maxWidth: 460, margin: "0 auto 3rem", lineHeight: 1.7 }}>
          Join early access and get your first 3 AI interviews completely free. No credit card required.
        </p>
        <BtnPrimary onClick={handleEarlyAccess} large>Get Started</BtnPrimary>
      </div>
    </section>
  );
}