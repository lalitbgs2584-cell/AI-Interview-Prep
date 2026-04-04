export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const C = {
  accent: "#ff5c35",
  accent2: "#ff8162",
  green: "#10b981",
  amber: "#f59e0b",
  rose: "#ef4444",
  sky: "#22d3ee",
  violet: "#a78bfa",
  muted: "#4b5563",
  bg: "#080b12",
} as const;

export const DIFF_COLOR: Record<string, string> = {
  intro: C.violet,
  easy: C.green,
  medium: C.amber,
  hard: C.rose,
};

export const scoreColor = (s: number | null | undefined): string => {
  if (s === null || s === undefined) return C.muted;
  return s >= 75 ? C.green : s >= 55 ? C.amber : C.rose;
};

export const scoreLabel = (s: number | null | undefined): string => {
  if (s === null || s === undefined) return "No Score";
  return s >= 75 ? "Strong" : s >= 55 ? "Good" : "Needs Work";
};

export const fmtDuration = (sec: number | null | undefined): string => {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
};

export const fmtDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

export interface QuestionScore {
  index: number;
  question: string;
  score: number;
  difficulty: string;
  verdict?: string;
  feedback?: string;
  user_answer?: string;
  reference_answer?: string;
  expected_answer?: { key_concepts?: string[] };
  dimensions?: Record<string, number>;
  analytics?: Record<string, any>;
  score_pillars?: Record<string, number>;
  missing_concepts?: string[];
  strengths?: string[];
  weaknesses?: string[];
}

export interface FeedbackData {
  overall_score: number;
  role: string;
  interview_type: string;
  recommendation: string;
  summary: string;
  date_iso: string;
  duration_seconds: number;
  question_scores: QuestionScore[];
  skill_scores: Record<string, number>;
  score_pillars: Record<string, number>;
  analytics: Record<string, any>;
  what_went_right: Array<{ point: string; tag?: string }>;
  what_went_wrong: Array<{ point: string; tag?: string }>;
  strengths: string[];
  weaknesses: string[];
  tips: string[];
  coaching_priorities: string[];
  recovery_score?: number;
  pressure_handling_score?: number;
  conciseness_score?: number;
  gap_analysis?: {
    repeated_gaps?: string[];
    weak_dimensions?: string[];
    dim_averages?: Record<string, number>;
  };
  history: Array<{ score: number; interview_id: string }>;
}
