"use client";

import { useState } from "react";
import "../../dashboard.css"

import OverviewPage from "../../OverviewPage";
import ResumePage from "./ResumePage";
import InterviewsPage from "./InterviewsPage";
import ProgressPage from "./ProgressPage";
import SkillsPage from "./SkillsPage";
import HistoryPage from "./HistoryPage";


// ── Types ─────────────────────────────────────────────────────
type Page = "dashboard" | "interviews" | "progress" | "skills" | "resume" | "history";

interface DashboardAppProps {
  /** Optional user from your auth layer; falls back to mock */
  user?: { name?: string | null; avatar?: string | null; role?: string | null };
  /** Optional: called when user clicks "+ New Interview" */
  onNewInterview?: () => void;
}

// ── Nav config ────────────────────────────────────────────────
const NAV_ITEMS: { icon: string; label: string; page: Page }[] = [
  { icon: "⊞", label: "Dashboard",  page: "dashboard" },
  { icon: "◈", label: "Interviews", page: "interviews" },
  { icon: "◎", label: "Progress",   page: "progress" },
  { icon: "⬡", label: "Skills",     page: "skills" },
  { icon: "⊡", label: "Resume",     page: "resume" },
  { icon: "⊟", label: "History",    page: "history" },
];

const AI_TIP = {
  title: "Focus area this week",
  body:  "Your SQL scores dropped 12 points. I've queued 3 targeted sessions on indexing strategies and query optimization. Want to start now?",
};

// ── Component ─────────────────────────────────────────────────
export default function DashboardApp({ user, onNewInterview }: DashboardAppProps) {
  const [activePage, setActivePage]   = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);


  const userName = user?.name ?? "Guest";
  const userRole = user?.role ?? "Software Engineer";
  const userAvatar = user?.avatar ?? userName.slice(0, 2).toUpperCase();
  const streak = 7;

  const navigate = (page: Page) => {
    setActivePage(page);
    setSidebarOpen(false);
  };

  return (
    <>
      <div className="noise" />

      {/* Mobile hamburger */}
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open navigation"
        aria-expanded={sidebarOpen}
      >
        ☰
      </button>

      {/* Overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <div className="dash-root">

        {/* ════ SIDEBAR ════ */}
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <button
            className="sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            ✕
          </button>

          {/* Logo — clicking goes to dashboard */}
          <button className="sidebar-logo" onClick={() => navigate("dashboard")}>
            Interview<span>AI</span>
          </button>

          {/* Navigation */}
          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.page}
                className={`nav-pill ${activePage === item.page ? "active" : ""}`}
                onClick={() => navigate(item.page)}
              >
                <span className="nav-pill-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* AI Tip widget */}
          <div className="sidebar-tip">
            <div className="sidebar-tip-header">
              <span className="sidebar-tip-label">AI Coach</span>
            </div>
            <div className="sidebar-tip-title">{AI_TIP.title}</div>
            <div className="sidebar-tip-body">{AI_TIP.body}</div>
            <button className="sidebar-tip-btn" onClick={() => navigate("interviews")}>
              Start session →
            </button>
          </div>

          {/* User identity */}
          <div className="sidebar-user">
            <div className="sidebar-avatar">{userAvatar}</div>
            <div>
              <div className="sidebar-user-name">{userName}</div>
              <div className="sidebar-user-role">{userRole}</div>
            </div>
          </div>
        </aside>

        {/* ════ MAIN ════ */}
        <main className="dash-main">
          {activePage === "dashboard"  && <OverviewPage   userName={userName} streak={streak} onNavigate={(p) => navigate(p as Page)} />}
          {activePage === "interviews" && <InterviewsPage />}
          {activePage === "progress"   && <ProgressPage />}
          {activePage === "skills"     && <SkillsPage />}
          {activePage === "resume"     && <ResumePage />}
          {activePage === "history"    && <HistoryPage />}
        </main>

      </div>
    </>
  );
}
