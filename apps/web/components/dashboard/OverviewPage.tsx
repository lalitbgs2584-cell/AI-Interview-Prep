"use client";
import { authClient } from "@repo/auth/client";
import { redirect } from "next/navigation";
import React, { useEffect, useState } from "react";
import CustomSessionModal from "./dashboard-components/pages/CustomSessionModal";

// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
// Types
// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

interface DashboardStats {
  totalSessions: number;
  averageScore: number;
  skillsCovered: number;
  currentStreak: number;
  weeklySessionDelta: number;
  scoreImprovement: number;
  skillsRemaining: number;
}

interface SessionData {
  id: string;
  title: string;
  type: "TECHNICAL" | "HR" | "SYSTEM_DESIGN" | "BEHAVIORAL";
  score: number;
  date: Date;
  duration: number; // in minutes
  status: "high" | "medium" | "low";
}

interface SkillData {
  skill: string;
  score: number;
  category?: string;
}

interface QuickStartItem {
  id: string;
  icon: string;
  label: string;
  desc: string;
  tag: string;
  tagClass: string;
  type: "TECHNICAL" | "HR" | "SYSTEM_DESIGN" | "BEHAVIORAL";
}

// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
// Utility Functions
// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

function scoreClass(status: string) {
  return status === "high" ? "score-high" : status === "medium" ? "score-medium" : "score-low";
}

function barClass(status: string) {
  return `bar-fill ${scoreClass(status)}`;
}

function getStatusFromScore(score: number): "high" | "medium" | "low" {
  return score >= 75 ? "high" : score >= 60 ? "medium" : "low";
}

function formatDuration(minutes: number): string {
  return `${minutes} min`;
}

function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getTypeColor(type: string): string {
  switch (type) {
    case "SYSTEM_DESIGN":
      return "tag-accent";
    case "BEHAVIORAL":
      return "tag-violet";
    case "TECHNICAL":
      return "tag-sky";
    case "HR":
      return "tag-gold";
    default:
      return "tag-sky";
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "SYSTEM_DESIGN":
      return "System Design";
    case "BEHAVIORAL":
      return "Behavioral";
    case "TECHNICAL":
      return "Coding";
    case "HR":
      return "HR";
    default:
      return type;
  }
}

// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
// Components
// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

export function SessionRow({ s }: { s: SessionData }) {
  return (
    <div className="session-row">
      <div className="session-row-left">
        <div className={`session-score-badge ${scoreClass(s.status)}`}>{s.score}</div>
        <div>
          <div className="session-title">{s.title}</div>
          <div className="session-meta">
            <span className={`tag ${getTypeColor(s.type)}`}>
              {getTypeLabel(s.type)}
            </span>
            <span className="session-date">{formatDate(s.date)}</span>
            <span className="session-duration">- {formatDuration(s.duration)}</span>
          </div>
        </div>
      </div>
      <button className="session-replay-btn">Review '</button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="loading-container">
      <div className="skeleton-stat"></div>
      <div className="skeleton-stat"></div>
      <div className="skeleton-stat"></div>
      <div className="skeleton-stat"></div>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="error-message">
      <span>  {message}</span>
    </div>
  );
}

// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
// Main Component
// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

export default function OverviewPage({
  userName,
  streak,
  onNavigate,
}: {
  userName: string;
  streak: number;
  onNavigate: (page: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "sessions" | "skills">("overview");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // " State for dynamic data
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionData[]>([]);
  const [skillData, setSkillData] = useState<SkillData[]>([]);
  const [quickStart, setQuickStart] = useState<QuickStartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const DASH_CACHE_KEY = "dashboard_overview_cache_v1";
  const DASH_CACHE_TTL_MS = 5 * 60 * 1000;

  // """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  // Fetch Dashboard Data
  // """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

  useEffect(() => {
    const quickStartItems: QuickStartItem[] = [
      {
        id: "sd",
        icon: "",
        label: "System Design",
        desc: "Architecture & scalability",
        tag: "Popular",
        tagClass: "tag-accent",
        type: "SYSTEM_DESIGN",
      },
      {
        id: "dsa",
        icon: "-",
        label: "Technical",
        desc: "Algorithms & data structures",
        tag: "Daily",
        tagClass: "tag-gold",
        type: "TECHNICAL",
      },
      {
        id: "beh",
        icon: "-",
        label: "Behavioral",
        desc: "STAR method coaching",
        tag: "Suggested",
        tagClass: "tag-violet",
        type: "BEHAVIORAL",
      },
      {
        id: "hr",
        icon: "-",
        label: "HR Round",
        desc: "Communication & culture fit",
        tag: "Essential",
        tagClass: "tag-rose",
        type: "HR",
      },
    ];

    const readCache = () => {
      if (typeof window === "undefined") return null;
      try {
        const raw = sessionStorage.getItem(DASH_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as {
          ts: number;
          stats: DashboardStats | null;
          recentSessions: SessionData[];
          skillData: SkillData[];
        };
        if (!parsed?.ts) return null;
        if (Date.now() - parsed.ts > DASH_CACHE_TTL_MS) return null;
        return parsed;
      } catch {
        return null;
      }
    };

    const writeCache = (payload: {
      stats: DashboardStats | null;
      recentSessions: SessionData[];
      skillData: SkillData[];
    }) => {
      if (typeof window === "undefined") return;
      try {
        sessionStorage.setItem(
          DASH_CACHE_KEY,
          JSON.stringify({ ts: Date.now(), ...payload })
        );
      } catch {
        // ignore storage errors
      }
    };

    const cached = readCache();
    if (cached) {
      setStats(cached.stats);
      setRecentSessions(cached.recentSessions || []);
      setSkillData(cached.skillData || []);
      setQuickStart(quickStartItems);
      setIsLoading(false);
      return;
    }

    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch all dashboard data in parallel
        const [statsRes, sessionsRes, skillsRes] = await Promise.all([
          fetch("/api/dashboard/stats"),
          fetch("/api/dashboard/sessions"),
          fetch("/api/dashboard/skills"),
        ]);

        if (!statsRes.ok || !sessionsRes.ok || !skillsRes.ok) {
          throw new Error("Failed to fetch dashboard data");
        }

        const statsData = await statsRes.json();
        const sessionsData = await sessionsRes.json();
        const skillsData = await skillsRes.json();

        setStats(statsData);
        setRecentSessions(sessionsData.interviews || []);
        setSkillData(skillsData.skills || []);
        setQuickStart(quickStartItems);

        writeCache({
          stats: statsData,
          recentSessions: sessionsData.interviews || [],
          skillData: skillsData.skills || [],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        console.error("Dashboard fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  // Handle Logout
  // """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await authClient.signOut();
    redirect("/login");
  };

  // """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  // Render
  // """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const displayStats = stats ? [
    {
      label: "Sessions Done",
      value: stats.totalSessions.toString(),
      unit: "total",
      dot: "dot-accent",
      delta: `+${stats.weeklySessionDelta} this week`,
    },
    {
      label: "Avg. Score",
      value: stats.averageScore.toString(),
      unit: "/ 100",
      dot: "dot-gold",
      delta: `+${stats.scoreImprovement} vs last week`,
    },
    {
      label: "Skills Covered",
      value: stats.skillsCovered.toString(),
      unit: "topics",
      dot: "dot-violet",
      delta: `${stats.skillsRemaining} remaining`,
    },
    {
      label: "Current Streak",
      value: streak.toString(),
      unit: "days",
      dot: "dot-accent",
      delta: "Keep it up!",
    },
  ] : [];

  return (
    <>
      {/* "" Top bar "" */}
      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">
            Good {now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening"},{" "}
            <em>{userName}</em>
          </div>
          <div className="dash-date">
            {dateStr} - {streak}-day streak "
          </div>
        </div>
        <div className="topbar-actions">
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="btn-new-session bg-red-600! hover:bg-red-700!"
          >
            {isLoggingOut ? "Logging out" : "Logout"}
          </button>
        </div>
      </div>

      {/* "" Error State "" */}
      {error && <ErrorMessage message={error} />}

      {/* "" Stat cards "" */}
      <div className="stats-grid">
        {displayStats.map((s, i) => (
          <div key={s.label} className={`dash-stat-card anim-${i}`}>
            <div className="dash-stat-top">
              <span className={`stat-card-dot ${s.dot}`} />
              <span className="dash-stat-label">{s.label}</span>
            </div>
            <div className="dash-stat-value">
              {s.value}
              <span className="dash-stat-unit">{s.unit}</span>
            </div>
            <div className="dash-stat-delta">{s.delta}</div>
          </div>
        ))}
      </div>

      {/* "" Tabs "" */}
      <div className="dash-tabs">
        {(["overview", "sessions", "skills"] as const).map((t) => (
          <button
            key={t}
            className={`dash-tab ${activeTab === t ? "active" : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* "" Overview "" */}
      {activeTab === "overview" && (
        <div className="tab-content">
          <div className="overview-grid">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Start a Session</div>
                  <div className="panel-sub">Pick a category to begin</div>
                </div>
              </div>
              <div className="quick-grid">
                {quickStart.map((q) => (
                  <button
                    key={q.id}
                    className="quick-card"
                    onClick={() => {
                      // TODO: Route to interview creation with type
                      onNavigate(`interview?type=${q.type}`);
                    }}
                  >
                    <div className="quick-card-top">
                      <span className="quick-icon">{q.icon}</span>
                      <span className={`tag ${q.tagClass}`}>{q.tag}</span>
                    </div>
                    <div className="quick-label">{q.label}</div>
                    <div className="quick-desc">{q.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Skill Snapshot</div>
                  <div className="panel-sub">Based on last 10 sessions</div>
                </div>
              </div>
              <div className="skill-list">
                {skillData.length > 0 ? (
                  skillData.slice(0, 6).map((s, i) => {
                    const st = getStatusFromScore(s.score);
                    return (
                      <div key={s.skill} className="skill-row" style={{ animationDelay: `${i * 0.06}s` }}>
                        <div className="skill-row-top">
                          <span className="skill-name">{s.skill}</span>
                          <span className={`skill-score ${scoreClass(st)}`}>{s.score}</span>
                        </div>
                        <div className="bar-track">
                          <div className={barClass(st)} style={{ width: `${s.score}%` }} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-gray-400">No skill data available yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* "" Sessions "" */}
      {activeTab === "sessions" && (
        <div className="tab-content">
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">All Sessions</div>
                <div className="panel-sub">{recentSessions.length} total</div>
              </div>
            </div>
            <div className="session-list">
              {recentSessions.length > 0 ? (
                recentSessions.map((s) => <SessionRow key={s.id} s={s} />)
              ) : (
                <p className="text-gray-400">No sessions yet. Start your first interview!</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* "" Skills "" */}
      {activeTab === "skills" && (
        <div className="tab-content">
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Skill Breakdown</div>
                <div className="panel-sub">Detailed scores across all topics</div>
              </div>
            </div>
            <div className="skill-list skill-list-lg">
              {skillData.length > 0 ? (
                skillData.map((s, i) => {
                  const st = getStatusFromScore(s.score);
                  const statusLabel = st === "high" ? "Strong" : st === "medium" ? "Good" : "Needs work";
                  const statusTag = st === "high" ? "tag-gold" : st === "medium" ? "tag-amber" : "tag-rose";
                  const hint =
                    st === "low"
                      ? "Recommended: 2 sessions this week"
                      : st === "medium"
                        ? "Keep practicing to reach Strong"
                        : "Great performance - maintain with 1 session/week";

                  return (
                    <div key={s.skill} className="skill-row" style={{ animationDelay: `${i * 0.07}s` }}>
                      <div className="skill-row-top">
                        <span className="skill-name">{s.skill}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                          <span className={`tag ${statusTag}`}>{statusLabel}</span>
                          <span className={`skill-score ${scoreClass(st)}`}>{s.score}/100</span>
                        </div>
                      </div>
                      <div className="bar-track bar-track-lg">
                        <div className={barClass(st)} style={{ width: `${s.score}%` }} />
                      </div>
                      <div className="skill-hint">{hint}</div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-400">No skill data available yet. Complete interviews to see your skill breakdown!</p>
              )}
            </div>
          </div>
        </div>
      )}

      <CustomSessionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
