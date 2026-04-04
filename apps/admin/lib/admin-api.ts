export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface RecordingItem {
  name: string;
  url: string;
  createdAt: string;
  size: number;
}

export interface AdminStatsResponse {
  totals: {
    totalUsers: number;
    activeToday: number;
    newSignups7d: number;
    totalInterviews: number;
    completedToday: number;
    inProgressNow: number;
    avgScore: number;
    avgScore7d: number;
    failedJobs24h: number;
  };
  liveFeed: Array<{
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    type: string;
    status: string;
    role: string;
    score: number | null;
    recommendation: string | null;
    createdAt: string;
  }>;
  interviewTypeBreakdown: Record<string, number>;
  userStatusBreakdown: Record<string, number>;
  topSkills: Array<{
    id: string;
    name: string;
    category: string | null;
    userCount: number;
  }>;
  flaggedSessions: Array<{
    id: string;
    userId: string;
    userName: string;
    type: string;
    score: number | null;
    fsExits: number;
    tabSwitches: number;
    endReason: string;
    createdAt: string;
  }>;
}

export interface AdminAnalyticsResponse {
  kpis: {
    dropOffRate: number;
    completionRate: number;
    avgScore: number;
    activeNow: number;
    totalInterviews: number;
    failedJobs24h: number;
    avgDurationMinutes: number;
  };
  performanceTrend: Array<{
    month: string;
    interviews: number;
    completions: number;
    avg: number;
  }>;
  topicWeakness: Array<{
    topic: string;
    avgScore: number;
    failRate: number;
    samples: number;
  }>;
  recommendationSplit: Array<{
    name: string;
    value: number;
  }>;
}

export interface AdminAiMonitorResponse {
  summary: {
    healthyWorkers: number;
    degradedWorkers: number;
    activeSessions: number;
    errors24h: number;
  };
  workers: Array<{
    name: string;
    status: "healthy" | "degraded";
    jobs: number;
    errors: number;
    lastSeen: string | null;
  }>;
  liveSessions: Array<{
    id: string;
    userName: string;
    userEmail: string;
    type: string;
    status: string;
    startedAt: string;
    question: number;
    totalQ: number;
  }>;
  recentErrors: Array<{
    time: string;
    worker: string;
    msg: string;
    level: "error" | "warn";
    createdAt: string;
  }>;
}

export interface AdminSettingsResponse {
  interviewConfig: {
    questionsPerSession: number;
    timePerQuestion: number;
    defaultDifficulty: "EASY" | "MEDIUM" | "HARD";
    allowReattempts: boolean;
  };
  aiParameters: {
    strictnessLevel: number;
    confidenceThreshold: number;
    followupQuestions: boolean;
    fillerWordPenalty: boolean;
    interruptionDetection: boolean;
  };
  updatedAt: string;
  questionBank: Array<{
    type: string;
    easy: number;
    medium: number;
    hard: number;
    total: number;
  }>;
}

export interface AdminUsersResponse {
  items: AdminUserListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminUserListItem {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  status: string;
  isBlocked: boolean;
  isDeleted: boolean;
  joinedAt: string;
  lastActiveAt: string | null;
  interviewCount: number;
  resumeCount: number;
  avgScore: number | null;
}

export interface AdminUserDetail {
  profile: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: "USER" | "ADMIN";
    status: string;
    isBlocked: boolean;
    isDeleted: boolean;
    joinedAt: string;
    lastActiveAt: string | null;
    streak: number;
    bestStreak: number;
    activityMap: Record<string, number> | string;
  };
  stats: {
    interviewCount: number;
    avgScore: number | null;
    completedCount: number;
    recordingCount: number;
  };
  skills: Array<{
    id: string;
    name: string;
    category: string | null;
  }>;
  interviews: Array<{
    id: string;
    title: string;
    description: string | null;
    type: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
    durationSeconds: number;
    score: number | null;
    recommendation: string | null;
    endReason: string;
    fsExits: number;
    tabSwitches: number;
    interruptionCount: number;
    questionCount: number;
    recordings: RecordingItem[];
  }>;
  resume: null | {
    id: string;
    createdAt: string;
    updatedAt: string;
    file: {
      id: string;
      url: string;
      originalFileName: string;
      status: string;
    };
    insights: null | {
      experienceLevel: number;
      keySkills: string[];
      atsScore: number;
      strongDomains: string[];
      weakAreas: string[];
    };
    education: Array<Record<string, unknown>>;
    workExperience: Array<Record<string, unknown>>;
    projects: Array<Record<string, unknown>>;
    extracurricular: Array<Record<string, unknown>>;
  };
  gapReport: Record<string, unknown> | null;
}

export interface AdminInterviewsResponse {
  items: AdminInterviewListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminInterviewListItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  title: string;
  type: string;
  status: string;
  score: number | null;
  recommendation: string | null;
  durationSeconds: number;
  createdAt: string;
  completedAt: string | null;
  violations: {
    fsExits: number;
    tabSwitches: number;
    interruptions: number;
    endReason: string;
  };
}

export interface AdminInterviewDetail {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  durationSeconds: number;
  score: number | null;
  recommendation: string | null;
  summary: string | null;
  endReason: string;
  fsExits: number;
  tabSwitches: number;
  interruptionCount: number;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: string;
  };
  recordings: RecordingItem[];
  questionScores: unknown;
  scorePillars: unknown;
  gapAnalysis: unknown;
  tips: string[];
  questions: Array<{
    id: string;
    order: number | null;
    score: number | null;
    questionId: string;
    prompt: string;
    difficulty: string | null;
    type: string | null;
    referenceAnswer: string | null;
    answer: string | null;
    submittedAt: string | null;
    evaluation: null | {
      overallScore: number | null;
      verdict: string | null;
      feedback: string | null;
      strengths: string[];
      weaknesses: string[];
      missingConcepts: string[];
      incorrectPoints: string[];
      dimensions: unknown;
      confidence: number | null;
    };
  }>;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | null | undefined>) {
  const url = new URL(path, API_BASE);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function adminFetch<T>(path: string, init?: RequestInit, query?: Record<string, string | number | boolean | null | undefined>) {
  const response = await fetch(buildUrl(path, query), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body?.message ?? body?.error ?? message;
    } catch {
      // Ignore parsing failures.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function adminMediaUrl(url: string) {
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

export function fetchAdminStats() {
  return adminFetch<AdminStatsResponse>("/api/admin/stats");
}

export function fetchAdminAnalytics() {
  return adminFetch<AdminAnalyticsResponse>("/api/admin/analytics");
}

export function fetchAdminAiMonitor() {
  return adminFetch<AdminAiMonitorResponse>("/api/admin/ai-monitor");
}

export function fetchAdminSettings() {
  return adminFetch<AdminSettingsResponse>("/api/admin/settings");
}

export function updateAdminSettings(payload: Partial<Pick<AdminSettingsResponse, "interviewConfig" | "aiParameters">>) {
  return adminFetch<AdminSettingsResponse>("/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchAdminUsers(query?: Record<string, string | number | boolean | null | undefined>) {
  return adminFetch<AdminUsersResponse>("/api/admin/users", undefined, query);
}

export function fetchAdminUser(id: string) {
  return adminFetch<AdminUserDetail>(`/api/admin/users/${id}`);
}

export function updateAdminUser(id: string, payload: Record<string, unknown>) {
  return adminFetch<{ message: string }>(`/api/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchAdminInterviews(query?: Record<string, string | number | boolean | null | undefined>) {
  return adminFetch<AdminInterviewsResponse>("/api/admin/interviews", undefined, query);
}

export function fetchAdminInterview(id: string) {
  return adminFetch<AdminInterviewDetail>(`/api/admin/interviews/${id}`);
}
