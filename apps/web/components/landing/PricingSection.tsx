"use client";
import { Check } from "lucide-react";
import { useInView } from "@/hooks/userInView";

const PLANS = [
  {
    name: "Starter",
    price: "$9",
    period: "/mo",
    desc: "Perfect for individuals just getting started.",
    features: [
      "5 resume reviews",
      "Basic AI suggestions",
      "Email support",
      "1 template",
    ],
    popular: false,
    cta: "Get Started",
    num: "01",
  },
  {
    name: "Pro",
    price: "$29",
    period: "/mo",
    desc: "Everything you need to land your dream job.",
    features: [
      "Unlimited resume reviews",
      "Advanced AI coaching",
      "Priority support",
      "All templates",
      "Cover letter generator",
      "Interview prep",
    ],
    popular: true,
    cta: "Start Free Trial",
    num: "02",
  },
  {
    name: "Enterprise",
    price: "$79",
    period: "/mo",
    desc: "For teams and career services departments.",
    features: [
      "Everything in Pro",
      "Team dashboard",
      "Custom branding",
      "API access",
      "Dedicated account manager",
      "SSO & security",
    ],
    popular: false,
    cta: "Contact Sales",
    num: "03",
  },
];

export function PricingSection() {
  const [plansRef, plansVisible] = useInView();

  return (
    <div style={{ background: "var(--surface)", padding: "7rem 2rem" }} id="pricing">
      <div ref={plansRef} style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <p
          style={{
            fontFamily: "var(--ff-mono)",
            fontSize: "0.7rem",
            color: "var(--accent)",
            opacity: 0.5,
            marginBottom: "1rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Pricing
        </p>
        <h2
          style={{
            fontFamily: "var(--ff-display)",
            fontSize: "clamp(2rem, 4vw, 3.2rem)",
            fontWeight: 800,
            letterSpacing: "-0.035em",
            lineHeight: 1.1,
            marginBottom: "0.75rem",
          }}
        >
          Simple, transparent
          <br />
          pricing
        </h2>
        <p
          style={{
            fontSize: "0.95rem",
            color: "var(--muted)",
            lineHeight: 1.75,
            marginBottom: "4rem",
          }}
        >
          No hidden fees. Cancel anytime. Start with a free trial.
        </p>

        {/* Plans Grid — same border-gap trick as HowItWorks */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            background: "var(--border)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            overflow: "hidden",
            gap: "1px",
          }}
        >
          {PLANS.map((plan, i) => (
            <div
              key={i}
              className="step-card-hover"
              style={{
                background: plan.popular ? "var(--accent)" : "var(--card)",
                padding: "2.5rem 2rem",
                display: "flex",
                flexDirection: "column",
                opacity: plansVisible ? 1 : 0,
                transform: plansVisible ? "translateY(0)" : "translateY(24px)",
                transition: `opacity 0.6s ${i * 0.12}s, transform 0.6s ${i * 0.12}s`,
                position: "relative",
              }}
            >
              {/* Step number label */}
              <p
                style={{
                  fontFamily: "var(--ff-mono)",
                  fontSize: "0.7rem",
                  color: plan.popular ? "rgba(255,255,255,0.5)" : "var(--accent)",
                  opacity: plan.popular ? 0.7 : 0.5,
                  marginBottom: "1.5rem",
                  letterSpacing: "0.1em",
                }}
              >
                {plan.num}
              </p>

              {/* Popular badge */}
              {plan.popular && (
                <span
                  style={{
                    position: "absolute",
                    top: "2rem",
                    right: "2rem",
                    fontFamily: "var(--ff-mono)",
                    fontSize: "0.65rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    background: "rgba(255,255,255,0.2)",
                    color: "#fff",
                    padding: "0.25rem 0.6rem",
                    borderRadius: 4,
                  }}
                >
                  Most Popular
                </span>
              )}

              {/* Plan name */}
              <h3
                style={{
                  fontFamily: "var(--ff-display)",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  marginBottom: "0.4rem",
                  color: plan.popular ? "#fff" : "inherit",
                }}
              >
                {plan.name}
              </h3>

              {/* Description */}
              <p
                style={{
                  fontSize: "0.9rem",
                  color: plan.popular ? "rgba(255,255,255,0.7)" : "var(--muted)",
                  lineHeight: 1.75,
                  marginBottom: "1.5rem",
                }}
              >
                {plan.desc}
              </p>

              {/* Price */}
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.15rem", marginBottom: "2rem" }}>
                <span
                  style={{
                    fontFamily: "var(--ff-display)",
                    fontSize: "clamp(2rem, 3vw, 2.6rem)",
                    fontWeight: 800,
                    letterSpacing: "-0.04em",
                    lineHeight: 1,
                    color: plan.popular ? "#fff" : "inherit",
                  }}
                >
                  {plan.price}
                </span>
                <span
                  style={{
                    fontFamily: "var(--ff-mono)",
                    fontSize: "0.75rem",
                    color: plan.popular ? "rgba(255,255,255,0.6)" : "var(--muted)",
                    letterSpacing: "0.05em",
                  }}
                >
                  {plan.period}
                </span>
              </div>

              {/* Features */}
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "0.75rem", flex: 1 }}>
                {plan.features.map((f, fi) => (
                  <li
                    key={fi}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      fontSize: "0.9rem",
                      color: plan.popular ? "rgba(255,255,255,0.85)" : "var(--muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    <Check
                      size={14}
                      strokeWidth={2.5}
                      style={{
                        flexShrink: 0,
                        color: plan.popular ? "rgba(255,255,255,0.9)" : "var(--accent)",
                      }}
                    />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                style={{
                  fontFamily: "var(--ff-mono)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "0.85rem 1.5rem",
                  borderRadius: 8,
                  border: plan.popular ? "none" : "1px solid var(--border)",
                  background: plan.popular ? "rgba(255,255,255,0.15)" : "transparent",
                  color: plan.popular ? "#fff" : "inherit",
                  cursor: "pointer",
                  width: "100%",
                  transition: "background 0.2s, opacity 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = plan.popular
                    ? "rgba(255,255,255,0.25)"
                    : "var(--border)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = plan.popular
                    ? "rgba(255,255,255,0.15)"
                    : "transparent";
                }}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}