"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    section: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: "DB" },
      { href: "/analytics", label: "Analytics", icon: "AN" },
    ],
  },
  {
    section: "Manage",
    items: [
      { href: "/users", label: "Users", icon: "US" },
      { href: "/interviews", label: "Interviews", icon: "IV" },
    ],
  },
  {
    section: "Monitor",
    items: [{ href: "/ai-monitor", label: "AI Monitor", icon: "AI" }],
  },
  {
    section: "Configure",
    items: [{ href: "/settings", label: "Settings", icon: "ST" }],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="admin-sidebar">
      <Link href="/" className="sidebar-logo" style={{ textDecoration: "none" }}>
        <div className="sidebar-logo-mark">A</div>
        <span className="sidebar-logo-text">InterviewAI</span>
        <span className="sidebar-logo-badge">Admin</span>
      </Link>

      <nav className="sidebar-nav">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="sidebar-section-label">{group.section}</div>
            {group.items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link${active ? " active" : ""}`}
                >
                  <span className="nav-icon" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="admin-user-pill">
          <div className="admin-avatar">SA</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.2 }}>
              Super Admin
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--muted)", fontFamily: "var(--ff-mono)" }}>
              admin@interviewai.io
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
