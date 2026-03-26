"use client"
import { useState } from "react";
import OverviewPage from "../../OverviewPage";
import ResumePage from "./ResumePage";
import SkillsPage from "./SkillsPage";
import ProgressPage from "./ProgressPage";
import HistoryPage from "./HistoryPage";
import ProfilePage from "./ProfilePage";
import InterviewsPage from "./InterviewsPage";

// Import the exact types ProfilePage expects
import type { ProfilePageProps } from "./ProfilePage";

type Page = "dashboard" | "interviews" | "progress" | "skills" | "resume" | "history" | "profile";

// DashboardApp receives the full user object that ProfilePage needs
interface DashboardAppProps {
  user: ProfilePageProps["user"];
}

const NAV_ITEMS: { icon: string; label: string; page: Page }[] = [
  { icon: "⊞", label: "Dashboard", page: "dashboard" },
  { icon: "◈", label: "Interviews", page: "interviews" },
  { icon: "◎", label: "Progress", page: "progress" },
  { icon: "⬡", label: "Skills", page: "skills" },
  { icon: "⊡", label: "Resume", page: "resume" },
  { icon: "⊟", label: "History", page: "history" },
];

const AI_TIP = {
  title: "Focus area this week",
  body: "Your SQL scores dropped 12 points. I've queued 3 targeted sessions on indexing strategies and query optimization.",
};

export default function DashboardApp({ user }: DashboardAppProps) {
  const [activePage, setActivePage] = useState<Page>("profile");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Derive display values from the nested user object
  const userName = user?.name ?? "Guest";
  const userRole = user?.role ?? "USER";
  const userAvatar = user?.avatar ?? null;
  const streak = user?.streak ?? 0;
  const initials = (userName).slice(0, 2).toUpperCase();

  // Derived stats for sidebar / overview
  const completedCount = user?.interviews?.filter((i) => i.status === "COMPLETED").length ?? 0;

  const navigate = (page: Page) => {
    setActivePage(page);
    setSidebarOpen(false);
  };

  return (
    <>
      <div className="noise" />
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">☰</button>
      <div className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      <div className="dash-root">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">✕</button>
          <button className="sidebar-logo" onClick={() => navigate("dashboard")}>Interview<span>AI</span></button>

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

          <div className="sidebar-tip">
            <div className="sidebar-tip-header"><span className="sidebar-tip-label">AI Coach</span></div>
            <div className="sidebar-tip-title">{AI_TIP.title}</div>
            <div className="sidebar-tip-body">{AI_TIP.body}</div>
            <button className="sidebar-tip-btn" onClick={() => navigate("interviews")}>Start session →</button>
          </div>

          <button
            className={`sidebar-user ${activePage === "profile" ? "active" : ""}`}
            onClick={() => navigate("profile")}
          >
            <div className="sidebar-avatar">
              {userAvatar
                ? <img src={userAvatar} alt={userName} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                : initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sidebar-user-name">{userName}</div>
              <div className="sidebar-user-role">
                {userRole === "ADMIN" ? "Admin" : "Software Engineer"}
              </div>
              {streak > 0 && <span className="sidebar-user-hint">🔥 {streak}-day streak</span>}
            </div>
            <span style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.7rem", flexShrink: 0 }}>›</span>
          </button>
        </aside>

        <main className="dash-main">
          {activePage === "dashboard" && (
            <OverviewPage
              userName={userName}
              streak={streak}
              onNavigate={(p) => navigate(p as Page)}
            />
          )}
          {activePage === "interviews" && <InterviewsPage />}
          {activePage === "progress" && <ProgressPage />}
          {activePage === "skills" && <SkillsPage />}
          {activePage === "resume" && <ResumePage />}
          {activePage === "history" && <HistoryPage />}

          {/* ProfilePage receives the full user object — no prop spreading needed */}
          {activePage === "profile" && <ProfilePage user={user} />}
        </main>
      </div>
    </>
  );
}

