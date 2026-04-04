import path from "path";
import type { Response } from "express";
import { prisma } from "@repo/db/prisma-db";
import { logEvent } from "../utils/eventLogger.js";
import { listAdminRecordings, resolveAdminRecordingPath } from "../utils/adminRecordings.js";
import type { AuthenticatedRequest } from "../types/auth-request.js";
import { getAiMonitor, getAnalytics, getSettings, updateSettings } from "./admin.dynamic.controller.js";

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function parsePositiveInt(value: unknown, fallback: number, max = 100) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function averageScore(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === "number");
  if (!filtered.length) return null;
  return Math.round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length);
}

function getUserStatus(user: { isBlocked: boolean; isDeleted: boolean; lastLoginAt: Date | null }) {
  if (user.isDeleted) return "deleted";
  if (user.isBlocked) return "blocked";
  if (!user.lastLoginAt) return "inactive";
  const thirtyDaysAgo = daysAgo(30);
  return user.lastLoginAt >= thirtyDaysAgo ? "active" : "inactive";
}

function normalizeInterviewScore(interview: {
  summary: { overallScore: number } | null;
  questions?: Array<{ score: number | null }>;
}) {
  if (interview.summary?.overallScore != null) return interview.summary.overallScore;
  return averageScore(interview.questions?.map((question) => question.score) ?? []);
}

function endReasonLabel(reason?: string | null) {
  return reason || "completed";
}

export const adminController = {
  getAnalytics,
  getAiMonitor,
  getSettings,
  updateSettings,
  getStats: async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const today = startOfToday();
      const sevenDaysAgo = daysAgo(7);
      const twentyFourHoursAgo = daysAgo(1);

      const [
        totalUsers,
        activeToday,
        newSignups7d,
        totalInterviews,
        completedToday,
        inProgressNow,
        avgSummaries,
        avgRecentSummaries,
        failedJobs24h,
        users,
        liveFeedRows,
        interviewTypes,
        skills,
        flaggedSessions,
      ] = await Promise.all([
        prisma.user.count({ where: { isDeleted: false } }),
        prisma.user.count({ where: { isDeleted: false, lastLoginAt: { gte: today } } }),
        prisma.user.count({ where: { isDeleted: false, createdAt: { gte: sevenDaysAgo } } }),
        prisma.interview.count(),
        prisma.interview.count({ where: { status: "COMPLETED", completedAt: { gte: today } } }),
        prisma.interview.count({ where: { status: "IN_PROGRESS" } }),
        prisma.interviewSummary.aggregate({ _avg: { overallScore: true } }),
        prisma.interviewSummary.aggregate({
          _avg: { overallScore: true },
          where: { interview: { createdAt: { gte: sevenDaysAgo } } },
        }),
        prisma.jobFailure.count({ where: { failedAt: { gte: twentyFourHoursAgo } } }),
        prisma.user.findMany({
          where: { isDeleted: false },
          select: { isBlocked: true, isDeleted: true, lastLoginAt: true },
        }),
        prisma.interview.findMany({
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, name: true, email: true } },
            summary: { select: { overallScore: true, recommendation: true } },
            questions: { select: { score: true } },
          },
        }),
        prisma.interview.findMany({ select: { type: true } }),
        prisma.skill.findMany({ include: { _count: { select: { users: true } } } }),
        prisma.interview.findMany({
          take: 8,
          orderBy: { createdAt: "desc" },
          where: {
            OR: [
              { fsExits: { gt: 0 } },
              { tabSwitches: { gt: 0 } },
              { endReason: { not: "completed" } },
            ],
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            summary: { select: { overallScore: true } },
            questions: { select: { score: true } },
          },
        }),
      ]);

      const userStatusBreakdown = users.reduce(
        (acc, user) => {
          const status = getUserStatus(user);
          acc[status] = (acc[status] ?? 0) + 1;
          return acc;
        },
        { active: 0, blocked: 0, inactive: 0, deleted: 0 } as Record<string, number>,
      );

      const interviewTypeBreakdown = interviewTypes.reduce<Record<string, number>>((acc, interview) => {
        const type = interview.type ?? "UNKNOWN";
        acc[type] = (acc[type] ?? 0) + 1;
        return acc;
      }, {});

      const topSkills = [...skills]
        .sort((left, right) => right._count.users - left._count.users)
        .slice(0, 8)
        .map((skill) => ({
          id: skill.id,
          name: skill.name,
          category: skill.category,
          userCount: skill._count.users,
        }));

      res.json({
        totals: {
          totalUsers,
          activeToday,
          newSignups7d,
          totalInterviews,
          completedToday,
          inProgressNow,
          avgScore: Math.round(avgSummaries._avg.overallScore ?? 0),
          avgScore7d: Math.round(avgRecentSummaries._avg.overallScore ?? 0),
          failedJobs24h,
        },
        liveFeed: liveFeedRows.map((interview) => ({
          id: interview.id,
          userId: interview.userId,
          userName: interview.user.name,
          userEmail: interview.user.email,
          type: interview.type,
          status: interview.status,
          role: interview.title,
          score: normalizeInterviewScore(interview),
          recommendation: interview.summary?.recommendation ?? null,
          createdAt: interview.createdAt.toISOString(),
        })),
        interviewTypeBreakdown,
        userStatusBreakdown,
        topSkills,
        flaggedSessions: flaggedSessions.map((interview) => ({
          id: interview.id,
          userId: interview.userId,
          userName: interview.user.name,
          type: interview.type,
          score: normalizeInterviewScore(interview),
          fsExits: interview.fsExits,
          tabSwitches: interview.tabSwitches,
          endReason: endReasonLabel(interview.endReason),
          createdAt: interview.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error("[admin.getStats]", error);
      res.status(500).json({ message: "Failed to load admin dashboard stats" });
    }
  },

  getUsers: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const role = typeof req.query.role === "string" ? req.query.role.trim().toUpperCase() : "ALL";
      const status = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "all";
      const page = parsePositiveInt(req.query.page, 1);
      const pageSize = parsePositiveInt(req.query.pageSize, 25);
      const thirtyDaysAgo = daysAgo(30);

      const where: Record<string, unknown> = { isDeleted: false };

      if (query) {
        where.OR = [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ];
      }

      if (role === "USER" || role === "ADMIN") {
        where.role = role;
      }

      if (status === "blocked") {
        where.isBlocked = true;
      }

      if (status === "active") {
        where.isBlocked = false;
        where.lastLoginAt = { gte: thirtyDaysAgo };
      }

      if (status === "inactive") {
        where.isBlocked = false;
        where.OR = [
          ...(Array.isArray(where.OR) ? where.OR : []),
          { lastLoginAt: null },
          { lastLoginAt: { lt: thirtyDaysAgo } },
        ];
      }

      const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
          include: {
            interviews: {
              select: {
                id: true,
                createdAt: true,
                summary: { select: { overallScore: true } },
              },
            },
            _count: {
              select: {
                interviews: true,
                resumes: true,
              },
            },
          },
        }),
      ]);

      res.json({
        items: users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: getUserStatus(user),
          isBlocked: user.isBlocked,
          isDeleted: user.isDeleted,
          joinedAt: user.createdAt.toISOString(),
          lastActiveAt: user.lastLoginAt?.toISOString() ?? null,
          interviewCount: user._count.interviews,
          resumeCount: user._count.resumes,
          avgScore: averageScore(user.interviews.map((interview) => interview.summary?.overallScore ?? null)),
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      });
    } catch (error) {
      console.error("[admin.getUsers]", error);
      res.status(500).json({ message: "Failed to load users" });
    }
  },
  getUserById: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = String(req.params.id ?? "");
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          skills: { include: { skill: true } },
          gapReport: true,
          resumes: {
            include: {
              file: true,
              insights: true,
              education: true,
              workExperience: true,
              projects: true,
              extracurricular: true,
            },
          },
          interviews: {
            orderBy: { createdAt: "desc" },
            include: {
              summary: true,
              questions: {
                orderBy: { order: "asc" },
                include: {
                  question: true,
                  response: { include: { evaluation: true } },
                },
              },
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const interviews = await Promise.all(
        user.interviews.map(async (interview) => ({
          id: interview.id,
          title: interview.title,
          description: interview.description,
          type: interview.type,
          status: interview.status,
          createdAt: interview.createdAt.toISOString(),
          completedAt: interview.completedAt?.toISOString() ?? null,
          durationSeconds: interview.sessionDurationSec,
          score: normalizeInterviewScore(interview),
          recommendation: interview.summary?.recommendation ?? null,
          endReason: endReasonLabel(interview.endReason),
          fsExits: interview.fsExits,
          tabSwitches: interview.tabSwitches,
          interruptionCount: interview.interruptionCount ?? 0,
          questionCount: interview.questions.length,
          recordings: await listAdminRecordings(interview.id),
        })),
      );

      const resume = user.resumes[0] ?? null;

      res.json({
        profile: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          status: getUserStatus(user),
          isBlocked: user.isBlocked,
          isDeleted: user.isDeleted,
          joinedAt: user.createdAt.toISOString(),
          lastActiveAt: user.lastLoginAt?.toISOString() ?? null,
          streak: user.streak,
          bestStreak: user.bestStreak,
          activityMap: user.activityMap,
        },
        stats: {
          interviewCount: interviews.length,
          avgScore: averageScore(interviews.map((interview) => interview.score)),
          completedCount: interviews.filter((interview) => interview.status === "COMPLETED").length,
          recordingCount: interviews.reduce((count, interview) => count + interview.recordings.length, 0),
        },
        skills: user.skills.map((entry) => ({
          id: entry.skill.id,
          name: entry.skill.name,
          category: entry.skill.category,
        })),
        interviews,
        resume: resume
          ? {
              id: resume.id,
              createdAt: resume.createdAt.toISOString(),
              updatedAt: resume.updatedAt.toISOString(),
              file: {
                id: resume.file.id,
                url: resume.file.url,
                originalFileName: resume.file.OriginalFileName,
                status: resume.file.status,
              },
              insights: resume.insights
                ? {
                    experienceLevel: resume.insights.experienceLevel,
                    keySkills: resume.insights.keySkills,
                    atsScore: resume.insights.ATSSCORE,
                    strongDomains: resume.insights.strongDomains,
                    weakAreas: resume.insights.weakAreas,
                  }
                : null,
              education: resume.education,
              workExperience: resume.workExperience,
              projects: resume.projects,
              extracurricular: resume.extracurricular,
            }
          : null,
        gapReport: user.gapReport,
      });
    } catch (error) {
      console.error("[admin.getUserById]", error);
      res.status(500).json({ message: "Failed to load user profile" });
    }
  },

  updateUser: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const targetId = String(req.params.id ?? "");
      const { role, isBlocked, isDeleted, isBlockedReason } = req.body as {
        role?: "USER" | "ADMIN";
        isBlocked?: boolean;
        isDeleted?: boolean;
        isBlockedReason?: string;
      };

      const existing = await prisma.user.findUnique({ where: { id: targetId } });
      if (!existing) {
        return res.status(404).json({ message: "User not found" });
      }

      if (req.adminUser?.id === targetId && role === "USER") {
        return res.status(400).json({ message: "You cannot remove your own admin role" });
      }

      const updated = await prisma.user.update({
        where: { id: targetId },
        data: {
          ...(role ? { role } : {}),
          ...(typeof isBlocked === "boolean"
            ? {
                isBlocked,
                isBlockedAt: isBlocked ? new Date() : null,
                isBlockedReason: isBlocked ? (isBlockedReason?.trim() || existing.isBlockedReason || "Blocked by admin") : "",
              }
            : {}),
          ...(typeof isDeleted === "boolean" ? { isDeleted } : {}),
        },
      });

      await logEvent({
        stage: "admin.users",
        eventType: "admin_user_updated",
        userId: existing.id,
        payload: {
          adminId: req.adminUser?.id ?? null,
          before: {
            role: existing.role,
            isBlocked: existing.isBlocked,
            isDeleted: existing.isDeleted,
          },
          after: {
            role: updated.role,
            isBlocked: updated.isBlocked,
            isDeleted: updated.isDeleted,
          },
        },
      });

      res.json({
        message: "User updated",
        user: {
          id: updated.id,
          role: updated.role,
          isBlocked: updated.isBlocked,
          isDeleted: updated.isDeleted,
          isBlockedReason: updated.isBlockedReason,
        },
      });
    } catch (error) {
      console.error("[admin.updateUser]", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  },

  getInterviews: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const type = typeof req.query.type === "string" ? req.query.type.trim().toUpperCase() : "ALL";
      const status = typeof req.query.status === "string" ? req.query.status.trim().toUpperCase() : "ALL";
      const page = parsePositiveInt(req.query.page, 1);
      const pageSize = parsePositiveInt(req.query.pageSize, 25);

      const where: Record<string, unknown> = {};

      if (query) {
        where.OR = [
          { title: { contains: query, mode: "insensitive" } },
          { user: { name: { contains: query, mode: "insensitive" } } },
          { user: { email: { contains: query, mode: "insensitive" } } },
        ];
      }

      if (type !== "ALL") {
        where.type = type;
      }

      if (status !== "ALL") {
        where.status = status;
      }

      const [total, interviews] = await Promise.all([
        prisma.interview.count({ where }),
        prisma.interview.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, name: true, email: true } },
            summary: { select: { overallScore: true, recommendation: true } },
            questions: { select: { score: true } },
          },
        }),
      ]);

      res.json({
        items: interviews.map((interview) => ({
          id: interview.id,
          userId: interview.userId,
          userName: interview.user.name,
          userEmail: interview.user.email,
          title: interview.title,
          type: interview.type,
          status: interview.status,
          score: normalizeInterviewScore(interview),
          recommendation: interview.summary?.recommendation ?? null,
          durationSeconds: interview.sessionDurationSec,
          createdAt: interview.createdAt.toISOString(),
          completedAt: interview.completedAt?.toISOString() ?? null,
          violations: {
            fsExits: interview.fsExits,
            tabSwitches: interview.tabSwitches,
            interruptions: interview.interruptionCount ?? 0,
            endReason: endReasonLabel(interview.endReason),
          },
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      });
    } catch (error) {
      console.error("[admin.getInterviews]", error);
      res.status(500).json({ message: "Failed to load interviews" });
    }
  },
  getInterviewById: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const interviewId = String(req.params.id ?? "");
      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              role: true,
            },
          },
          summary: true,
          questions: {
            orderBy: { order: "asc" },
            include: {
              question: true,
              response: { include: { evaluation: true } },
            },
          },
        },
      });

      if (!interview) {
        return res.status(404).json({ message: "Interview not found" });
      }

      const recordings = await listAdminRecordings(interview.id);

      res.json({
        id: interview.id,
        title: interview.title,
        description: interview.description,
        type: interview.type,
        status: interview.status,
        createdAt: interview.createdAt.toISOString(),
        completedAt: interview.completedAt?.toISOString() ?? null,
        durationSeconds: interview.sessionDurationSec,
        score: normalizeInterviewScore(interview),
        recommendation: interview.summary?.recommendation ?? null,
        summary: interview.summary?.summary ?? null,
        endReason: endReasonLabel(interview.endReason),
        fsExits: interview.fsExits,
        tabSwitches: interview.tabSwitches,
        interruptionCount: interview.interruptionCount ?? 0,
        user: interview.user,
        recordings,
        questionScores: interview.summary?.questionScores ?? [],
        scorePillars: interview.summary?.skillScores ?? {},
        gapAnalysis: interview.summary?.gapAnalysis ?? {},
        tips: interview.summary?.tips ?? [],
        questions: interview.questions.map((entry) => ({
          id: entry.id,
          order: entry.order,
          score: entry.score,
          questionId: entry.questionId,
          prompt: entry.question.content,
          difficulty: entry.question.difficulty,
          type: entry.question.type,
          referenceAnswer: entry.referenceAnswer,
          answer: entry.response?.userAnswer ?? null,
          submittedAt: entry.response?.submittedAt?.toISOString() ?? null,
          evaluation: entry.response?.evaluation
            ? {
                overallScore: entry.response.evaluation.overallScore100 ?? entry.response.evaluation.overallScore ?? null,
                verdict: entry.response.evaluation.verdict,
                feedback: entry.response.evaluation.feedback,
                strengths: entry.response.evaluation.strengths,
                weaknesses: entry.response.evaluation.weaknesses,
                missingConcepts: entry.response.evaluation.missingConcepts,
                incorrectPoints: entry.response.evaluation.incorrectPoints,
                dimensions: entry.response.evaluation.dimensions,
                confidence: entry.response.evaluation.confidence,
              }
            : null,
        })),
      });
    } catch (error) {
      console.error("[admin.getInterviewById]", error);
      res.status(500).json({ message: "Failed to load interview detail" });
    }
  },

  listRecordings: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const interviewId = typeof req.query.interviewId === "string" ? req.query.interviewId : null;
      const recordings = await listAdminRecordings(interviewId);
      res.json({ recordings });
    } catch (error) {
      console.error("[admin.listRecordings]", error);
      res.status(500).json({ message: "Failed to list recordings" });
    }
  },

  streamRecording: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const recordingName = String(req.params.name ?? "");
      const filePath = await resolveAdminRecordingPath(recordingName);
      if (!filePath) {
        return res.status(404).json({ message: "Recording not found" });
      }

      const extension = path.extname(filePath).toLowerCase();
      if (extension === ".mp4") {
        res.type("video/mp4");
      } else {
        res.type("video/webm");
      }

      return res.sendFile(filePath);
    } catch (error) {
      console.error("[admin.streamRecording]", error);
      res.status(500).json({ message: "Failed to stream recording" });
    }
  },
};


