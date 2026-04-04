"use client";

import { useMemo, useState, useEffect } from "react";

// """""""""""""""""""""""""""""""""""""""""""""
// Types derived directly from Prisma schema
// """""""""""""""""""""""""""""""""""""""""""""
type InterviewType = "TECHNICAL" | "HR" | "SYSTEM_DESIGN" | "BEHAVIORAL";
type InterviewStatus = "CREATED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type Difficulty = "EASY" | "MEDIUM" | "HARD";
type UserRole = "USER" | "ADMIN";

interface Evaluation {
    overallScore?: number | null;
    overallScore100?: number | null;  //  0-100 scale (PRIMARY)
    clarity?: number | null;
    technical?: number | null;
    confidence?: number | null;
    confidenceScore?: number | null;
    feedback?: string | null;
    strengths?: string | string[] | null;
    improvements?: string | string[] | null;
    verdict?: string | null;
}

interface InterviewQuestion {
    score?: number | null;
    order?: number | null;
    question: { difficulty?: Difficulty | null; type?: InterviewType | null };
    response?: { evaluation?: Evaluation | null } | null;
}

interface Interview {
    id: string;
    title: string;
    type: InterviewType;
    status: InterviewStatus;
    createdAt: Date | string;
    completedAt?: Date | string | null;
    questions: InterviewQuestion[];
}

interface Skill {
    skill: { name: string; category?: string | null };
}

interface Insights {
    experienceLevel: number;
    keySkills: string[];
    ATSSCORE: number;
    strongDomains: string[];
    weakAreas: string[];
}

interface Resume {
    insights?: Insights | null;
    workExperience: { company?: string | null; role?: string | null; duration?: string | null }[];
    education: { institution: string; degree: string; grade?: string | null }[];
    projects: { title: string; techStack: string[] }[];
}

export interface ProfilePageProps {
    user: {
        name?: string | null;
        avatar?: string | null;
        email?: string | null;
        role?: UserRole | null;
        createdAt?: Date | string | null;

        streak?: number;
        bestStreak?: number;
        lastLoginAt?: Date | string | null;
        activityMap?: Record<string, number>;
        skills?: Skill[];
        interviews?: Interview[];
        resumes?: Resume[];
    };
}

// """""""""""""""""""""""""""""""""""""""""""""
// Pure helpers
// """""""""""""""""""""""""""""""""""""""""""""
function formatDate(date?: Date | string | null, opts?: Intl.DateTimeFormatOptions): string {
    if (!date) return "";
    return new Date(date).toLocaleDateString("en-US", opts ?? { month: "long", year: "numeric" });
}

function timeAgo(date?: Date | string | null): string {
    if (!date) return "Never";
    const diff = Date.now() - new Date(date).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return formatDate(date, { month: "short", year: "numeric" });
}

function avg(nums: (number | null | undefined)[]): number {
    const valid = nums.filter((n): n is number => typeof n === "number");
    return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
}

function scoreClass(n: number) {
    if (n >= 75) return "score-high";
    if (n >= 50) return "score-medium";
    return "score-low";
}

function scoreColor(n: number) {
    if (n >= 75) return "var(--positive)";
    if (n >= 50) return "var(--amber)";
    return "var(--rose)";
}

// """""""""""""""""""""""""""""""""""""""""""""
// Normalize evaluation scores (0-100 scale)
// """""""""""""""""""""""""""""""""""""""""""""
function normalizeScore(ev: Evaluation | null | undefined): number {
    if (!ev) return 0;
    // Use overallScore100 (0-100) if available, otherwise convert overallScore (0-10)
    if (ev.overallScore100 !== null && ev.overallScore100 !== undefined) {
        return ev.overallScore100;
    }
    if (ev.overallScore !== null && ev.overallScore !== undefined) {
        return ev.overallScore * 10; // Convert 0-10 to 0-100
    }
    return 0;
}

const TYPE_META: Record<InterviewType, { icon: string; label: string }> = {
    TECHNICAL: { icon: "", label: "Technical" },
    HR: { icon: "", label: "HR" },
    SYSTEM_DESIGN: { icon: "-", label: "System Design" },
    BEHAVIORAL: { icon: " ", label: "Behavioral" },
};

const DIFF_META: Record<Difficulty, { label: string; color: string }> = {
    EASY: { label: "Easy", color: "var(--positive)" },
    MEDIUM: { label: "Medium", color: "var(--amber)" },
    HARD: { label: "Hard", color: "var(--rose)" },
};

// """""""""""""""""""""""""""""""""""""""""""""
// Level system
// """""""""""""""""""""""""""""""""""""""""""""
const LEVELS = [
    { name: "Beginner", icon: "BG", min: 0, max: 5 },
    { name: "Apprentice", icon: "AP", min: 5, max: 15 },
    { name: "Intermediate", icon: "IN", min: 15, max: 30 },
    { name: "Advanced", icon: "AD", min: 30, max: 60 },
    { name: "Expert", icon: "EX", min: 60, max: 100 },
    { name: "Legend", icon: "LG", min: 100, max: 100 },
];

function getLevel(n: number) {
    const lv = LEVELS.find((l) => n < l.max) ?? LEVELS[LEVELS.length - 1]!;
    const xp = n - lv.min;
    const range = lv.max - lv.min || 1;
    return { ...lv, xp, range, pct: Math.min((xp / range) * 100, 100) };
}

// """""""""""""""""""""""""""""""""""""""""""""
// Heatmap helpers
// """""""""""""""""""""""""""""""""""""""""""""
function buildHeatmap(activityMap: Record<string, number>) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(today.getDate() - 363);
    start.setDate(start.getDate() - start.getDay());

    const weeks: { date: Date; level: number; isToday: boolean }[][] = [];
    const cur = new Date(start);
    while (cur <= today) {
        if (!weeks.length || weeks[weeks.length - 1]!.length === 7) weeks.push([]);
        const iso = cur.toISOString().slice(0, 10);
        const isToday = cur.getTime() === today.getTime();
        const count = activityMap[iso] ?? 0;
        const level = cur > today ? -1 : count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4;
        weeks[weeks.length - 1]!.push({ date: new Date(cur), level, isToday });
        cur.setDate(cur.getDate() + 1);
    }
    return weeks;
}

function buildMonthLabels(weeks: { date: Date }[][]) {
    const labels: { label: string; i: number }[] = [];
    let last = -1;
    weeks.forEach((w, i) => {
        const m = w[0]!.date.getMonth();
        if (m !== last) { labels.push({ label: w[0]!.date.toLocaleDateString("en-US", { month: "short" }), i }); last = m; }
    });
    return labels;
}

function buildWeekDays(activityMap: Record<string, number>) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(today); start.setDate(today.getDate() - today.getDay());
    return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((label, i) => {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const iso = d.toISOString().slice(0, 10);
        const isFuture = d > today;
        const isToday = d.getTime() === today.getTime();
        const done = !isFuture && (activityMap[iso] ?? 0) > 0;
        return { label, done, isToday, isFuture };
    });
}

const MILESTONES = [
    { days: 3, icon: "3D", label: "3-day" },
    { days: 7, icon: "1W", label: "1-week" },
    { days: 14, icon: "2W", label: "2-week" },
    { days: 30, icon: "1M", label: "1-month" },
    { days: 60, icon: "2M", label: "2-month" },
    { days: 100, icon: "100", label: "100-day" },
];

// """""""""""""""""""""""""""""""""""""""""""""
// Sub-components
// """""""""""""""""""""""""""""""""""""""""""""

function StatPill({ value, label, color }: { value: string | number; label: string; color?: string }) {
    return (
        <div className="profile-hero-stat">
            <div className="profile-hero-stat-value" style={color ? { color } : undefined}>{value}</div>
            <div className="profile-hero-stat-label">{label}</div>
        </div>
    );
}

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="profile-card">
            <div className="profile-card-title">{title}</div>
            {children}
        </div>
    );
}

// Interview history row
function InterviewRow({ iv }: { iv: Interview }) {
    const scores = iv.questions.map((q) => normalizeScore(q.response?.evaluation));
    const sessionScore = avg(scores);
    const meta = TYPE_META[iv.type];
    const completed = iv.status === "COMPLETED";
    const date = completed ? iv.completedAt : iv.createdAt;

    return (
        <div className="session-row">
            <div className="session-row-left">
                <div className={`session-score-badge ${completed ? scoreClass(sessionScore) : "score-medium"}`}>
                    {completed ? sessionScore || "--" : <span style={{ fontSize: "1rem" }}>--</span>}
                </div>
                <div>
                    <div className="session-title">{iv.title}</div>
                    <div className="session-meta">
                        <span className="tag tag-accent">{meta.icon} {meta.label}</span>
                        <span className={`tag ${iv.status === "COMPLETED" ? "tag-gold" : iv.status === "IN_PROGRESS" ? "tag-amber" : "tag-rose"}`}>
                            {iv.status.replace("_", " ")}
                        </span>
                        <span className="session-date">{formatDate(date, { month: "short", day: "numeric", year: "numeric" })}</span>
                        <span className="session-duration">{iv.questions.length} questions</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Score breakdown bars for a single interview
function EvalBreakdown({ ev }: { ev: Evaluation }) {
    const overallScore = normalizeScore(ev);
    const bars = [
        { label: "Overall", val: overallScore },
        { label: "Clarity", val: ev.clarity ?? 0 },
        { label: "Technical", val: ev.technical ?? 0 },
        { label: "Confidence", val: Math.round((ev.confidence ?? 0) * 10) }, // Convert 0-1.0 to 0-100 if needed
    ];
    return (
        <div className="skill-list" style={{ gap: "0.65rem" }}>
            {bars.map((b) => (
                <div className="skill-row" key={b.label}>
                    <div className="skill-row-top">
                        <span className="skill-name">{b.label}</span>
                        <span className={`skill-score ${scoreClass(b.val)}`}>{Math.round(b.val)}/100</span>
                    </div>
                    <div className="bar-track">
                        <div className={`bar-fill ${scoreClass(b.val)}`} style={{ width: `${Math.round(b.val)}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

// """""""""""""""""""""""""""""""""""""""""""""
// Loading & Error states
// """""""""""""""""""""""""""""""""""""""""""""
function LoadingState() {
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            fontSize: "1rem",
            color: "var(--text-2)",
        }}>
             Loading profile...
        </div>
    );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            flexDirection: "column",
            gap: "1rem",
        }}>
            <div style={{ color: "var(--rose)", fontSize: "1rem" }}>
                  Error: {error}
            </div>
            <button
                onClick={onRetry}
                style={{
                    padding: "0.5rem 1rem",
                    background: "var(--accent)",
                    color: "white",
                    border: "none",
                    borderRadius: "var(--r-md)",
                    cursor: "pointer",
                }}
            >
                Retry
            </button>
        </div>
    );
}

// """""""""""""""""""""""""""""""""""""""""""""
// Main component
// """""""""""""""""""""""""""""""""""""""""""""
export default function ProfilePage() {
    //   ALL HOOKS MUST BE AT THE TOP - BEFORE ANY CONDITIONALS
    const [activeTab, setActiveTab] = useState<"overview" | "interviews" | "resume" | "skills">("overview");
    const [profileData, setProfileData] = useState<ProfilePageProps["user"] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewDate, setViewDate] = useState(() => {
        const d = new Date(); 
        return { y: d.getFullYear(), m: d.getMonth() };
    });

    // Fetch profile data on mount
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                setIsLoading(true);
                const response = await fetch("/api/user/profile");

                if (!response.ok) {
                    throw new Error(`Failed to load profile: ${response.statusText}`);
                }

                const data = await response.json();
                setProfileData(data.user);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load profile");
                console.error("Profile fetch error:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfile();
    }, []);

    // Retry function
    const handleRetry = () => {
        setIsLoading(true);
        setError(null);
        const fetchProfile = async () => {
            try {
                const response = await fetch("/api/user/profile");
                if (!response.ok) throw new Error("Failed to load profile");
                const data = await response.json();
                setProfileData(data.user);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load profile");
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfile();
    };

    //   MEMOS MUST BE HERE - UNCONDITIONALLY
    // Use empty defaults if profileData is null to avoid hook issues
    const user = profileData || {};
    const {
        name = null,
        avatar = null,
        email = null,
        role = null,
        createdAt = null,
        streak = 0,
        bestStreak = 0,
        lastLoginAt = null,
        activityMap = {},
        skills = [],
        interviews = [],
        resumes = [],
    } = user;

    // These memos will always execute, even if data is loading/error
    const heatmapWeeks = useMemo(() => buildHeatmap(activityMap), [activityMap]);
    const monthLabels = useMemo(() => buildMonthLabels(heatmapWeeks), [heatmapWeeks]);
    const weekDays = useMemo(() => buildWeekDays(activityMap), [activityMap]);

    const recentDays = useMemo(() => {
        const today = new Date(); 
        today.setHours(0, 0, 0, 0);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(today); 
            d.setDate(today.getDate() - i);
            const iso = d.toISOString().slice(0, 10);
            return { iso, count: activityMap[iso] ?? 0, isToday: i === 0 };
        }).filter((x) => x.count > 0);
    }, [activityMap]);

    const skillsByCategory = useMemo(() => {
        const map: Record<string, string[]> = {};
        skills.forEach(({ skill }) => {
            const cat = skill.category ?? "Other";
            if (!map[cat]) map[cat] = [];
            map[cat]!.push(skill.name);
        });
        return map;
    }, [skills]);

    // Now we can have early returns
    if (isLoading) return <LoadingState />;
    if (error) return <ErrorState error={error} onRetry={handleRetry} />;
    if (!profileData) return <ErrorState error="No profile data available" onRetry={handleRetry} />;

    const initials = (name ?? "G").slice(0, 2).toUpperCase();
    const resume = resumes[0];
    const insights = resume?.insights;

    // Derived stats
    const completedIVs = interviews.filter((i) => i.status === "COMPLETED");
    const totalInterviews = interviews.length;
    const completedCount = completedIVs.length;

    // Use normalized scores (0-100 scale)
    const allScores = completedIVs.flatMap((iv) =>
        iv.questions.map((q) => normalizeScore(q.response?.evaluation))
    );
    const avgScore = avg(allScores);

    const allEvals = completedIVs.flatMap((iv) =>
        iv.questions.flatMap((q) => q.response?.evaluation ? [q.response.evaluation] : [])
    );
    const avgClarity = avg(allEvals.map((e) => e.clarity));
    const avgTechnical = avg(allEvals.map((e) => e.technical));
    const avgConfidence = avg(allEvals.map((e) => (e.confidence ?? 0) * 10)); // Convert to 0-100 scale

    // Type distribution
    const byType = interviews.reduce((acc, iv) => {
        acc[iv.type] = (acc[iv.type] ?? 0) + 1;
        return acc;
    }, {} as Record<InterviewType, number>);

    // Difficulty distribution
    const byDiff = completedIVs.flatMap((iv) => iv.questions).reduce((acc, q) => {
        const d = q.question.difficulty;
        if (d) acc[d] = (acc[d] ?? 0) + 1;
        return acc;
    }, {} as Record<Difficulty, number>);

    const level = getLevel(completedCount);

    return (
        <div className="profile-full-page">
            {/* "" Hero "" */}
            <div className="profile-hero-card">
                <div className="profile-hero-bg" />
                <div className="profile-hero-inner">
                    {/* Avatar */}
                    <div className="profile-avatar-wrap">
                        <div className="profile-avatar">
                            {avatar ? <img src={avatar} alt={name ?? "User"} /> : initials}
                        </div>
                        <span className="profile-online-dot" title="Active" />
                    </div>

                    {/* Identity */}
                    <div className="profile-hero-identity">
                        <div className="profile-name">{name ?? "Guest"}</div>
                        <div className="profile-role">
                            {role === "ADMIN" ? "'' Admin" : "Software Engineer"} - {level.icon} {level.name}
                        </div>
                        {email && <div className="profile-email">{email}</div>}
                        <div className="profile-join-badge">
                            Joined {formatDate(createdAt)} - Last seen {timeAgo(lastLoginAt)}
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="profile-hero-stats">
                        <StatPill value={streak} label="Day Streak" color={streak >= 7 ? "var(--accent)" : undefined} />
                        <StatPill value={completedCount} label="Completed" />
                        <StatPill value={avgScore || "--"} label="Avg Score" color={avgScore ? scoreColor(avgScore) : undefined} />
                        <StatPill value={bestStreak} label="Best Streak" />
                        {insights && <StatPill value={insights.ATSSCORE} label="ATS Score" color={scoreColor(insights.ATSSCORE)} />}
                    </div>
                </div>
            </div>

            {/* ------------------ OVERVIEW TAB ------------------ */}
            {activeTab === "overview" && (
                <div className="profile-grid">
                    {/* LEFT COL */}
                    <div className="profile-col">
                        {/* Level progress */}
                        <CardSection title="Level Progress">
                            <div className="level-badge-row">
                                <div className="level-badge-icon">{level.icon}</div>
                                <div className="level-badge-info">
                                    <div className="level-badge-name">{level.name}</div>
                                    <div className="level-badge-sub">
                                        {level.name === "Legend"
                                            ? "Max level reached!"
                                            : `${level.xp} / ${level.range} sessions to next rank`}
                                    </div>
                                    <div className="level-xp-bar">
                                        <div className="level-xp-track">
                                            <div className="level-xp-fill" style={{ width: `${level.pct}%` }} />
                                        </div>
                                        <div className="level-xp-label">{Math.round(level.pct)}% complete</div>
                                    </div>
                                </div>
                            </div>
                        </CardSection>

                        {/* Streak */}
                        <CardSection title="Streak">
                            {/* Header row */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                    <span style={{ fontSize: "2rem", lineHeight: 1 }}>"</span>
                                    <div>
                                        <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{streak}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "2px" }}>day streak</div>
                                    </div>
                                </div>
                                <div style={{
                                    fontSize: "0.72rem", color: "var(--muted)",
                                    background: "var(--card-2)", borderRadius: "999px",
                                    padding: "3px 10px", border: "1px solid var(--border)"
                                }}>
                                    Best: {bestStreak} days
                                </div>
                            </div>

                            {/* Status banner " driven by whether session was done today */}
                            {(() => {
                                const todayIso = new Date().toISOString().slice(0, 10);
                                const doneToday = (activityMap[todayIso] ?? 0) > 0;
                                const lost = streak === 0;

                                const bannerStyle = (bg: string, border: string, color: string) => ({
                                    display: "flex", alignItems: "center", gap: "8px",
                                    padding: "9px 13px", borderRadius: "var(--r-md)",
                                    background: bg, border: `1px solid ${border}`,
                                    fontSize: "0.8rem", fontWeight: 500, color,
                                    marginBottom: "1.1rem",
                                });

                                if (lost) return (
                                    <div style={bannerStyle("rgba(255,77,109,0.08)", "rgba(255,77,109,0.3)", "var(--rose)")}>
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--rose)", flexShrink: 0, display: "inline-block" }} />
                                        Streak lost " start a new one today!
                                    </div>
                                );
                                if (doneToday) return (
                                    <div style={bannerStyle("rgba(72,199,142,0.08)", "rgba(72,199,142,0.3)", "var(--positive)")}>
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--positive)", flexShrink: 0, display: "inline-block" }} />
                                        Completed today " streak safe!
                                    </div>
                                );
                                return (
                                    <div style={bannerStyle("rgba(226,168,75,0.08)", "rgba(226,168,75,0.3)", "var(--amber)")}>
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--amber)", flexShrink: 0, display: "inline-block" }} />
                                        Do a session today before midnight to keep it going!
                                    </div>
                                );
                            })()}

                            {/* Week day dots */}
                            <div style={{ fontSize: "0.65rem", color: "var(--muted)", letterSpacing: "0.05em", marginBottom: "6px" }}>THIS WEEK</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px", marginBottom: "1.1rem" }}>
                                {weekDays.map((d) => {
                                    const dot: React.CSSProperties = {
                                        width: 32, height: 32, borderRadius: "50%",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: "0.8rem", border: "1px solid var(--border)",
                                        background: "var(--card-2)", position: "relative",
                                        ...(d.done ? { background: "rgba(72,199,142,0.12)", borderColor: "rgba(72,199,142,0.5)" } : {}),
                                        ...(d.isToday && !d.done ? { borderColor: "var(--accent-2)", background: "rgba(var(--accent-2-rgb),0.07)" } : {}),
                                        ...(!d.done && !d.isToday && !d.isFuture ? { background: "rgba(255,77,109,0.07)", borderColor: "rgba(255,77,109,0.25)" } : {}),
                                        ...(d.isFuture ? { opacity: 0.35 } : {}),
                                    };
                                    return (
                                        <div key={d.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                                            <span style={{ fontSize: "0.6rem", color: "var(--muted)", letterSpacing: "0.03em" }}>{d.label}</span>
                                            <div style={dot}>
                                                {d.done && <span style={{ color: "var(--positive)", fontSize: "0.85rem" }}>"</span>}
                                                {!d.done && !d.isFuture && !d.isToday && <span style={{ color: "var(--rose)", fontSize: "0.75rem" }}>-</span>}
                                                {d.isToday && !d.done && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-2)", display: "inline-block" }} />}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div style={{ height: "0.5px", background: "var(--border)", margin: "0.85rem 0" }} />

                            {/* Milestones */}
                            <div style={{ fontSize: "0.65rem", color: "var(--muted)", letterSpacing: "0.05em", marginBottom: "8px" }}>MILESTONES</div>
                            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                                {MILESTONES.map((m) => {
                                    const earned = streak >= m.days;
                                    return (
                                        <div key={m.days} style={{
                                            display: "flex", alignItems: "center", gap: "5px",
                                            fontSize: "0.75rem", padding: "4px 10px", borderRadius: "999px",
                                            border: `1px solid ${earned ? "rgba(72,199,142,0.4)" : "var(--border)"}`,
                                            background: earned ? "rgba(72,199,142,0.1)" : "var(--card-2)",
                                            color: earned ? "var(--positive)" : "var(--muted)",
                                            fontWeight: earned ? 600 : 400,
                                        }}>
                                            <span style={{ fontSize: "0.85rem", opacity: earned ? 1 : 0.4 }}>{m.icon}</span>
                                            {m.label}
                                        </div>
                                    );
                                })}
                            </div>
                        </CardSection>

                        {/* Score breakdown */}
                        {completedCount > 0 && (
                            <CardSection title="Avg Score Breakdown">
                                <div className="skill-list" style={{ gap: "0.65rem" }}>
                                    {[
                                        { label: "Overall", val: avgScore },
                                        { label: "Clarity", val: avgClarity },
                                        { label: "Technical", val: avgTechnical },
                                        { label: "Confidence", val: avgConfidence },
                                    ].map((b) => (
                                        <div className="skill-row" key={b.label}>
                                            <div className="skill-row-top">
                                                <span className="skill-name">{b.label}</span>
                                                <span className={`skill-score ${scoreClass(b.val)}`}>{Math.round(b.val)}/100</span>
                                            </div>
                                            <div className="bar-track">
                                                <div className={`bar-fill ${scoreClass(b.val)}`} style={{ width: `${Math.round(b.val)}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardSection>
                        )}
                    </div>

                    {/* RIGHT COL */}
                    <div className="profile-col">
                        {/* Activity heatmap */}
                        <CardSection title="Activity">
                            {(() => {
                                const today = new Date(); today.setHours(0, 0, 0, 0);
                                const todayIso = today.toISOString().slice(0, 10);
                                const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

                                const { y, m } = viewDate;
                                const daysInMonth = new Date(y, m + 1, 0).getDate();
                                const firstDay = new Date(y, m, 1).getDay();
                                const prevMonthDays = new Date(y, m, 0).getDate();
                                const isCurrentMonth = y === today.getFullYear() && m === today.getMonth();

                                const canGoNext = !(y === today.getFullYear() && m >= today.getMonth());
                                const canGoPrev = !(y < today.getFullYear() - 1 || (y === today.getFullYear() - 1 && m <= today.getMonth()));

                                const changeMonth = (dir: number) => {
                                    setViewDate(prev => {
                                        let nm = prev.m + dir, ny = prev.y;
                                        if (nm > 11) { nm = 0; ny++; }
                                        if (nm < 0) { nm = 11; ny--; }
                                        return { y: ny, m: nm };
                                    });
                                };

                                // Month stats
                                let totalSessions = 0, activeDays = 0, bestStreak = 0, curStreak = 0;
                                for (let d = 1; d <= daysInMonth; d++) {
                                    const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                                    const count = activityMap[iso] ?? 0;
                                    if (count > 0) { totalSessions += count; activeDays++; curStreak++; bestStreak = Math.max(bestStreak, curStreak); }
                                    else { curStreak = 0; }
                                }

                                // Build grid cells
                                const cells: { day: number; iso: string; count: number; isToday: boolean; isFuture: boolean; isCurrentMonth: boolean }[] = [];
                                // prev month fill
                                for (let i = 0; i < firstDay; i++) {
                                    const day = prevMonthDays - firstDay + 1 + i;
                                    cells.push({ day, iso: "", count: 0, isToday: false, isFuture: false, isCurrentMonth: false });
                                }
                                // current month
                                for (let d = 1; d <= daysInMonth; d++) {
                                    const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                                    const date = new Date(y, m, d);
                                    cells.push({ day: d, iso, count: activityMap[iso] ?? 0, isToday: iso === todayIso, isFuture: date > today, isCurrentMonth: true });
                                }
                                // next month fill
                                const remaining = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7);
                                for (let i = 1; i <= remaining; i++) {
                                    cells.push({ day: i, iso: "", count: 0, isToday: false, isFuture: false, isCurrentMonth: false });
                                }

                                const cellBase: React.CSSProperties = {
                                    aspectRatio: "1", borderRadius: "var(--r-md)", display: "flex",
                                    flexDirection: "column", alignItems: "center", justifyContent: "center",
                                    fontSize: "0.7rem", border: "1px solid transparent",
                                    position: "relative", transition: "background 0.1s",
                                };

                                return (
                                    <div>
                                        {/* Nav */}
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                                            <button onClick={() => canGoPrev && changeMonth(-1)}
                                                disabled={!canGoPrev}
                                                style={{ background: "none", border: "1px solid var(--border)", borderRadius: "var(--r-md)", width: 28, height: 28, cursor: canGoPrev ? "pointer" : "default", opacity: canGoPrev ? 1 : 0.3, color: "var(--text-2)", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                
                                            </button>
                                            <div style={{ textAlign: "center" }}>
                                                <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text)" }}>{MONTHS[m]} {y}</div>
                                                {isCurrentMonth && <div style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: 1 }}>Current month</div>}
                                            </div>
                                            <button onClick={() => canGoNext && changeMonth(1)}
                                                disabled={!canGoNext}
                                                style={{ background: "none", border: "1px solid var(--border)", borderRadius: "var(--r-md)", width: 28, height: 28, cursor: canGoNext ? "pointer" : "default", opacity: canGoNext ? 1 : 0.3, color: "var(--text-2)", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                
                                            </button>
                                        </div>

                                        {/* Weekday headers */}
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
                                            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(d => (
                                                <div key={d} style={{ textAlign: "center", fontSize: "0.6rem", color: "var(--muted)", letterSpacing: "0.04em" }}>{d}</div>
                                            ))}
                                        </div>

                                        {/* Day grid */}
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
                                            {cells.map((c, i) => {
                                                const hasActivity = c.isCurrentMonth && c.count > 0 && !c.isFuture;
                                                return (
                                                    <div key={i} style={{
                                                        ...cellBase,
                                                        opacity: (!c.isCurrentMonth || c.isFuture) ? 0.3 : 1,
                                                        color: c.isToday ? "var(--accent-2)" : "var(--text-2)",
                                                        fontWeight: c.isToday ? 600 : 400,
                                                        border: c.isToday ? "1px solid var(--accent-2)" : hasActivity ? "1px solid rgba(239,159,39,0.5)" : "1px solid transparent",
                                                        background: hasActivity ? "rgba(250,238,218,0.5)" : "transparent",
                                                        cursor: hasActivity ? "default" : "default",
                                                    }}>
                                                        <span style={{ fontSize: "0.68rem", lineHeight: 1 }}>{c.day}</span>
                                                        {hasActivity && (
                                                            <span style={{ fontSize: "0.65rem", color: "#BA7517", lineHeight: 1, marginTop: 1 }}>"</span>
                                                        )}
                                                        {hasActivity && c.count > 1 && (
                                                            <span style={{
                                                                position: "absolute", top: 1, right: 2,
                                                                fontSize: "0.5rem", fontWeight: 600,
                                                                background: "#EF9F27", color: "#412402",
                                                                borderRadius: "999px", width: 13, height: 13,
                                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                            }}>{c.count}</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Month stats */}
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: "1rem" }}>
                                            {[
                                                { val: totalSessions, label: "sessions" },
                                                { val: activeDays, label: "active days" },
                                                { val: `${bestStreak}d`, label: "best streak" },
                                            ].map(s => (
                                                <div key={s.label} style={{ background: "var(--card-2)", borderRadius: "var(--r-md)", padding: "0.6rem 0.75rem", textAlign: "center", border: "1px solid var(--border)" }}>
                                                    <div style={{ fontSize: "1.2rem", fontWeight: 700, color: s.label === "best streak" ? "var(--text)" : "var(--amber)" }}>{s.val}</div>
                                                    <div style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: 2 }}>{s.label}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Legend */}
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: "0.75rem", fontSize: "0.65rem", color: "var(--muted)" }}>
                                            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                                <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--card-2)", border: "1px solid var(--border)", display: "inline-block" }} />
                                                no activity
                                            </span>
                                            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                                <span style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(250,238,218,0.8)", border: "1px solid rgba(239,159,39,0.5)", display: "inline-block" }} />
                                                interview done
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </CardSection>

                        {/* Interview type distribution */}
                        {Object.keys(byType).length > 0 && (
                            <CardSection title="Interview Types">
                                <div className="skill-list" style={{ gap: "0.6rem" }}>
                                    {(Object.entries(byType) as [InterviewType, number][]).map(([type, count]) => {
                                        const pct = Math.round((count / totalInterviews) * 100);
                                        const meta = TYPE_META[type];
                                        return (
                                            <div className="skill-row" key={type}>
                                                <div className="skill-row-top">
                                                    <span className="skill-name">{meta.icon} {meta.label}</span>
                                                    <span className="skill-score score-high">{count} ({pct}%)</span>
                                                </div>
                                                <div className="bar-track">
                                                    <div className="bar-fill score-high" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardSection>
                        )}

                        {/* Difficulty distribution */}
                        {Object.keys(byDiff).length > 0 && (
                            <CardSection title="Difficulty Breakdown">
                                <div style={{ display: "flex", gap: "0.6rem" }}>
                                    {(Object.entries(byDiff) as [Difficulty, number][]).map(([diff, count]) => {
                                        const meta = DIFF_META[diff];
                                        return (
                                            <div key={diff} style={{
                                                flex: 1, padding: "0.75rem", borderRadius: "var(--r-md)",
                                                border: "1px solid var(--border)", background: "var(--card-2)",
                                                textAlign: "center",
                                            }}>
                                                <div style={{ fontFamily: "var(--ff-display)", fontSize: "1.4rem", fontWeight: 800, color: meta.color }}>{count}</div>
                                                <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.65rem", color: "var(--muted)", marginTop: "0.25rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>{meta.label}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardSection>
                        )}

                        {/* Recent activity */}
                        {recentDays.length > 0 && (
                            <CardSection title="Recent Activity">
                                <div className="activity-list">
                                    {recentDays.map((a) => (
                                        <div className="activity-item" key={a.iso}>
                                            <div className="activity-dot completed" />
                                            <div className="activity-content">
                                                <div className="activity-title">Completed {a.count} session{a.count > 1 ? "s" : ""}</div>
                                                <div className="activity-meta">{a.isToday ? "Today" : new Date(a.iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {streak > 0 && (
                                        <div className="activity-item">
                                            <div className="activity-dot streak" />
                                            <div className="activity-content">
                                                <div className="activity-title">" {streak}-day streak active</div>
                                                <div className="activity-meta">Keep it going!</div>
                                            </div>
                                        </div>
                                    )}
                                    {createdAt && (
                                        <div className="activity-item">
                                            <div className="activity-dot joined" />
                                            <div className="activity-content">
                                                <div className="activity-title">Joined InterviewAI</div>
                                                <div className="activity-meta">{formatDate(createdAt)}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardSection>
                        )}
                    </div>
                </div>
            )}

            {/* ------------------ INTERVIEWS TAB ------------------ */}
            {activeTab === "interviews" && (
                <div className="profile-grid">
                    <div className="profile-col">
                        {/* Quick stat row */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
                            {[
                                { label: "Total", value: totalInterviews, icon: "" },
                                { label: "Completed", value: completedCount, icon: "..." },
                                { label: "In Progress", value: interviews.filter((i) => i.status === "IN_PROGRESS").length, icon: "" },
                            ].map((s) => (
                                <div key={s.label} className="dash-stat-card">
                                    <div className="dash-stat-top">
                                        <span style={{ fontSize: "1rem" }}>{s.icon}</span>
                                        <span className="dash-stat-label">{s.label}</span>
                                    </div>
                                    <div className="dash-stat-value">{s.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Interview list */}
                        <CardSection title="All Sessions">
                            {interviews.length === 0 ? (
                                <div style={{ color: "var(--muted)", fontSize: "0.85rem", textAlign: "center", padding: "2rem 0" }}>
                                    No interviews yet. Start your first session!
                                </div>
                            ) : (
                                <div className="session-list">
                                    {[...interviews]
                                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                        .map((iv) => <InterviewRow key={iv.id} iv={iv} />)}
                                </div>
                            )}
                        </CardSection>
                    </div>

                    <div className="profile-col">
                        {/* Latest completed eval */}
                        {completedIVs.length > 0 && (() => {
                            const latest = [...completedIVs].sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime())[0]!;
                            const latestEvals = latest.questions.flatMap((q) => q.response?.evaluation ? [q.response.evaluation] : []);
                            const merged: Evaluation = {
                                overallScore100: avg(latestEvals.map((e) => normalizeScore(e))),
                                clarity: avg(latestEvals.map((e) => e.clarity)),
                                technical: avg(latestEvals.map((e) => e.technical)),
                                confidence: avg(latestEvals.map((e) => (e.confidence ?? 0) * 10)),
                            };
                            return (
                                <CardSection title={`Latest: ${latest.title}`}>
                                    <EvalBreakdown ev={merged} />
                                    {latestEvals[0]?.feedback && (
                                        <div style={{ marginTop: "0.75rem", padding: "0.85rem 1rem", background: "var(--card-2)", borderRadius: "var(--r-md)", border: "1px solid var(--border)", fontSize: "0.82rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                                            <div style={{ fontFamily: "var(--ff-mono)", fontSize: "0.62rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>Feedback</div>
                                            {latestEvals[0].feedback}
                                        </div>
                                    )}
                                    {latestEvals[0]?.strengths && (
                                        <div style={{ marginTop: "0.75rem", padding: "0.75rem 1rem", background: "rgba(226,168,75,0.06)", border: "1px solid rgba(226,168,75,0.18)", borderRadius: "var(--r-md)", fontSize: "0.82rem", color: "var(--positive)", lineHeight: 1.6 }}>
                                            <strong>' Strengths:</strong> {Array.isArray(latestEvals[0].strengths) ? latestEvals[0].strengths.join(", ") : latestEvals[0].strengths}
                                        </div>
                                    )}
                                    {latestEvals[0]?.improvements && (
                                        <div style={{ marginTop: "0.75rem", padding: "0.75rem 1rem", background: "rgba(255,77,109,0.06)", border: "1px solid rgba(255,77,109,0.18)", borderRadius: "var(--r-md)", fontSize: "0.82rem", color: "var(--rose)", lineHeight: 1.6 }}>
                                            <strong> Improve:</strong> {Array.isArray(latestEvals[0].improvements) ? latestEvals[0].improvements.join(", ") : latestEvals[0].improvements}
                                        </div>
                                    )}
                                </CardSection>
                            );
                        })()}

                        {/* Score trend (simple visual) */}
                        {completedIVs.length > 1 && (
                            <CardSection title="Score Trend">
                                <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "80px" }}>
                                    {[...completedIVs]
                                        .sort((a, b) => new Date(a.completedAt ?? a.createdAt).getTime() - new Date(b.completedAt ?? b.createdAt).getTime())
                                        .slice(-12)
                                        .map((iv, i) => {
                                            const scores = iv.questions.map((q) => normalizeScore(q.response?.evaluation));
                                            const s = avg(scores);
                                            const h = s ? Math.max((s / 100) * 72, 6) : 6;
                                            return (
                                                <div key={i} title={`${iv.title}: ${s}`} style={{
                                                    flex: 1, height: `${h}px`, borderRadius: "3px 3px 0 0",
                                                    background: s >= 75 ? "var(--positive)" : s >= 50 ? "var(--amber)" : "var(--rose)",
                                                    opacity: 0.85, minWidth: 0, cursor: "default",
                                                    transition: "height 0.6s var(--ease-snap)",
                                                }} />
                                            );
                                        })}
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--ff-mono)", fontSize: "0.62rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                                    <span>Oldest</span><span>Most recent</span>
                                </div>
                            </CardSection>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
