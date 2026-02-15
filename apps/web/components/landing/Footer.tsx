export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 3.5rem" }}>
      <div className="footer-inner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--muted)", fontSize: "0.85rem", maxWidth: 1200, margin: "0 auto" }}>
        <a href="#" style={{ fontFamily: "var(--ff-display)", fontSize: "1.2rem", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text)", textDecoration: "none" }}>
          interview<span style={{ color: "var(--accent)" }}>AI</span>
        </a>
        <span>© 2026 InterviewAI. All rights reserved.</span>
      </div>
    </footer>
  );
}