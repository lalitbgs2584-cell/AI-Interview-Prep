import type { Response } from "express";
import { prisma } from "@repo/db/prisma-db";
import { logEvent } from "../utils/eventLogger.js";
import type { AuthenticatedRequest } from "../types/auth-request.js";

type WorkerHealthStatus = "healthy" | "degraded";
type SettingsBundle = {
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
};


type SettingsInput = {
  interviewConfig?: Partial<SettingsBundle["interviewConfig"]>;
  aiParameters?: Partial<SettingsBundle["aiParameters"]>;
};
const DEFAULT_ADMIN_SETTINGS: SettingsBundle = {
  interviewConfig: {
    questionsPerSession: 6,
    timePerQuestion: 120,
    defaultDifficulty: "MEDIUM",
    allowReattempts: true,
  },
  aiParameters: {
    strictnessLevel: 3,
    confidenceThreshold: 0.6,
    followupQuestions: true,
    fillerWordPenalty: false,
    interruptionDetection: true,
  },
};

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function monthsAgo(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return date.toLocaleString("en-IN", { month: "short" });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numericEntries(value: unknown) {
  if (!isRecord(value)) return [] as Array<[string, number]>;
  return Object.entries(value).flatMap(([key, raw]) => {
    const numberValue = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(numberValue) ? [[key, numberValue] as [string, number]] : [];
  });
}

function mergeSettings(defaults: SettingsBundle, stored: SettingsInput): SettingsBundle {
  return {
    interviewConfig: {
      ...defaults.interviewConfig,
      ...(stored.interviewConfig ?? {}),
    },
    aiParameters: {
      ...defaults.aiParameters,
      ...(stored.aiParameters ?? {}),
    },
  };
}

async function getAdminSettingsBundle() {
  const [interviewConfig, aiParameters] = await Promise.all([
    prisma.adminSettings.upsert({
      where: { key: "interview_config" },
      update: {},
      create: {
        key: "interview_config",
        value: JSON.parse(JSON.stringify(DEFAULT_ADMIN_SETTINGS.interviewConfig)),
      },
    }),
    prisma.adminSettings.upsert({
      where: { key: "ai_parameters" },
      update: {},
      create: {
        key: "ai_parameters",
        value: JSON.parse(JSON.stringify(DEFAULT_ADMIN_SETTINGS.aiParameters)),
      },
    }),
  ]);

  const settings = mergeSettings(DEFAULT_ADMIN_SETTINGS, {
    interviewConfig: isRecord(interviewConfig.value) ? (interviewConfig.value as Partial<SettingsBundle["interviewConfig"]>) : {},
    aiParameters: isRecord(aiParameters.value) ? (aiParameters.value as Partial<SettingsBundle["aiParameters"]>) : {},
  });

  return {
    settings,
    updatedAt: new Date(Math.max(interviewConfig.updatedAt.getTime(), aiParameters.updatedAt.getTime())),
  };
}

function buildQuestionBank(rows: Array<{ type: string | null; difficulty: string | null }>) {
  const bank = new Map<string, { type: string; easy: number; medium: number; hard: number; total: number }>();

  for (const row of rows) {
    const type = row.type || "UNKNOWN";
    if (!bank.has(type)) {
      bank.set(type, { type, easy: 0, medium: 0, hard: 0, total: 0 });
    }

    const target = bank.get(type)!;
    target.total += 1;
    const difficulty = (row.difficulty || "").toUpperCase();
    if (difficulty === "EASY") target.easy += 1;
    else if (difficulty === "MEDIUM") target.medium += 1;
    else if (difficulty === "HARD") target.hard += 1;
  }

  return [...bank.values()].sort((left, right) => right.total - left.total);
}

export async function getAnalytics(_req: AuthenticatedRequest, res: Response) {
  try {
    const sixMonthsAgo = monthsAgo(5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);
    const twentyFourHoursAgo = daysAgo(1);
    const ninetyDaysAgo = daysAgo(90);

    const [interviews, summaries, failedJobs24h, inProgressNow] = await Promise.all([
      prisma.interview.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        orderBy: { createdAt: "asc" },
        include: {
          summary: { select: { overallScore: true, recommendation: true, skillScores: true } },
        },
      }),
      prisma.interviewSummary.findMany({
        where: { createdAt: { gte: ninetyDaysAgo } },
        select: { overallScore: true, recommendation: true, skillScores: true },
      }),
      prisma.jobFailure.count({ where: { failedAt: { gte: twentyFourHoursAgo } } }),
      prisma.interview.count({ where: { status: "IN_PROGRESS" } }),
    ]);

    const monthBuckets = Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - index));
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      return {
        key: monthKey(date),
        month: monthLabel(date),
        interviews: 0,
        completions: 0,
        scoreTotal: 0,
        scoreCount: 0,
      };
    });
    const monthMap = new Map(monthBuckets.map((bucket) => [bucket.key, bucket]));

    let completed = 0;
    let earlyExit = 0;
    let totalDuration = 0;

    for (const interview of interviews) {
      const bucket = monthMap.get(monthKey(interview.createdAt));
      if (bucket) {
        bucket.interviews += 1;
        if (interview.status === "COMPLETED") bucket.completions += 1;
        if (typeof interview.summary?.overallScore === "number") {
          bucket.scoreTotal += interview.summary.overallScore;
          bucket.scoreCount += 1;
        }
      }

      if (interview.status === "COMPLETED") completed += 1;
      if (interview.endReason && interview.endReason !== "completed") earlyExit += 1;
      totalDuration += interview.sessionDurationSec ?? 0;
    }

    const recommendationCounts = summaries.reduce<Record<string, number>>((acc, summary) => {
      const key = summary.recommendation?.trim() || "Needs More Evaluation";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const weaknessAccumulator = new Map<string, { totalScore: number; count: number }>();
    for (const summary of summaries) {
      for (const [dimension, score] of numericEntries(summary.skillScores)) {
        const current = weaknessAccumulator.get(dimension) ?? { totalScore: 0, count: 0 };
        current.totalScore += score;
        current.count += 1;
        weaknessAccumulator.set(dimension, current);
      }
    }

    const weaknessAreas = [...weaknessAccumulator.entries()]
      .map(([topic, entry]) => {
        const avgScore = Math.round(entry.totalScore / entry.count);
        return {
          topic,
          avgScore,
          failRate: clamp(100 - avgScore, 0, 100),
          samples: entry.count,
        };
      })
      .sort((left, right) => right.failRate - left.failRate)
      .slice(0, 6);

    const totalInterviews = interviews.length;
    const totalWithScore = summaries.filter((summary) => typeof summary.overallScore === "number");
    const avgScore = totalWithScore.length
      ? Math.round(totalWithScore.reduce((sum, summary) => sum + (summary.overallScore ?? 0), 0) / totalWithScore.length)
      : 0;
    const completionRate = totalInterviews ? Math.round((completed / totalInterviews) * 100) : 0;
    const dropOffRate = totalInterviews ? Math.round((earlyExit / totalInterviews) * 100) : 0;
    const avgDurationMinutes = totalInterviews ? Math.round(totalDuration / totalInterviews / 60) : 0;

    res.json({
      kpis: {
        dropOffRate,
        completionRate,
        avgScore,
        activeNow: inProgressNow,
        totalInterviews,
        failedJobs24h,
        avgDurationMinutes,
      },
      performanceTrend: monthBuckets.map((bucket) => ({
        month: bucket.month,
        interviews: bucket.interviews,
        completions: bucket.completions,
        avg: bucket.scoreCount ? Math.round(bucket.scoreTotal / bucket.scoreCount) : 0,
      })),
      topicWeakness: weaknessAreas,
      recommendationSplit: Object.entries(recommendationCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((left, right) => right.value - left.value),
    });
  } catch (error) {
    console.error("[admin.getAnalytics]", error);
    res.status(500).json({ message: "Failed to load analytics" });
  }
}

export async function getAiMonitor(_req: AuthenticatedRequest, res: Response) {
  try {
    const twentyFourHoursAgo = daysAgo(1);
    const sixHoursAgo = daysAgo(0.25);
    const fifteenMinutesAgo = daysAgo(1 / 96);

    const [eventLogs, failedJobs, liveInterviews] = await Promise.all([
      prisma.eventLog.findMany({
        where: { createdAt: { gte: twentyFourHoursAgo } },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      prisma.jobFailure.findMany({
        where: { failedAt: { gte: twentyFourHoursAgo } },
        orderBy: { failedAt: "desc" },
        take: 100,
      }),
      prisma.interview.findMany({
        where: { status: "IN_PROGRESS" },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
          questions: {
            include: {
              response: { select: { id: true } },
            },
          },
        },
      }),
    ]);

    const workerMap = new Map<string, { name: string; jobs: number; errors: number; lastSeen: Date | null }>();

    for (const log of eventLogs) {
      const name = log.service || "unknown-service";
      const worker = workerMap.get(name) ?? { name, jobs: 0, errors: 0, lastSeen: null };
      worker.jobs += 1;
      if (log.level === "error" || log.level === "warn") worker.errors += 1;
      worker.lastSeen = !worker.lastSeen || log.createdAt > worker.lastSeen ? log.createdAt : worker.lastSeen;
      workerMap.set(name, worker);
    }

    for (const failure of failedJobs) {
      const name = failure.queue || "unknown-queue";
      const worker = workerMap.get(name) ?? { name, jobs: 0, errors: 0, lastSeen: null };
      worker.errors += 1;
      worker.lastSeen = !worker.lastSeen || failure.failedAt > worker.lastSeen ? failure.failedAt : worker.lastSeen;
      workerMap.set(name, worker);
    }

    const workers = [...workerMap.values()]
      .filter((worker) => worker.lastSeen == null || worker.lastSeen >= sixHoursAgo)
      .map((worker) => {
        const lastSeen = worker.lastSeen;
        const status: WorkerHealthStatus =
          !lastSeen || lastSeen < fifteenMinutesAgo || (worker.jobs > 0 && worker.errors / worker.jobs > 0.35)
            ? "degraded"
            : "healthy";

        return {
          name: worker.name,
          status,
          jobs: worker.jobs,
          errors: worker.errors,
          lastSeen: lastSeen ? lastSeen.toISOString() : null,
        };
      })
      .sort((left, right) => {
        if (left.status !== right.status) return left.status === "degraded" ? -1 : 1;
        return (right.lastSeen ? new Date(right.lastSeen).getTime() : 0) - (left.lastSeen ? new Date(left.lastSeen).getTime() : 0);
      });

    const recentErrors = [
      ...eventLogs
        .filter((log) => log.level === "error" || log.level === "warn")
        .map((log) => ({
          time: log.createdAt.toLocaleTimeString("en-IN", { hour12: false }),
          worker: log.service,
          msg: log.eventType,
          level: log.level === "error" ? "error" : "warn",
          createdAt: log.createdAt.toISOString(),
        })),
      ...failedJobs.map((failure) => ({
        time: failure.failedAt.toLocaleTimeString("en-IN", { hour12: false }),
        worker: failure.queue,
        msg: failure.reason || "Worker job failed",
        level: "error" as const,
        createdAt: failure.failedAt.toISOString(),
      })),
    ]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 12);

    res.json({
      summary: {
        healthyWorkers: workers.filter((worker) => worker.status === "healthy").length,
        degradedWorkers: workers.filter((worker) => worker.status === "degraded").length,
        activeSessions: liveInterviews.length,
        errors24h: recentErrors.filter((entry) => entry.level === "error").length,
      },
      workers,
      liveSessions: liveInterviews.map((interview) => {
        const answered = interview.questions.filter((question) => question.response).length;
        return {
          id: interview.id,
          userName: interview.user.name,
          userEmail: interview.user.email,
          type: interview.type,
          status: interview.status,
          startedAt: interview.createdAt.toISOString(),
          question: clamp(answered + 1, 1, Math.max(1, interview.questions.length)),
          totalQ: Math.max(1, interview.questions.length),
        };
      }),
      recentErrors,
    });
  } catch (error) {
    console.error("[admin.getAiMonitor]", error);
    res.status(500).json({ message: "Failed to load AI monitor" });
  }
}

export async function getSettings(_req: AuthenticatedRequest, res: Response) {
  try {
    const [settingsBundle, questions] = await Promise.all([
      getAdminSettingsBundle(),
      prisma.question.findMany({ select: { type: true, difficulty: true } }),
    ]);

    res.json({
      ...settingsBundle.settings,
      updatedAt: settingsBundle.updatedAt.toISOString(),
      questionBank: buildQuestionBank(questions),
    });
  } catch (error) {
    console.error("[admin.getSettings]", error);
    res.status(500).json({ message: "Failed to load admin settings" });
  }
}

export async function updateSettings(req: AuthenticatedRequest, res: Response) {
  try {
    const body = isRecord(req.body) ? req.body : {};
    const current = await getAdminSettingsBundle();
    const merged = mergeSettings(current.settings, {
      interviewConfig: isRecord(body.interviewConfig)
        ? (body.interviewConfig as Partial<SettingsBundle["interviewConfig"]>)
        : {},
      aiParameters: isRecord(body.aiParameters)
        ? (body.aiParameters as Partial<SettingsBundle["aiParameters"]>)
        : {},
    });

    const [interviewConfig, aiParameters, questions] = await Promise.all([
      prisma.adminSettings.upsert({
        where: { key: "interview_config" },
        update: { value: JSON.parse(JSON.stringify(merged.interviewConfig)) },
        create: { key: "interview_config", value: JSON.parse(JSON.stringify(merged.interviewConfig)) },
      }),
      prisma.adminSettings.upsert({
        where: { key: "ai_parameters" },
        update: { value: JSON.parse(JSON.stringify(merged.aiParameters)) },
        create: { key: "ai_parameters", value: JSON.parse(JSON.stringify(merged.aiParameters)) },
      }),
      prisma.question.findMany({ select: { type: true, difficulty: true } }),
    ]);

    await logEvent({
      stage: "admin.settings",
      eventType: "admin_settings_updated",
      userId: req.adminUser?.id ?? undefined,
      payload: merged,
    });

    res.json({
      interviewConfig: merged.interviewConfig,
      aiParameters: merged.aiParameters,
      updatedAt: new Date(Math.max(interviewConfig.updatedAt.getTime(), aiParameters.updatedAt.getTime())).toISOString(),
      questionBank: buildQuestionBank(questions),
    });
  } catch (error) {
    console.error("[admin.updateSettings]", error);
    res.status(500).json({ message: "Failed to update admin settings" });
  }
}


