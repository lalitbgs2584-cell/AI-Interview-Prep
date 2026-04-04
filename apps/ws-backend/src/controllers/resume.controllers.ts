import { Response } from "express";
import { randomUUID } from "crypto";
import { redisClient } from "../config/redis.config.js";
import { AuthenticatedRequest } from "../types/auth-request.js";
import { prisma } from "@repo/db/prisma-db";
import { writeCheckpoint } from "../utils/checkpoint.js";
import { logEvent } from "../utils/eventLogger.js";

interface WentPoint {
  point: string;
  tag: string;
}

interface GapAnalysis {
  repeated_gaps: string[];
  all_gaps: string[];
  gap_frequency: Record<string, number>;
  weak_dimensions: string[];
  dim_averages: Record<string, number>;
}

interface ScorePillars {
  content_score: number;
  delivery_score: number;
  confidence_score: number;
  communication_flow_score: number;
}

interface SummaryAnalytics {
  filler_summary: Record<string, any>;
  flow_summary: Record<string, any>;
  confidence_summary: Record<string, any>;
  concept_coverage_trend: Array<Record<string, any>>;
}

interface UnifiedInterviewResult {
  role: string;
  interview_type: string;
  candidate_name: string;
  date_iso: string;
  duration_seconds: number;
  recommendation: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  tips: string[];
  what_went_right: WentPoint[];
  what_went_wrong: WentPoint[];
  gap_analysis: GapAnalysis;
  score_pillars: ScorePillars;
  analytics: SummaryAnalytics;
  recovery_score: number;
  pressure_handling_score: number;
  conciseness_score: number;
  coaching_priorities: string[];
  overall_score: number;
  skill_scores: Record<string, number>;
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  problemSolvingScore: number;
  confidenceScore: number;
  question_scores: {
    index: number;
    score: number;
    difficulty: string;
    question: string;
    user_answer?: string;
    expected_answer?: Record<string, unknown>;
    reference_answer?: string;
    verdict: string;
    feedback: string;
    missing_concepts: string[];
    strengths: string[];
    weaknesses: string[];
    timestamp: number;
    dimensions?: Record<string, number>;
    analytics?: Record<string, any>;
    score_pillars?: Partial<ScorePillars>;
  }[];
  questions: {
    order: number | null;
    content: string;
    answer?: string | null;
    expected_answer?: Record<string, unknown> | null;
    reference_answer?: string | null;
    difficulty: string | null;
    score: number | null;
    dimensions?: Record<string, number> | null;
    evaluation: {
      overallScore: number | null;
      clarity: number | null;
      technical: number | null;
      confidence: number | null;
      feedback: string | null;
      strengths: string | null;
      improvements: string | null;
    } | null;
  }[];
  history: {
    interview_id: string;
    score: number;
    role: string;
    date_iso: string;
  }[];
  final_improvement_plan?: {
    top_strengths: string[];
    top_weaknesses: string[];
    practice_next: string[];
  };
}

// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
// NORMALISER " Redis path (Python finalize node output)
// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
function normalizeRedisSummary(
  raw: any,
  history: UnifiedInterviewResult["history"],
  replaySteps: Array<{
    index: number;
    user_answer?: string;
    expected_answer?: Record<string, unknown>;
    reference_answer?: string;
    dimensions?: Record<string, number>;
    timestamp?: number;
  }> = [],
): UnifiedInterviewResult {
  const skillScores: Record<string, number> = raw.skill_scores ?? {};

  const questionScoresRaw: any[] = raw.question_scores ?? [];
  const replayByIndex = new Map(
    replaySteps.map((step) => [
      Number(step.index ?? 0),
      {
        user_answer: String(step.user_answer ?? ""),
        expected_answer:
          step.expected_answer && typeof step.expected_answer === "object"
            ? step.expected_answer
            : {},
        reference_answer: String(step.reference_answer ?? ""),
        // "" FIX: read dimensions from replay step directly ""
        dimensions:
          step.dimensions && typeof step.dimensions === "object"
            ? step.dimensions
            : {},
        timestamp: Number(step.timestamp ?? 0),
      },
    ]),
  );

  const overall = raw.overall_score ?? 0;

  const technicalScore =
    skillScores["Technical Depth"] ??
    skillScores["Technical"] ??
    skillScores["Correctness"] ??
    0;
  const communicationScore =
    skillScores["Communication"] ?? skillScores["Clarity"] ?? 0;
  const problemSolvingScore =
    skillScores["Problem Solving"] ??
    skillScores["Domain Knowledge"] ??
    overall;
  const confidenceScore =
    skillScores["Confidence"] ?? skillScores["Self-Awareness"] ?? 0;

  const whatWentRight: WentPoint[] = Array.isArray(raw.what_went_right)
    ? raw.what_went_right.map((w: any) => ({
      point: String(w.point ?? ""),
      tag: String(w.tag ?? "General"),
    }))
    : [];

  const whatWentWrong: WentPoint[] = Array.isArray(raw.what_went_wrong)
    ? raw.what_went_wrong.map((w: any) => ({
      point: String(w.point ?? ""),
      tag: String(w.tag ?? "Gap"),
    }))
    : [];

  const strengths: string[] = Array.isArray(raw.strengths)
    ? raw.strengths.map(String)
    : whatWentRight.map((w) => w.point);

  const weaknesses: string[] = Array.isArray(raw.weaknesses)
    ? raw.weaknesses.map(String)
    : whatWentWrong.map((w) => w.point);

  const tips: string[] = Array.isArray(raw.tips) ? raw.tips.map(String) : [];

  const rawGap = raw.gap_analysis ?? {};
  const gapAnalysis: GapAnalysis = {
    repeated_gaps: Array.isArray(rawGap.repeated_gaps)
      ? rawGap.repeated_gaps
      : [],
    all_gaps: Array.isArray(rawGap.all_gaps) ? rawGap.all_gaps : [],
    gap_frequency:
      rawGap.gap_frequency && typeof rawGap.gap_frequency === "object"
        ? rawGap.gap_frequency
        : {},
    weak_dimensions: Array.isArray(rawGap.weak_dimensions)
      ? rawGap.weak_dimensions
      : [],
    dim_averages:
      rawGap.dim_averages && typeof rawGap.dim_averages === "object"
        ? rawGap.dim_averages
        : {},
  };

  // "" FIX: Redis path reads score_pillars and analytics directly from raw ""
  const scorePillars: ScorePillars = {
    content_score: Number(raw.score_pillars?.content_score ?? overall),
    delivery_score: Number(
      raw.score_pillars?.delivery_score ?? communicationScore
    ),
    confidence_score: Number(
      raw.score_pillars?.confidence_score ?? confidenceScore
    ),
    communication_flow_score: Number(
      raw.score_pillars?.communication_flow_score ?? communicationScore
    ),
  };

  const analytics: SummaryAnalytics = {
    filler_summary:
      raw.analytics?.filler_summary &&
        typeof raw.analytics.filler_summary === "object"
        ? raw.analytics.filler_summary
        : {},
    flow_summary:
      raw.analytics?.flow_summary &&
        typeof raw.analytics.flow_summary === "object"
        ? raw.analytics.flow_summary
        : {},
    confidence_summary:
      raw.analytics?.confidence_summary &&
        typeof raw.analytics.confidence_summary === "object"
        ? raw.analytics.confidence_summary
        : {},
    concept_coverage_trend: Array.isArray(raw.analytics?.concept_coverage_trend)
      ? raw.analytics.concept_coverage_trend
      : [],
  };

  const question_scores: UnifiedInterviewResult["question_scores"] =
    questionScoresRaw.map((q: any) => {
      const idx = Number(q.index ?? 0);
      const replay = replayByIndex.get(idx);
      const verdict = String(q.verdict ?? q.feedback ?? "No feedback available");

      // "" FIX: dimensions now comes from finalize question_scores directly ""
      const dimensions: Record<string, number> =
        q.dimensions && typeof q.dimensions === "object"
          ? q.dimensions
          : replay?.dimensions ?? {};

      return {
        index: idx,
        score: Number(q.score ?? 0),
        difficulty: String(q.difficulty ?? "medium").toLowerCase(),
        question: String(q.question ?? ""),
        user_answer: replay?.user_answer ?? String(q.user_answer ?? ""),
        expected_answer:
          q.expected_answer && typeof q.expected_answer === "object"
            ? q.expected_answer
            : replay?.expected_answer ?? {},
        reference_answer:
          String(q.reference_answer ?? "") ||
          replay?.reference_answer ||
          "",
        verdict,
        feedback: verdict,
        dimensions,
        analytics:
          q.analytics && typeof q.analytics === "object" ? q.analytics : {},
        score_pillars:
          q.score_pillars && typeof q.score_pillars === "object"
            ? q.score_pillars
            : {},
        missing_concepts: Array.isArray(q.missing_concepts)
          ? q.missing_concepts.map(String)
          : [],
        strengths: Array.isArray(q.strengths) ? q.strengths.map(String) : [],
        weaknesses: Array.isArray(q.weaknesses)
          ? q.weaknesses.map(String)
          : [],
        timestamp: Number(replay?.timestamp ?? q.timestamp ?? 0),
      };
    });

  const questions: UnifiedInterviewResult["questions"] = questionScoresRaw.map(
    (q: any) => {
      const idx = Number(q.index ?? 0);
      const replay = replayByIndex.get(idx);
      const dimensions: Record<string, number> =
        q.dimensions && typeof q.dimensions === "object"
          ? q.dimensions
          : replay?.dimensions ?? {};

      return {
        order: idx,
        content: String(q.question ?? ""),
        answer: replay?.user_answer ?? String(q.user_answer ?? ""),
        expected_answer:
          q.expected_answer && typeof q.expected_answer === "object"
            ? q.expected_answer
            : replay?.expected_answer ?? {},
        reference_answer:
          String(q.reference_answer ?? "") ||
          replay?.reference_answer ||
          "",
        difficulty: q.difficulty ? String(q.difficulty).toUpperCase() : null,
        score:
          q.score !== undefined && q.score !== null ? Number(q.score) : null,
        dimensions,
        evaluation: {
          overallScore:
            q.score !== undefined && q.score !== null
              ? Number(q.score)
              : null,
          clarity: Number(dimensions.clarity ?? 0) || null,
          technical:
            Number(dimensions.correctness ?? dimensions.depth ?? 0) || null,
          confidence: Number(q.score_pillars?.confidence_score ?? 0) || null,
          feedback: String(q.verdict ?? q.feedback ?? ""),
          strengths:
            Array.isArray(q.strengths) && q.strengths.length
              ? q.strengths.join(" | ")
              : null,
          improvements:
            Array.isArray(q.weaknesses) && q.weaknesses.length
              ? q.weaknesses.join(" | ")
              : null,
        },
      };
    },
  );

  return {
    role: String(raw.role ?? "Interview"),
    interview_type: String(raw.interview_type ?? "technical"),
    candidate_name: String(raw.candidate_name ?? "Candidate"),
    date_iso: String(raw.date_iso ?? new Date().toISOString()),
    duration_seconds: Number(raw.duration_seconds ?? 0),
    recommendation: String(raw.recommendation ?? "Needs More Evaluation"),
    summary: String(raw.summary ?? "No summary available."),
    strengths,
    weaknesses,
    improvements: weaknesses,
    tips,
    what_went_right: whatWentRight,
    what_went_wrong: whatWentWrong,
    gap_analysis: gapAnalysis,
    score_pillars: scorePillars,
    analytics,
    recovery_score: Number(raw.recovery_score ?? 0),
    pressure_handling_score: Number(raw.pressure_handling_score ?? 0),
    conciseness_score: Number(raw.conciseness_score ?? 0),
    coaching_priorities: Array.isArray(raw.coaching_priorities)
      ? raw.coaching_priorities.map(String)
      : [],
    overall_score: overall,
    skill_scores: skillScores,
    overallScore: overall,
    technicalScore,
    communicationScore,
    problemSolvingScore,
    confidenceScore,
    question_scores,
    questions,
    history,
    final_improvement_plan: {
      top_strengths: strengths.slice(0, 3),
      top_weaknesses: weaknesses.slice(0, 3),
      practice_next: Array.isArray(raw.coaching_priorities)
        ? raw.coaching_priorities.slice(0, 3).map(String)
        : [],
    },
  };
}

// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
// HELPERS
// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
function meanOf(nums: (number | null)[]): number {
  const valid = nums.filter((v): v is number => v !== null);
  return valid.length
    ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
    : 0;
}

function splitPiped(val: string | null): string[] {
  return val
    ? val
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
    : [];
}

// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
// CONTROLLER
// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
export const resumeController = {

  // "" POST /api/process-resume """""""""""""""""""""""""""""""""""""""""""""
  processResume: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id)
        return res.status(401).json({ message: "Unauthorized" });

      const userId = session.user.id;
      const { fileId, S3fileName } = req.body;
      const traceId = randomUUID();
      const jobId = randomUUID();

      if (!fileId || !S3fileName)
        return res
          .status(400)
          .json({ message: "Missing fileId or S3fileName" });

      const job = {
        type: "resume_processing",
        payload: {
          user_id: userId,
          file_id: fileId,
          s3_file_name: S3fileName,
          trace_id: traceId,
        },
        meta: {
          jobId,
          traceId,
          queue: "jobs",
          enqueuedAt: new Date().toISOString(),
        },
      };
      await redisClient.rpush("jobs", JSON.stringify(job));
      await redisClient.set(`resume:file:${fileId}:trace_id`, traceId, "EX", 60 * 60 * 24);
      await logEvent({
        traceId,
        stage: "resume.queue",
        eventType: "resume_processing_queued",
        userId,
        fileId,
        payload: {
          jobId,
          s3FileName: S3fileName,
        },
      });
      console.log("... Job pushed to queue");
      return res.status(200).json({ message: "Job queued successfully", traceId, jobId });
    } catch (error) {
      console.error("Error processing resume:", error);
      return res.status(500).json({ message: "Failed to process resume" });
    }
  },

  // "" GET /api/interview/history """"""""""""""""""""""""""""""""""""""""""""
  interviewHistory: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id)
        return res.status(401).json({ message: "Unauthorized" });

      const userId = session.user.id;

      const interviews = await prisma.interview.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          createdAt: true,
          completedAt: true,
          endReason: true,
          questions: { select: { score: true } },
        },
      });

      const TYPE_LABEL: Record<string, string> = {
        TECHNICAL: "Coding",
        HR: "Behavioral",
        SYSTEM_DESIGN: "System Design",
        BEHAVIORAL: "Behavioral",
      };
      const STATUS_MAP: Record<string, string> = {
        CREATED: "in_progress",
        IN_PROGRESS: "in_progress",
        COMPLETED: "completed",
        CANCELLED: "terminated",
      };

      const result = interviews.map((iv) => {
        const validScores = iv.questions
          .map((q) => q.score)
          .filter((s): s is number => s !== null);
        const score = validScores.length
          ? Math.round(
            validScores.reduce((a, b) => a + b, 0) / validScores.length,
          )
          : null;
        const duration = iv.completedAt
          ? Math.floor(
            (iv.completedAt.getTime() - iv.createdAt.getTime()) / 1000,
          )
          : null;
        const normalizedStatus =
          iv.status === "CREATED" || iv.status === "IN_PROGRESS"
            ? iv.endReason && iv.endReason !== "completed"
              ? "terminated"
              : iv.completedAt
                ? "completed"
                : "in_progress"
            : (STATUS_MAP[iv.status] ?? "in_progress");
        return {
          id: iv.id,
          title: iv.title,
          type: TYPE_LABEL[iv.type] ?? iv.type,
          status: normalizedStatus,
          score,
          date: iv.createdAt.toISOString(),
          duration,
        };
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("[interviewHistory]", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // "" GET /api/interview/:id/results """"""""""""""""""""""""""""""""""""""""
  // """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  // UPDATED: resumeController.interviewFeedback
  // - Enhanced to extract and return analytics from all three data sources
  // - Redis path: analytics from finalize output
  // - InterviewSummary path: analytics from responseAnalyticsMetrics + whyScoreNotHigher
  // - Raw DB path: reconstructed analytics from evaluation data
  // """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

  interviewFeedback: async (req: AuthenticatedRequest, res: Response) => {
    const interviewId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!interviewId)
      return res.status(400).json({ error: "Interview ID is required" });

    const session = req.session;
    if (!session?.user?.id)
      return res.status(401).json({ message: "Unauthorized" });

    const userId = session.user.id;

    try {
      let history: UnifiedInterviewResult["history"] = [];
      try {
        const rawHistory = await redisClient.lrange(
          `user:${userId}:interview_scores`,
          0,
          -1,
        );
        history = rawHistory.map((h: string) => JSON.parse(h));
      } catch {
        history = [];
      }

      // "" 1 REDIS FIRST """""""""""""""""""""""""""""""""""""""""""""""""""
      const redisSummary = await redisClient.get(
        `interview:${interviewId}:summary`,
      );
      if (redisSummary) {
        console.log(`[interviewFeedback] Redis hit for ${interviewId}`);
        const raw = JSON.parse(redisSummary);
        const replaySteps = await redisClient
          .lrange(`interview:${interviewId}:history`, 0, -1)
          .then((rows) =>
            rows
              .map((row) => {
                try {
                  return JSON.parse(row);
                } catch {
                  return null;
                }
              })
              .filter(Boolean),
          );

        // "" FIX: Include analytics in replay steps """"""""""""""""""""""""""
        const replayStepsWithAnalytics = replaySteps.map((step: any) => ({
          ...step,
          user_answer: step.user_answer || "",
          expected_answer: step.expected_answer || {},
          reference_answer: step.reference_answer || "",
          dimensions: step.dimensions || {},
          timestamp: step.timestamp || 0,
          analytics: step.answer_analytics || {}, //  From finalize output
        }));

        return res
          .status(200)
          .json(normalizeRedisSummary(raw, history, replayStepsWithAnalytics));
      }

      // "" 2 InterviewSummary TABLE """""""""""""""""""""""""""""""""""""""""
      const summaryRecord = await prisma.interviewSummary.findUnique({
        where: { interviewId },
        include: {
          interview: {
            select: {
              userId: true,
              title: true,
              type: true,
              createdAt: true,
              completedAt: true,
              questions: {
                orderBy: { order: "asc" },
                select: {
                  order: true,
                  referenceAnswer: true,
                  question: { select: { content: true, difficulty: true } },
                  response: {
                    select: {
                      userAnswer: true,
                      submittedAt: true,
                      evaluation: {
                        select: {
                          dimensions: true,
                          confidence: true,
                          strengths: true,
                          weaknesses: true,
                          verdict: true,
                          feedback: true,
                          missingConcepts: true,
                          // "" FIX: select analytics fields """"""""""""""""""
                          responseAnalyticsMetrics: true,
                          whyScoreNotHigher: true,
                          // """""""""""""""""""""""""""""""""""""""""""""""""""
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (summaryRecord && summaryRecord.interview.userId === userId) {
        console.log(
          `[interviewFeedback] InterviewSummary hit for ${interviewId}`,
        );

        const iv = summaryRecord.interview;
        const summary = summaryRecord;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });

        const TYPE_LABEL: Record<string, string> = {
          TECHNICAL: "Coding",
          HR: "Behavioral",
          SYSTEM_DESIGN: "System Design",
          BEHAVIORAL: "Behavioral",
        };

        const skillScores: Record<string, number> =
          summary.skillScores && typeof summary.skillScores === "object"
            ? (summary.skillScores as Record<string, number>)
            : {};

        const questionScoresRaw: any[] = Array.isArray(summary.questionScores)
          ? summary.questionScores
          : [];

        // "" FIX: Extract analytics from evaluation.responseAnalyticsMetrics ""
        const replayByIndex = new Map(
          (iv.questions ?? []).map((iq) => [
            Number(iq.order ?? 0),
            {
              answer: iq.response?.userAnswer ?? "",
              reference_answer: iq.referenceAnswer ?? "",
              timestamp: iq.response?.submittedAt
                ? Math.floor(iq.response.submittedAt.getTime() / 1000)
                : 0,
              dimensions: (iq.response?.evaluation?.dimensions ??
                {}) as Record<string, number>,
              confidence: iq.response?.evaluation?.confidence ?? null,
              // "" Parse analytics from JSON column """"""""""""""""""""""""""
              analytics: (() => {
                const raw =
                  (iq.response?.evaluation as any)?.responseAnalyticsMetrics;
                if (!raw) return {};
                if (typeof raw === "string") {
                  try {
                    return JSON.parse(raw);
                  } catch {
                    return {};
                  }
                }
                return raw as Record<string, any>;
              })(),
              // """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""
              scorePillars: (() => {
                const raw = (iq.response?.evaluation as any)
                  ?.whyScoreNotHigher;
                if (!raw) return {};
                try {
                  return JSON.parse(raw);
                } catch {
                  return {};
                }
              })(),
            },
          ]),
        );

        const gapRaw: any = summary.gapAnalysis ?? {};

        const contentQualityRaw: any = (() => {
          if (!summary.contentQuality) return {};
          try {
            return JSON.parse(summary.contentQuality);
          } catch {
            return {};
          }
        })();

        const gapAnalysis: GapAnalysis = {
          repeated_gaps: Array.isArray(gapRaw.repeated_gaps)
            ? gapRaw.repeated_gaps
            : [],
          all_gaps: Array.isArray(gapRaw.all_gaps) ? gapRaw.all_gaps : [],
          gap_frequency: gapRaw.gap_frequency ?? {},
          weak_dimensions: Array.isArray(gapRaw.weak_dimensions)
            ? gapRaw.weak_dimensions
            : [],
          dim_averages: gapRaw.dim_averages ?? {},
        };

        const whatWentRightRaw: any[] = Array.isArray(summary.whatWentRight)
          ? summary.whatWentRight
          : [];
        const whatWentWrongRaw: any[] = Array.isArray(summary.whatWentWrong)
          ? summary.whatWentWrong
          : [];

        const whatWentRight: WentPoint[] = whatWentRightRaw.map((w: any) => ({
          point: String(w.point ?? ""),
          tag: String(w.tag ?? "Core"),
        }));
        const whatWentWrong: WentPoint[] = whatWentWrongRaw.map((w: any) => ({
          point: String(w.point ?? ""),
          tag: String(w.tag ?? "Gap"),
        }));

        const strengths = whatWentRight.map((w) => w.point);
        const weaknesses = whatWentWrong.map((w) => w.point);
        const overall = summary.overallScore;

        const technicalScore =
          skillScores["Technical Depth"] ??
          skillScores["Technical"] ??
          0;
        const communicationScore =
          skillScores["Communication"] ?? skillScores["Clarity"] ?? 0;
        const problemSolvingScore =
          skillScores["Problem Solving"] ??
          skillScores["Domain Knowledge"] ??
          overall;
        const confidenceScore =
          skillScores["Confidence"] ?? skillScores["Self-Awareness"] ?? 0;

        // "" FIX: Include analytics in question_scores """"""""""""""""""""""
        const question_scores: UnifiedInterviewResult["question_scores"] =
          questionScoresRaw.map((q: any) => {
            const idx = Number(q.index ?? 0);
            const replay = replayByIndex.get(idx);
            const verdict = String(q.verdict ?? q.feedback ?? "");

            const dimensions: Record<string, number> =
              q.dimensions && typeof q.dimensions === "object"
                ? q.dimensions
                : replay?.dimensions ?? {};

            return {
              index: idx,
              score: Number(q.score ?? 0),
              difficulty: String(q.difficulty ?? "medium").toLowerCase(),
              question: String(q.question ?? ""),
              user_answer: String(
                replay?.answer ?? q.user_answer ?? "",
              ),
              expected_answer:
                q.expected_answer &&
                  typeof q.expected_answer === "object"
                  ? q.expected_answer
                  : {},
              reference_answer:
                String(q.reference_answer ?? "") ||
                String(replay?.reference_answer ?? ""),
              verdict,
              feedback: verdict,
              dimensions,
              // "" FIX: Include full analytics from replay """"""""""""""""""
              analytics: replay?.analytics ?? {},
              // """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
              score_pillars:
                q.score_pillars && typeof q.score_pillars === "object"
                  ? q.score_pillars
                  : replay?.scorePillars ?? {},
              missing_concepts: Array.isArray(q.missing_concepts)
                ? q.missing_concepts.map(String)
                : [],
              strengths: Array.isArray(q.strengths)
                ? q.strengths.map(String)
                : [],
              weaknesses: Array.isArray(q.weaknesses)
                ? q.weaknesses.map(String)
                : [],
              timestamp: Number(
                replay?.timestamp ?? q.timestamp ?? 0,
              ),
            };
          });

        const questions: UnifiedInterviewResult["questions"] =
          questionScoresRaw.map((q: any) => {
            const idx = Number(q.index ?? 0);
            const replay = replayByIndex.get(idx);
            const dimensions: Record<string, number> =
              q.dimensions && typeof q.dimensions === "object"
                ? q.dimensions
                : replay?.dimensions ?? {};

            return {
              order: idx,
              content: String(q.question ?? ""),
              answer: String(replay?.answer ?? q.user_answer ?? ""),
              expected_answer:
                q.expected_answer &&
                  typeof q.expected_answer === "object"
                  ? q.expected_answer
                  : {},
              reference_answer:
                String(q.reference_answer ?? "") ||
                String(replay?.reference_answer ?? ""),
              difficulty: q.difficulty
                ? String(q.difficulty).toUpperCase()
                : null,
              score:
                q.score !== undefined ? Number(q.score) : null,
              dimensions,
              evaluation: {
                overallScore:
                  q.score !== undefined ? Number(q.score) : null,
                clarity:
                  Number(dimensions.clarity ?? 0) || null,
                technical:
                  Number(
                    dimensions.correctness ?? dimensions.depth ?? 0,
                  ) || null,
                confidence:
                  replay?.confidence != null
                    ? Math.round(Number(replay.confidence) * 100)
                    : Number(q.score_pillars?.confidence_score ?? 0) ||
                    null,
                feedback: String(q.verdict ?? q.feedback ?? ""),
                strengths:
                  Array.isArray(q.strengths) && q.strengths.length
                    ? q.strengths.join(" | ")
                    : null,
                improvements:
                  Array.isArray(q.weaknesses) && q.weaknesses.length
                    ? q.weaknesses.join(" | ")
                    : null,
              },
            };
          });

        const payload: UnifiedInterviewResult = {
          role: iv.title,
          interview_type: TYPE_LABEL[iv.type] ?? iv.type,
          candidate_name: user?.name ?? "Candidate",
          date_iso: iv.createdAt.toISOString(),
          duration_seconds: summary.durationSeconds,
          recommendation: summary.recommendation,
          summary: summary.summary ?? "No summary available.",
          strengths,
          weaknesses,
          improvements: weaknesses,
          tips: summary.tips ?? [],
          what_went_right: whatWentRight,
          what_went_wrong: whatWentWrong,
          gap_analysis: gapAnalysis,
          score_pillars: {
            content_score: Number(
              contentQualityRaw?.score_pillars?.content_score ?? overall,
            ),
            delivery_score: Number(
              contentQualityRaw?.score_pillars?.delivery_score ??
              communicationScore,
            ),
            confidence_score: Number(
              contentQualityRaw?.score_pillars?.confidence_score ??
              confidenceScore,
            ),
            communication_flow_score: Number(
              contentQualityRaw?.score_pillars?.communication_flow_score ??
              communicationScore,
            ),
          },
          analytics: {
            filler_summary:
              contentQualityRaw?.analytics?.filler_summary ?? {},
            flow_summary:
              contentQualityRaw?.analytics?.flow_summary ?? {},
            confidence_summary:
              contentQualityRaw?.analytics?.confidence_summary ?? {},
            concept_coverage_trend: Array.isArray(
              contentQualityRaw?.analytics?.concept_coverage_trend,
            )
              ? contentQualityRaw.analytics.concept_coverage_trend
              : [],
          },
          recovery_score: Number(
            contentQualityRaw?.recovery_score ?? 0,
          ),
          pressure_handling_score: Number(
            contentQualityRaw?.pressure_handling_score ?? 0,
          ),
          conciseness_score: Number(
            contentQualityRaw?.conciseness_score ?? 0,
          ),
          coaching_priorities: Array.isArray(
            contentQualityRaw?.coaching_priorities,
          )
            ? contentQualityRaw.coaching_priorities
            : [],
          overall_score: overall,
          skill_scores: skillScores,
          overallScore: overall,
          technicalScore,
          communicationScore,
          problemSolvingScore,
          confidenceScore,
          question_scores,
          questions,
          history,
          final_improvement_plan: {
            top_strengths: strengths.slice(0, 3),
            top_weaknesses: weaknesses.slice(0, 3),
            practice_next: Array.isArray(
              contentQualityRaw?.coaching_priorities,
            )
              ? contentQualityRaw.coaching_priorities.slice(0, 3)
              : [],
          },
        };

        return res.status(200).json(payload);
      }

      // "" 3 RAW DB FALLBACK """"""""""""""""""""""""""""""""""""""""""""""""
      const interview = await prisma.interview.findFirst({
        where: { id: interviewId, userId },
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: {
              question: true,
              response: { include: { evaluation: true } },
            },
          },
        },
      });

      if (!interview)
        return res.status(404).json({ error: "Interview not found" });

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      type Eval = NonNullable<
        NonNullable<(typeof interview.questions)[0]["response"]>["evaluation"]
      >;
      const evals: Eval[] = interview.questions
        .map((iq) => iq.response?.evaluation)
        .filter((e): e is Eval => e != null);

      const overallScore = meanOf(evals.map((e) => e.overallScore));
      const technicalScore = meanOf(evals.map((e) => e.technical));
      const communicationScore = meanOf(evals.map((e) => e.clarity));
      const problemSolvingScore = overallScore;
      const confidenceScore = meanOf(
        evals.map((e) => {
          const raw = (e as any).confidenceScore as number | null;
          return raw !== null ? Math.round(raw * 100) : null;
        }),
      );

      const skill_scores: Record<string, number> = {
        "Technical Depth": technicalScore,
        Communication: communicationScore,
        "Problem Solving": problemSolvingScore,
        Confidence: confidenceScore,
      };

      const strengths = [
        ...new Set(
          evals.flatMap((e) =>
            splitPiped(
              e.strengths?.join ? e.strengths.join("|") : (e.strengths as any),
            ),
          ),
        ),
      ].slice(0, 5);
      const weaknesses = [
        ...new Set(
          evals.flatMap((e) => splitPiped(e.improvements ?? null)),
        ),
      ].slice(0, 5);
      const summaryText =
        evals.find((e) => e.feedback)?.feedback ?? "No summary available.";

      const recommendation =
        overallScore >= 75
          ? "Strong Hire"
          : overallScore >= 60
            ? "Hire"
            : overallScore >= 45
              ? "Leaning No Hire"
              : "No Hire";

      const duration_seconds = interview.completedAt
        ? Math.floor(
          (interview.completedAt.getTime() -
            interview.createdAt.getTime()) /
          1000,
        )
        : 0;

      const TYPE_LABEL: Record<string, string> = {
        TECHNICAL: "Coding",
        HR: "Behavioral",
        SYSTEM_DESIGN: "System Design",
        BEHAVIORAL: "Behavioral",
      };

      // "" FIX: Extract analytics from raw evaluation for fallback path """"""
      const question_scores: UnifiedInterviewResult["question_scores"] =
        interview.questions.map((iq) => {
          const ev = iq.response?.evaluation;
          const verdict = ev?.feedback ?? ev?.verdict ?? "";
          const qStrengths = Array.isArray(ev?.strengths)
            ? ev.strengths
            : splitPiped(null);
          const qWeaknesses = Array.isArray(ev?.weaknesses)
            ? ev.weaknesses
            : splitPiped(ev?.improvements ?? null);

          // "" Parse analytics from responseAnalyticsMetrics """"""""""""""""""
          const analytics = (() => {
            const raw = (ev as any)?.responseAnalyticsMetrics;
            if (!raw) return {};
            if (typeof raw === "string") {
              try {
                return JSON.parse(raw);
              } catch {
                return {};
              }
            }
            return raw as Record<string, any>;
          })();
          // """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

          const scorePillars = (() => {
            const raw = (ev as any)?.whyScoreNotHigher;
            if (!raw) return {};
            try {
              return JSON.parse(raw);
            } catch {
              return {};
            }
          })();

          return {
            index: iq.order ?? 0,
            score: iq.score ?? 0,
            difficulty: (iq.question.difficulty ?? "medium").toLowerCase(),
            question: iq.question.content,
            user_answer: iq.response?.userAnswer ?? "",
            expected_answer: {},
            reference_answer: iq.referenceAnswer ?? "",
            verdict,
            feedback: verdict,
            dimensions: (ev as any)?.dimensions ?? {},
            analytics, //  Now populated
            score_pillars: scorePillars,
            missing_concepts: (ev as any)?.missingConcepts ?? [],
            strengths: qStrengths,
            weaknesses: qWeaknesses,
            timestamp: Math.floor(
              (iq.response?.submittedAt?.getTime() ?? Date.now()) / 1000,
            ),
          };
        });

      const questions: UnifiedInterviewResult["questions"] =
        interview.questions.map((iq) => {
          const ev = iq.response?.evaluation ?? null;
          return {
            order: iq.order,
            content: iq.question.content,
            answer: iq.response?.userAnswer ?? null,
            expected_answer: null,
            reference_answer: iq.referenceAnswer ?? null,
            difficulty: iq.question.difficulty ?? null,
            score: iq.score ?? null,
            dimensions: (ev as any)?.dimensions ?? null,
            evaluation: ev
              ? {
                overallScore: ev.overallScore ?? null,
                clarity: ev.clarity ?? null,
                technical: ev.technical ?? null,
                confidence:
                  (ev as any).confidenceScore !== undefined
                    ? Math.round((ev as any).confidenceScore * 100)
                    : null,
                feedback: ev.feedback ?? ev.verdict ?? null,
                strengths:
                  Array.isArray(ev.strengths) && ev.strengths.length
                    ? ev.strengths.join(" | ")
                    : (ev.strengths as any) ?? null,
                improvements: ev.improvements ?? null,
              }
              : null,
          };
        });

      const payload: UnifiedInterviewResult = {
        role: interview.title,
        interview_type: TYPE_LABEL[interview.type] ?? interview.type,
        candidate_name: user?.name ?? "Candidate",
        date_iso: interview.createdAt.toISOString(),
        duration_seconds,
        recommendation,
        summary: summaryText,
        strengths,
        weaknesses,
        improvements: weaknesses,
        tips: [],
        what_went_right: strengths.map((s) => ({
          point: s,
          tag: "Strength",
        })),
        what_went_wrong: weaknesses.map((w) => ({ point: w, tag: "Gap" })),
        gap_analysis: {
          repeated_gaps: [],
          all_gaps: [],
          gap_frequency: {},
          weak_dimensions: [],
          dim_averages: {},
        },
        score_pillars: {
          content_score: overallScore,
          delivery_score: communicationScore,
          confidence_score: confidenceScore,
          communication_flow_score: communicationScore,
        },
        analytics: {
          filler_summary: {},
          flow_summary: {},
          confidence_summary: {},
          concept_coverage_trend: [],
        },
        recovery_score: 0,
        pressure_handling_score: 0,
        conciseness_score: 0,
        coaching_priorities: [],
        overall_score: overallScore,
        skill_scores,
        overallScore,
        technicalScore,
        communicationScore,
        problemSolvingScore,
        confidenceScore,
        question_scores,
        questions,
        history,
        final_improvement_plan: {
          top_strengths: strengths.slice(0, 3),
          top_weaknesses: weaknesses.slice(0, 3),
          practice_next: [],
        },
      };

      return res.status(200).json(payload);
    } catch (err) {
      console.error("[interviewFeedback]", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  getResumeStatus: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const resume = await prisma.resume.findUnique({
        where: { userId: session.user.id },
        include: { file: true, insights: true },
      });

      if (!resume || !resume.file) {
        return res.status(200).json({
          resumeUploaded: false,
          debug: "No resume or file in DB",
        });
      }

      return res.status(200).json({
        resumeUploaded: true,
        resumeUrl: resume.file.url || resume.file.S3FileName,
        resumeFileName: resume.file.OriginalFileName,
        fileStatus: resume.file.status,
        insights: resume.insights
          ? {
            experienceLevel: resume.insights.experienceLevel,
            keySkills: resume.insights.keySkills,
            ATSSCORE: resume.insights.ATSSCORE,
            strongDomains: resume.insights.strongDomains,
            weakAreas: resume.insights.weakAreas,
          }
          : null,
      });
    } catch (error) {
      console.error("[getResumeStatus]", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // "" POST /api/interview/:id/complete """""""""""""""""""""""""""""""""""""
  storeNeon: async (req: AuthenticatedRequest, res: Response) => {
    const interviewId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!interviewId) {
      res.status(400).json({ error: "Interview ID is required" });
      return;
    }

    try {
      const traceId =
        (await redisClient.get(`interview:${interviewId}:trace_id`)) ??
        randomUUID();
      await logEvent({
        traceId,
        stage: "interview.persistence",
        eventType: "summary_persist_started",
        interviewId,
      });
      // "" 1. Load summary from Redis """""""""""""""""""""""""""""""""""""""
      const rawSummary = await redisClient.get(
        `interview:${interviewId}:summary`,
      );
      if (!rawSummary) {
        res.status(404).json({
          error:
            "Summary not found in Redis. Interview may not be complete yet.",
        });
        return;
      }
      const summary = JSON.parse(rawSummary);

      const whatWentRight = Array.isArray(summary.what_went_right)
        ? summary.what_went_right
          .filter((w: any) => typeof w === "object" && w.point)
          .map((w: any) => ({
            point: String(w.point || ""),
            tag: String(w.tag || "General"),
          }))
        : [];

      const whatWentWrong = Array.isArray(summary.what_went_wrong)
        ? summary.what_went_wrong
          .filter((w: any) => typeof w === "object" && w.point)
          .map((w: any) => ({
            point: String(w.point || ""),
            tag: String(w.tag || "Gap"),
          }))
        : [];

      // "" FIX: store gapAnalysis clean, move extras to contentQuality """"""
      const persistedGapAnalysis = summary.gap_analysis ?? {};

      // "" FIX: contentQuality carries score_pillars, analytics, and other
      //         summary-level fields that don't fit other columns """"""""""""
      const persistedContentQuality = JSON.stringify({
        score_pillars: summary.score_pillars ?? {},
        analytics: summary.analytics ?? {},
        recovery_score: summary.recovery_score ?? 0,
        pressure_handling_score: summary.pressure_handling_score ?? 0,
        conciseness_score: summary.conciseness_score ?? 0,
        coaching_priorities: summary.coaching_priorities ?? [],
      });

      // "" 2. Load full question history from Redis """""""""""""""""""""""""
      const rawHistory = await redisClient.lrange(
        `interview:${interviewId}:history`,
        0,
        -1,
      );

      type HistoryStep = {
        followup: boolean;
        followup_question: null;
        index: number;
        question: string;
        expected_answer: Record<string, unknown> | null;
        reference_answer: string;
        user_answer: string;
        score: number;
        confidence: number;
        feedback: string;
        verdict: string;
        difficulty: string;
        timestamp: number;
        dimensions: Record<string, number>;
        missing_concepts: string[];
        incorrect_points: string[];
        strengths: string[];
        weaknesses: string[];
        answer_analytics: Record<string, unknown>;
        score_pillars: {
          content_score: number;
          delivery_score: number;
          confidence_score: number;
          communication_flow_score: number;
        };
        intent?: string;
        is_non_answer?: boolean;
      };

      const history: HistoryStep[] = rawHistory.map((h: string) =>
        JSON.parse(h),
      );

      if (history.length === 0) {
        res
          .status(400)
          .json({ error: "No question history found in Redis." });
        return;
      }

      // "" 3. Load Interview row """"""""""""""""""""""""""""""""""""""""""""
      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
      });
      if (!interview) {
        res.status(404).json({
          error: `Interview ${interviewId} not found in database.`,
        });
        return;
      }

      if (interview.status === "COMPLETED") {
        res.json({
          success: true,
          message: "Already persisted",
          interviewId,
        });
        return;
      }

      // "" 4. Read integrity fields from Redis """"""""""""""""""""""""""""""
      const _redisInt = async (
        key: string,
        fallback = 0,
      ): Promise<number> => {
        const raw = await redisClient.get(key);
        if (!raw) return fallback;
        const n = parseInt(
          typeof raw === "string" ? raw : JSON.stringify(raw),
          10,
        );
        return isNaN(n) ? fallback : n;
      };
      const _redisStr = async (
        key: string,
        fallback = "",
      ): Promise<string> => {
        const raw = await redisClient.get(key);
        if (!raw) return fallback;
        return typeof raw === "string" ? raw : JSON.stringify(raw);
      };

      const interruptionCount = await _redisInt(
        `interview:${interviewId}:interruptions`,
        summary.interruption_count ?? 0,
      );
      const endReason = await _redisStr(
        `interview:${interviewId}:end_reason`,
        summary.end_reason ?? "completed",
      );
      const sessionDurationSec = await _redisInt(
        `interview:${interviewId}:duration_sec`,
        summary.duration_seconds ?? 0,
      );
      const tabSwitches = await _redisInt(
        `interview:${interviewId}:tab_switches`,
        0,
      );
      const fsExits = await _redisInt(
        `interview:${interviewId}:fs_exits`,
        0,
      );
      const isEarlyExit = endReason !== "completed";

      console.log(
        `[storeNeon] integrity " endReason=${endReason} interruptions=${interruptionCount} ` +
        `tabs=${tabSwitches} fs=${fsExits} duration=${sessionDurationSec}s`,
      );

      // "" 5. Main transaction """"""""""""""""""""""""""""""""""""""""""""""
      await prisma.$transaction(async (tx) => {
        // "" 5a. Per-question rows """"""""""""""""""""""""""""""""""""""""
        for (const step of history) {
          const questionId = `${interviewId}-q${step.index}`;
          const score100 = Math.round((step.score ?? 0) * 10);
          const dims = step.dimensions ?? {};

          const question = await tx.question.upsert({
            where: { id: questionId },
            update: {
              content: step.question,
              difficulty: mapDifficulty(step.difficulty),
              type: interview.type,
            },
            create: {
              id: questionId,
              content: step.question,
              difficulty: mapDifficulty(step.difficulty),
              type: interview.type,
            },
          });

          const interviewQuestion = await tx.interviewQuestion.upsert({
            where: {
              interviewId_questionId: {
                interviewId,
                questionId: question.id,
              },
            },
            update: {
              score: score100,
              order: step.index,
              referenceAnswer: step.reference_answer ?? null,
            },
            create: {
              interviewId,
              questionId: question.id,
              score: score100,
              order: step.index,
              referenceAnswer: step.reference_answer ?? null,
            },
          });

          const response = await tx.response.upsert({
            where: { interviewQuestionId: interviewQuestion.id },
            update: {
              userAnswer: step.user_answer ?? "",
              submittedAt: step.timestamp
                ? new Date(step.timestamp * 1000)
                : new Date(),
            },
            create: {
              interviewQuestionId: interviewQuestion.id,
              userAnswer: step.user_answer ?? "",
              submittedAt: step.timestamp
                ? new Date(step.timestamp * 1000)
                : new Date(),
            },
          });

          const isNonAnswer = !!(
            step.is_non_answer ||
            (step.score === 0 && step.intent)
          );

          await tx.evaluation.upsert({
            where: { responseId: response.id },
            update: {
              overallScore: score100,
              overallScore100: score100,
              confidence: step.confidence ?? null,
              dimensions:
                dims && Object.keys(dims).length > 0 ? dims : undefined,
              missingConcepts: step.missing_concepts ?? [],
              incorrectPoints: step.incorrect_points ?? [],
              strengths: step.strengths ?? [],
              weaknesses: step.weaknesses ?? [],
              verdict: step.verdict ?? step.feedback ?? "",
              feedback: step.verdict ?? step.feedback ?? "",
              clarity: dims["clarity"] ?? dims["star_structure"] ?? null,
              technical:
                dims["correctness"] ?? dims["depth"] ?? null,
              followup: step.followup ?? false,
              followupQuestion: step.followup_question ?? null,
              isNonAnswer: isNonAnswer ?? false,
              nonAnswerIntent: step.intent ?? null,
              // "" FIX: persist audio analytics and score pillars """"""""""
              responseAnalyticsMetrics: JSON.stringify(step.answer_analytics ?? {}),
              whyScoreNotHigher: step.score_pillars
                ? JSON.stringify(step.score_pillars)
                : null,
              // """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""
            },
            create: {
              responseId: response.id,
              overallScore: score100,
              overallScore100: score100,
              confidence: step.confidence ?? null,
              dimensions: dims,
              missingConcepts: step.missing_concepts ?? [],
              incorrectPoints: step.incorrect_points ?? [],
              strengths: step.strengths ?? [],
              weaknesses: step.weaknesses ?? [],
              verdict: step.verdict ?? step.feedback ?? "",
              feedback: step.verdict ?? step.feedback ?? "",
              clarity: dims["clarity"] ?? dims["star_structure"] ?? null,
              technical:
                dims["correctness"] ?? dims["depth"] ?? null,
              followup: step?.followup ?? false,
              followupQuestion: step?.followup_question ?? null,
              isNonAnswer: isNonAnswer ?? false,
              nonAnswerIntent: step.intent ?? null,
              // "" FIX: persist audio analytics and score pillars """"""""""
              responseAnalyticsMetrics: JSON.stringify(step.answer_analytics ?? {}),
              whyScoreNotHigher: step.score_pillars
                ? JSON.stringify(step.score_pillars)
                : null,
              // """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""
            },
          });
        }

        // "" 5b. InterviewSummary """""""""""""""""""""""""""""""""""""""""
        await tx.interviewSummary.upsert({
          where: { interviewId },
          update: {
            overallScore: summary.overall_score ?? 0,
            plainAvg: summary.plain_avg ?? 0,
            weightedAvg: summary.weighted_avg ?? 0,
            recommendation:
              summary.recommendation ?? "Needs More Evaluation",
            durationSeconds: summary.duration_seconds ?? 0,
            summary: summary.summary ?? "",
            whatWentRight: whatWentRight,
            whatWentWrong: whatWentWrong,
            tips: summary.tips ?? [],
            skillScores:
              summary.skill_scores &&
                typeof summary.skill_scores === "object"
                ? summary.skill_scores
                : {},
            questionScores: summary.question_scores ?? [],
            // "" FIX: clean gapAnalysis " no more buried _fields """"""""""
            gapAnalysis: persistedGapAnalysis,
            // "" FIX: contentQuality carries score_pillars + analytics """""
            contentQuality: persistedContentQuality,
            // """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
            deliveryQuality: summary.delivery_quality ?? null,
            interviewIntegrity: summary.interview_integrity ?? null,
            endReason: endReason,
            isEarlyExit: isEarlyExit,
            interruptionCount: interruptionCount,
          },
          create: {
            interviewId,
            overallScore: summary.overall_score ?? 0,
            plainAvg: summary.plain_avg ?? 0,
            weightedAvg: summary.weighted_avg ?? 0,
            recommendation:
              summary.recommendation ?? "Needs More Evaluation",
            durationSeconds: summary.duration_seconds ?? 0,
            summary: summary.summary ?? "",
            whatWentRight: whatWentRight,
            whatWentWrong: whatWentWrong,
            tips: summary.tips ?? [],
            skillScores:
              summary.skill_scores &&
                typeof summary.skill_scores === "object"
                ? summary.skill_scores
                : {},
            questionScores: summary.question_scores ?? [],
            gapAnalysis: persistedGapAnalysis,
            contentQuality: persistedContentQuality,
            deliveryQuality: summary.delivery_quality ?? null,
            interviewIntegrity: summary.interview_integrity ?? null,
            endReason: endReason,
            isEarlyExit: isEarlyExit,
            interruptionCount: interruptionCount,
          },
        });

        // "" 5c. Mark interview completed """""""""""""""""""""""""""""""""
        const finalInterviewStatus =
          summary.end_reason && summary.end_reason !== "completed"
            ? "CANCELLED"
            : interview.status === "CANCELLED"
              ? "CANCELLED"
              : "COMPLETED";

        await tx.interview.update({
          where: { id: interviewId },
          data: {
            status: finalInterviewStatus,
            completedAt: interview.completedAt ?? new Date(),
            endReason: endReason,
            interruptionCount: interruptionCount,
            sessionDurationSec: sessionDurationSec,
            tabSwitches: tabSwitches,
            fsExits: fsExits,
          },
        });
      });

      // "" 6. GapReport upsert """"""""""""""""""""""""""""""""""""""""""""""
      try {
        const gapAnalysis = summary.gap_analysis ?? {};
        const newFreq = (gapAnalysis.gap_frequency ?? {}) as Record<
          string,
          number
        >;
        const newDimAvgs = (gapAnalysis.dim_averages ?? {}) as Record<
          string,
          number
        >;

        const existing = await prisma.gapReport.findUnique({
          where: { userId: interview.userId },
        });

        const mergedFreq: Record<string, number> = {
          ...((existing?.conceptFrequency as Record<string, number>) ?? {}),
        };
        for (const [concept, count] of Object.entries(newFreq)) {
          mergedFreq[concept] = (mergedFreq[concept] ?? 0) + count;
        }

        const persistentGaps = Object.entries(mergedFreq)
          .filter(([, c]) => c >= 2)
          .sort(([, a], [, b]) => b - a)
          .map(([k]) => k);

        const existingDimAvgs =
          (existing?.dimensionAverages as Record<string, number>) ?? {};
        const mergedDimAvgs: Record<string, number> = { ...existingDimAvgs };
        for (const [dim, avg] of Object.entries(newDimAvgs)) {
          if (existingDimAvgs[dim] !== undefined) {
            mergedDimAvgs[dim] = parseFloat(
              (existingDimAvgs[dim] * 0.7 + avg * 0.3).toFixed(2),
            );
          } else {
            mergedDimAvgs[dim] = avg;
          }
        }

        await prisma.gapReport.upsert({
          where: { userId: interview.userId },
          update: {
            conceptFrequency: mergedFreq,
            persistentGaps,
            dimensionAverages: mergedDimAvgs,
            lastUpdatedAt: new Date(),
          },
          create: {
            userId: interview.userId,
            conceptFrequency: mergedFreq,
            persistentGaps,
            dimensionAverages: mergedDimAvgs,
            lastUpdatedAt: new Date(),
          },
        });

        console.log(
          `[storeNeon] GapReport updated " ${persistentGaps.length} persistent gaps`,
        );
      } catch (gapErr: any) {
        console.error(
          "[storeNeon] GapReport upsert failed:",
          gapErr.message,
        );
      }

      // "" 7. Save score to Redis score-history """""""""""""""""""""""""""""
      try {
        const historyKey = `user:${interview.userId}:interview_scores`;
        const existingScores = await redisClient.lrange(historyKey, 0, -1);
        const alreadySaved = existingScores.some((e: string) => {
          try {
            return JSON.parse(e).interview_id === interviewId;
          } catch {
            return false;
          }
        });

        if (!alreadySaved) {
          await redisClient.rpush(
            historyKey,
            JSON.stringify({
              interview_id: interviewId,
              score: summary.overall_score,
              role: summary.role,
              date_iso: summary.date_iso,
              recommendation: summary.recommendation,
            }),
          );
        }
      } catch (scoreHistErr: any) {
        console.error(
          "[storeNeon] Score history push failed:",
          scoreHistErr.message,
        );
      }

      // "" 8. Cleanup Redis keys """""""""""""""""""""""""""""""""""""""""""""
      await Promise.all([
        redisClient.del(`interview:${interviewId}:summary`),
        redisClient.del(`interview:${interviewId}:history`),
        redisClient.del(`interview:${interviewId}:current_question`),
        redisClient.del(`interview:${interviewId}:latest_answer`),
        redisClient.del(`interview:${interviewId}:interruptions`),
        redisClient.del(`interview:${interviewId}:end_reason`),
        redisClient.del(`interview:${interviewId}:duration_sec`),
        redisClient.del(`interview:${interviewId}:tab_switches`),
        redisClient.del(`interview:${interviewId}:fs_exits`),
        redisClient.del(`interview:${interviewId}:ended`),
      ]);

      console.log(
        `[storeNeon] Interview ${interviewId} persisted ... ` +
        `(${history.length} questions, score=${summary.overall_score}/100, ` +
        `endReason=${endReason}, interruptions=${interruptionCount})`,
      );
      await logEvent({
        traceId,
        stage: "interview.persistence",
        eventType: "summary_persist_completed",
        userId: interview.userId,
        interviewId,
        payload: {
          questionsStored: history.length,
          overallScore: summary.overall_score,
          recommendation: summary.recommendation,
        },
      });

      res.json({
        success: true,
        interviewId,
        questionsStored: history.length,
        overallScore: summary.overall_score,
        recommendation: summary.recommendation,
      });
    } catch (err: any) {
      console.error("[storeNeon] Error:", err);
      res.status(500).json({
        error: "Failed to persist interview",
        details: err.message,
      });
    }
  },

  // "" POST /api/start-interview """""""""""""""""""""""""""""""""""""""""""""
  startInterview: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id)
        return res.status(401).json({ message: "Unauthorized" });

      const userId = session.user.id;
      const {
        interviewTitle,
        interviewType,
        description = "",
        difficulty = "medium",
        questionCount = 10,
        topics = [],
      } = req.body;

      if (!interviewTitle?.trim() || !interviewType)
        return res
          .status(400)
          .json({ message: "Title and type are required" });

      const interview = await prisma.interview.create({
        data: {
          title: interviewTitle.trim(),
          type: interviewType,
          userId,
          status: "CREATED",
        },
      });

      await redisClient.set(
        `interview:${interview.id}:user_id`,
        userId,
        "EX",
        60 * 60 * 24,
      );

      const job = {
        type: "interview_creation",
        payload: {
          interview_id: interview.id,
          user_id: userId,
          role: interviewTitle.trim(),
          interview_type: interviewType.toLowerCase(),
          description,
          difficulty: difficulty.toLowerCase(),
          max_questions: Math.max(3, Math.min(15, Number(questionCount))),
          topics: Array.isArray(topics) ? topics : [],
        },
        meta: { enqueuedAt: new Date().toISOString() },
      };

      await redisClient.rpush("jobs", JSON.stringify(job));
      console.log(`... Interview job queued " id=${interview.id}`);
      return res
        .status(201)
        .json({ message: "Interview Created", data: interview });
    } catch (error) {
      console.error("[startInterview] Error:", error);
      return res
        .status(500)
        .json({ message: "Failed to create interview" });
    }
  },

  // "" GET /api/skills-insights """"""""""""""""""""""""""""""""""""""""""""""
  getSkillsInsights: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id)
        return res.status(401).json({ message: "Unauthorized" });
      const userId = session.user.id;

      const userSkills = await prisma.userSkill.findMany({
        where: { userId },
        include: { skill: true },
      });

      const interviews = await prisma.interview.findMany({
        where: { userId, status: "COMPLETED" },
        include: {
          questions: {
            include: {
              question: true,
              response: { include: { evaluation: true } },
            },
          },
        },
      });

      const resume = await prisma.resume.findUnique({
        where: { userId },
        include: { insights: true },
      });

      const categoryScores: Record<string, number[]> = {};
      for (const interview of interviews) {
        const type = interview.type;
        for (const iq of interview.questions) {
          const score =
            iq.score ?? iq.response?.evaluation?.overallScore ?? null;
          if (score !== null) {
            if (!categoryScores[type]) categoryScores[type] = [];
            categoryScores[type].push(score);
          }
        }
      }

      const categoryAverages: Record<string, number> = {};
      for (const [cat, scores] of Object.entries(categoryScores)) {
        categoryAverages[cat] = Math.round(
          scores.reduce((a, b) => a + b, 0) / scores.length,
        );
      }

      const sortedCategories = Object.entries(categoryAverages).sort(
        (a, b) => b[1] - a[1],
      );
      const strongest = sortedCategories[0] ?? null;
      const weakest =
        sortedCategories[sortedCategories.length - 1] ?? null;

      const allScores = Object.values(categoryScores).flat();
      const overallAvg = allScores.length
        ? Math.round(
          allScores.reduce((a, b) => a + b, 0) / allScores.length,
        )
        : null;

      const coveredTypes = new Set(interviews.map((iv) => iv.type));
      const weakAreas: string[] = resume?.insights?.weakAreas ?? [];

      const TYPE_LABEL: Record<string, string> = {
        TECHNICAL: "Technical",
        HR: "HR / Behavioral",
        SYSTEM_DESIGN: "System Design",
        BEHAVIORAL: "Behavioral",
      };
      const uncoveredTypes = (
        ["TECHNICAL", "HR", "SYSTEM_DESIGN", "BEHAVIORAL"] as const
      )
        .filter((t) => !coveredTypes.has(t))
        .map((t) => TYPE_LABEL[t]);

      const upcomingSkills = [
        ...weakAreas,
        ...uncoveredTypes.map((t) => `Practice ${t} interviews`),
      ].slice(0, 6);

      return res.status(200).json({
        skills: userSkills.map((us) => ({
          id: us.skill.id,
          name: us.skill.name,
          category: us.skill.category ?? "Other",
        })),
        strongest: strongest
          ? {
            label: TYPE_LABEL[strongest[0]] ?? strongest[0],
            score: strongest[1],
          }
          : null,
        weakest: weakest
          ? {
            label: TYPE_LABEL[weakest[0]] ?? weakest[0],
            score: weakest[1],
          }
          : null,
        overallAvg,
        categoryAverages: Object.fromEntries(
          Object.entries(categoryAverages).map(([k, v]) => [
            TYPE_LABEL[k] ?? k,
            v,
          ]),
        ),
        upcomingSkills,
        totalInterviews: interviews.length,
        interviewsCovered: [...coveredTypes].map(
          (t) => TYPE_LABEL[t] ?? t,
        ),
      });
    } catch (error) {
      console.error("[getSkillsInsights]", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  generateInterviewPlan: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id)
        return res.status(401).json({ message: "Unauthorized" });
      const userId = session.user.id;
      const {
        interviewType,
        description = "",
        difficulty = "medium",
        numQuestions = 10,
        targetRole,
        duration,
      } = req.body;

      if (!interviewType || !targetRole?.trim() || !numQuestions || !duration) {
        return res
          .status(400)
          .json({ message: "Missing required fields" });
      }

      const job = {
        type: "plan_generation",
        payload: {
          role: targetRole.trim(),
          interview_type: interviewType.toLowerCase(),
          duration,
          difficulty: difficulty.toLowerCase(),
          max_questions: Number(numQuestions),
        },
        meta: { enqueuedAt: new Date().toISOString() },
      };

      await redisClient.rpush("jobs", JSON.stringify(job));
      console.log(`... Generate Plan Queued " id=${userId}`);
      return res.status(201).json({ message: "Plan Generated" });
    } catch (error) {
      console.error("[generateInterviewPlan] Error:", error);
      return res
        .status(500)
        .json({ message: "Failed to create plan" });
    }
  },
};

// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
// UTILITY
// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
function mapDifficulty(d: string): "EASY" | "MEDIUM" | "HARD" | null {
  switch ((d ?? "").toLowerCase()) {
    case "intro":
    case "easy":
      return "EASY";
    case "medium":
      return "MEDIUM";
    case "hard":
      return "HARD";
    default:
      return null;
  }
}
