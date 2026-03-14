import { Response } from "express";
import { redisClient } from "../config/redis.config.js";
import { AuthenticatedRequest } from "../types/auth-request.js";
import { prisma } from "@repo/db/prisma-db";

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED RESPONSE SHAPE
//
// This single interface satisfies both consumers of GET /api/interview/:id/results:
//
//   1. FeedbackPage   — reads snake_case fields:
//        overall_score, skill_scores, question_scores, weaknesses, role,
//        interview_type, candidate_name, date_iso, duration_seconds,
//        recommendation, tips, history
//
//   2. HistoryPage drawer — reads camelCase fields:
//        overallScore, technicalScore, communicationScore, problemSolvingScore,
//        confidenceScore, improvements, questions
//
// Both sets are populated by every code path so neither page ever sees undefined.
// ─────────────────────────────────────────────────────────────────────────────
interface UnifiedInterviewResult {
  // ── Metadata ──────────────────────────────────────────────────────────────
  role:             string;
  interview_type:   string;
  candidate_name:   string;
  date_iso:         string;
  duration_seconds: number;
  recommendation:   string;

  // ── Narrative ─────────────────────────────────────────────────────────────
  summary:     string;
  strengths:   string[];
  weaknesses:  string[];   // FeedbackPage reads this key
  improvements:string[];   // HistoryPage drawer reads this key  (= weaknesses)
  tips:        string[];

  // ── Scores — snake_case (FeedbackPage) ────────────────────────────────────
  overall_score: number;
  skill_scores:  Record<string, number>;

  // ── Scores — camelCase (HistoryPage drawer) ───────────────────────────────
  overallScore:        number;   // = overall_score
  technicalScore:      number;
  communicationScore:  number;
  problemSolvingScore: number;
  confidenceScore:     number;

  // ── Questions — FeedbackPage format ──────────────────────────────────────
  question_scores: {
    index:      number;
    score:      number;       // 0-100
    difficulty: string;
    question:   string;
    feedback:   string;
    timestamp:  number;
  }[];

  // ── Questions — HistoryPage drawer format ─────────────────────────────────
  questions: {
    order:      number | null;
    content:    string;
    difficulty: string | null;
    score:      number | null;
    evaluation: {
      overallScore:  number | null;
      clarity:       number | null;
      technical:     number | null;
      confidence:    number | null;
      feedback:      string | null;
      strengths:     string | null;
      improvements:  string | null;
    } | null;
  }[];

  // ── Session history (FeedbackPage score-history chart) ────────────────────
  history: {
    interview_id: string;
    score:        number;
    role:         string;
    date_iso:     string;
  }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALISER — Python worker Redis payload → UnifiedInterviewResult
//
// The Python `finalize` node stores snake_case keys.  Map them here so both
// page shapes are populated from a single code path.
// ─────────────────────────────────────────────────────────────────────────────
function normalizeRedisSummary(
  raw: any,
  history: UnifiedInterviewResult["history"],
): UnifiedInterviewResult {
  const skillScores: Record<string, number> = raw.skill_scores ?? {};
  const questionScoresRaw: any[]            = raw.question_scores ?? [];

  const overall = raw.overall_score ?? 0;

  // Derive the four camelCase score fields from skill_scores where possible
  const technicalScore      = skillScores["Technical Depth"]  ?? skillScores["Technical"]   ?? 0;
  const communicationScore  = skillScores["Communication"]    ?? skillScores["Clarity"]      ?? 0;
  const problemSolvingScore = skillScores["Problem Solving"]  ?? overall;
  const confidenceScore     = skillScores["Confidence"]       ?? 0;

  const strengths   = Array.isArray(raw.strengths)  ? raw.strengths  : [];
  const weaknesses  = Array.isArray(raw.weaknesses) ? raw.weaknesses : [];
  const tips        = Array.isArray(raw.tips)       ? raw.tips       : [];

  // Build the FeedbackPage question_scores array
  const question_scores: UnifiedInterviewResult["question_scores"] = questionScoresRaw.map(
    (q: any) => ({
      index:      q.index      ?? 0,
      score:      q.score      ?? 0,
      difficulty: (q.difficulty ?? "medium").toLowerCase(),
      question:   q.question   ?? "",
      feedback:   q.feedback   ?? "",
      timestamp:  q.timestamp  ?? 0,
    }),
  );

  // Build the HistoryPage `questions` array from the same source
  const questions: UnifiedInterviewResult["questions"] = questionScoresRaw.map((q: any) => ({
    order:      q.index   ?? null,
    content:    q.question ?? "",
    difficulty: q.difficulty ? q.difficulty.toUpperCase() : null,
    score:      q.score   ?? null,
    evaluation: {
      overallScore:  q.score    ?? null,
      clarity:       null,
      technical:     null,
      confidence:    null,
      feedback:      q.feedback ?? null,
      strengths:     null,
      improvements:  null,
    },
  }));

  return {
    // Metadata
    role:             raw.role            ?? "Interview",
    interview_type:   raw.interview_type  ?? "technical",
    candidate_name:   raw.candidate_name  ?? "Candidate",
    date_iso:         raw.date_iso        ?? new Date().toISOString(),
    duration_seconds: raw.duration_seconds ?? 0,
    recommendation:   raw.recommendation  ?? "Needs More Evaluation",

    // Narrative
    summary:      raw.summary ?? "No summary available.",
    strengths,
    weaknesses,      // FeedbackPage key
    improvements: weaknesses, // HistoryPage key (same data)
    tips,

    // Scores — snake_case
    overall_score: overall,
    skill_scores:  skillScores,

    // Scores — camelCase
    overallScore:        overall,
    technicalScore,
    communicationScore,
    problemSolvingScore,
    confidenceScore,

    // Questions
    question_scores,
    questions,

    // History
    history,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — mean of nullable numbers
// ─────────────────────────────────────────────────────────────────────────────
function meanOf(nums: (number | null)[]): number {
  const valid = nums.filter((v): v is number => v !== null);
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
}

function splitPiped(val: string | null): string[] {
  return val ? val.split("|").map((s) => s.trim()).filter(Boolean) : [];
}

// ─────────────────────────────────────────────────────────────────────────────
export const resumeController = {

  // ── POST /api/process-resume ─────────────────────────────────────────────
  processResume: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id) return res.status(401).json({ message: "Unauthorized" });

      const userId = session.user.id;
      const { fileId, S3fileName } = req.body;

      if (!fileId || !S3fileName)
        return res.status(400).json({ message: "Missing fileId or S3fileName" });

      const job = {
        type: "resume_processing",
        payload: { user_id: userId, file_id: fileId, s3_file_name: S3fileName },
        meta: { enqueuedAt: new Date() },
      };
      await redisClient.rpush("jobs", JSON.stringify(job));
      console.log("✅ Job pushed to queue");
      return res.status(200).json({ message: "Job queued successfully" });
    } catch (error) {
      console.error("Error processing resume:", error);
      return res.status(500).json({ message: "Failed to process resume" });
    }
  },

  // ── GET /api/interview/history ────────────────────────────────────────────
  // ⚠️  Must be registered BEFORE /interview/:id/results in the router to
  //     prevent Express treating "history" as the :id param.
  interviewHistory: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id) return res.status(401).json({ message: "Unauthorized" });

      const userId = session.user.id;

      const interviews = await prisma.interview.findMany({
        where:   { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, title: true, type: true, status: true,
          createdAt: true, completedAt: true,
          questions: { select: { score: true } },
        },
      });

      const TYPE_LABEL: Record<string, string> = {
        TECHNICAL:    "Coding",
        HR:           "Behavioral",
        SYSTEM_DESIGN:"System Design",
        BEHAVIORAL:   "Behavioral",
      };
      const STATUS_MAP: Record<string, string> = {
        CREATED:     "in_progress",
        IN_PROGRESS: "in_progress",
        COMPLETED:   "completed",
        CANCELLED:   "terminated",
      };

      const result = interviews.map((iv) => {
        const validScores = iv.questions.map((q) => q.score).filter((s): s is number => s !== null);
        const score = validScores.length
          ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
          : null;
        const duration = iv.completedAt
          ? Math.floor((iv.completedAt.getTime() - iv.createdAt.getTime()) / 1000)
          : null;
        return {
          id:       iv.id,
          title:    iv.title,
          type:     TYPE_LABEL[iv.type] ?? iv.type,
          status:   STATUS_MAP[iv.status] ?? "in_progress",
          score,
          date:     iv.createdAt.toISOString(),
          duration,
        };
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("[interviewHistory]", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // ── GET /api/interview/:id/results ────────────────────────────────────────
  // Returns UnifiedInterviewResult — satisfies both FeedbackPage and
  // HistoryPage drawer with a single endpoint and no per-consumer branching.
  interviewFeedback: async (req: AuthenticatedRequest, res: Response) => {
    const interviewId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!interviewId) return res.status(400).json({ error: "Interview ID is required" });

    const session = req.session;
    if (!session?.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const userId = session.user.id;

    try {
      // ── Fetch session history from Redis (used by both paths below) ───────
      let history: UnifiedInterviewResult["history"] = [];
      try {
        const rawHistory = await redisClient.lrange(`user:${userId}:interview_scores`, 0, -1);
        history = rawHistory.map((h: string) => JSON.parse(h));
      } catch {
        history = [];
      }

      // ── 1️⃣ REDIS FIRST — Python worker summary ────────────────────────────
      const redisSummary = await redisClient.get(`interview:${interviewId}:summary`);
      if (redisSummary) {
        console.log(`[interviewFeedback] Redis hit for ${interviewId}`);
        const raw = JSON.parse(redisSummary);
        return res.status(200).json(normalizeRedisSummary(raw, history));
      }

      // ── 2️⃣ DATABASE FALLBACK ─────────────────────────────────────────────
      const interview = await prisma.interview.findFirst({
        where:   { id: interviewId, userId },
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

      if (!interview) return res.status(404).json({ error: "Interview not found" });

      const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { name: true },
      });

      type Eval = NonNullable<
        NonNullable<typeof interview.questions[0]["response"]>["evaluation"]
      >;
      const evals: Eval[] = interview.questions
        .map((iq) => iq.response?.evaluation)
        .filter((e): e is Eval => e != null);

      // ── Aggregate scores ────────────────────────────────────────────────
      const overallScore        = meanOf(evals.map((e) => e.overallScore));
      const technicalScore      = meanOf(evals.map((e) => e.technical));
      const communicationScore  = meanOf(evals.map((e) => e.clarity));
      const problemSolvingScore = overallScore; // no dedicated DB column
      const confidenceScore     = meanOf(
        evals.map((e) => {
          const raw = (e as any).confidenceScore as number | null;
          return raw !== null ? Math.round(raw * 100) : null;
        }),
      );

      const skill_scores: Record<string, number> = {
        "Technical Depth": technicalScore,
        "Communication":   communicationScore,
        "Problem Solving": problemSolvingScore,
        "Confidence":      confidenceScore,
      };

      // ── Narrative arrays ────────────────────────────────────────────────
      const strengths   = [...new Set(evals.flatMap((e) => splitPiped(e.strengths)))].slice(0, 5);
      const weaknesses  = [...new Set(evals.flatMap((e) => splitPiped(e.improvements)))].slice(0, 5);
      const summary     = evals.find((e) => e.feedback)?.feedback ?? "No summary available.";

      // ── Recommendation ──────────────────────────────────────────────────
      const recommendation =
        overallScore >= 75 ? "Strong Hire" :
        overallScore >= 60 ? "Hire"        :
        overallScore >= 45 ? "Leaning No Hire" : "No Hire";

      // ── Duration ────────────────────────────────────────────────────────
      const duration_seconds = interview.completedAt
        ? Math.floor((interview.completedAt.getTime() - interview.createdAt.getTime()) / 1000)
        : 0;

      // ── TYPE label (DB stores enum, frontend wants human label) ─────────
      const TYPE_LABEL: Record<string, string> = {
        TECHNICAL:    "Coding",
        HR:           "Behavioral",
        SYSTEM_DESIGN:"System Design",
        BEHAVIORAL:   "Behavioral",
      };

      // ── Build question_scores (FeedbackPage format) ─────────────────────
      const question_scores: UnifiedInterviewResult["question_scores"] = interview.questions.map(
        (iq) => ({
          index:      iq.order ?? 0,
          score:      iq.score ?? 0,
          difficulty: (iq.question.difficulty ?? "medium").toLowerCase(),
          question:   iq.question.content,
          feedback:   iq.response?.evaluation?.feedback ?? "",
          timestamp:  Math.floor((iq.response?.submittedAt?.getTime() ?? Date.now()) / 1000),
        }),
      );

      // ── Build questions (HistoryPage drawer format) ──────────────────────
      const questions: UnifiedInterviewResult["questions"] = interview.questions.map((iq) => {
        const ev = iq.response?.evaluation ?? null;
        return {
          order:      iq.order,
          content:    iq.question.content,
          difficulty: iq.question.difficulty ?? null,
          score:      iq.score ?? null,
          evaluation: ev
            ? {
                overallScore: ev.overallScore  ?? null,
                clarity:      ev.clarity       ?? null,
                technical:    ev.technical     ?? null,
                confidence:   (ev as any).confidenceScore !== undefined
                  ? Math.round((ev as any).confidenceScore * 100)
                  : null,
                feedback:     ev.feedback      ?? null,
                strengths:    ev.strengths     ?? null,
                improvements: ev.improvements  ?? null,
              }
            : null,
        };
      });

      const payload: UnifiedInterviewResult = {
        // Metadata
        role:             interview.title,
        interview_type:   TYPE_LABEL[interview.type] ?? interview.type,
        candidate_name:   user?.name ?? "Candidate",
        date_iso:         interview.createdAt.toISOString(),
        duration_seconds,
        recommendation,

        // Narrative
        summary,
        strengths,
        weaknesses,
        improvements: weaknesses,
        tips: [],     // DB path has no tips column — always empty array

        // Scores — snake_case (FeedbackPage)
        overall_score: overallScore,
        skill_scores,

        // Scores — camelCase (HistoryPage)
        overallScore,
        technicalScore,
        communicationScore,
        problemSolvingScore,
        confidenceScore,

        // Questions — both formats
        question_scores,
        questions,

        // History
        history,
      };

      return res.status(200).json(payload);
    } catch (err) {
      console.error("[interviewFeedback]", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  },

  // ── GET /api/get-resume ───────────────────────────────────────────────────
  getResumeStatus: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id) return res.status(401).json({ message: "Unauthorized" });

      const user = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { isResumeUploaded: true },
      });
      if (!user) return res.status(404).json({ message: "User not found" });

      return res.status(200).json({ resumeUploaded: user.isResumeUploaded });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // ── POST /api/interview/:id/complete ─────────────────────────────────────
  storeNeon: async (req: AuthenticatedRequest, res: Response) => {
    const interviewId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!interviewId) { res.status(400).json({ error: "Interview ID is required" }); return; }

    try {
      
      const rawSummary = await redisClient.get(`interview:${interviewId}:summary`);
      if (!rawSummary) {
        res.status(404).json({ error: "Summary not found in Redis. Interview may not be complete yet." });
        return;
      }
      const summary = JSON.parse(rawSummary);

      const rawHistory = await redisClient.lrange(`interview:${interviewId}:history`, 0, -1);

      type HistoryStep = {
        index: number; question: string; answer: string;
        score: number; confidence: number; feedback: string;
        difficulty: string; followup: boolean; timestamp: number;
      };
      const history: HistoryStep[] = rawHistory.map((h: string) => JSON.parse(h));

      if (history.length === 0) {
        res.status(400).json({ error: "No question history found in Redis." });
        return;
      }

      const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
      if (!interview) {
        res.status(404).json({ error: `Interview ${interviewId} not found in database.` });
        return;
      }

      if (interview.status === "COMPLETED") {
        res.json({ success: true, message: "Already persisted", interviewId });
        return;
      }
      
      await prisma.$transaction(async (tx) => {
        for (const step of history) {
          const questionId = `${interviewId}-q${step.index}`;

          const question = await tx.question.upsert({
            where:  { id: questionId },
            update: {},
            create: {
              id: questionId, content: step.question,
              difficulty: mapDifficulty(step.difficulty), type: interview.type,
            },
          });

          const interviewQuestion = await tx.interviewQuestion.upsert({
            where:  { interviewId_questionId: { interviewId, questionId: question.id } },
            update: { score: Math.round(step.score * 10), order: step.index },
            create: { interviewId, questionId: question.id, score: Math.round(step.score * 10), order: step.index },
          });

          const response = await tx.response.upsert({
            where:  { interviewQuestionId: interviewQuestion.id },
            update: { submittedAt: step.timestamp ? new Date(step.timestamp * 1000) : new Date() },
            create: { interviewQuestionId: interviewQuestion.id, submittedAt: step.timestamp ? new Date(step.timestamp * 1000) : new Date() },
          });

          await tx.evaluation.upsert({
            where: { responseId: response.id },
            update: {
              overallScore:    Math.round(step.score * 10),
              confidenceScore: step.confidence,
              feedback:        step.feedback ?? "",
              clarity:         summary.skill_scores?.["Clarity"]         ?? null,
              technical:       summary.skill_scores?.["Technical Depth"] ?? null,
              confidence:      summary.skill_scores?.["Confidence"]      ?? null,
              strengths:       summary.strengths?.join(" | ")  ?? null,
              improvements:    summary.weaknesses?.join(" | ") ?? null,
            },
            create: {
              responseId:      response.id,
              overallScore:    Math.round(step.score * 10),
              confidenceScore: step.confidence,
              feedback:        step.feedback ?? "",
              clarity:         summary.skill_scores?.["Clarity"]         ?? null,
              technical:       summary.skill_scores?.["Technical Depth"] ?? null,
              confidence:      summary.skill_scores?.["Confidence"]      ?? null,
              strengths:       summary.strengths?.join(" | ")  ?? null,
              improvements:    summary.weaknesses?.join(" | ") ?? null,
            },
          });
        }

        await tx.interview.update({
          where: { id: interviewId },
          data:  { status: "COMPLETED", completedAt: new Date() },
        });
      });

      // Save score to Redis history list
      const historyKey     = `user:${interview.userId}:interview_scores`;
      const existingScores = await redisClient.lrange(historyKey, 0, -1);
      const alreadySaved   = existingScores.some((e: string) => {
        try { return JSON.parse(e).interview_id === interviewId; } catch { return false; }
      });
      if (!alreadySaved) {
        await redisClient.rpush(historyKey, JSON.stringify({
          interview_id: interviewId,
          score:        summary.overall_score,
          role:         summary.role,
          date_iso:     summary.date_iso,
        }));
      }

      await Promise.all([
        redisClient.del(`interview:${interviewId}:summary`),
        redisClient.del(`interview:${interviewId}:history`),
        redisClient.del(`interview:${interviewId}:current_question`),
        redisClient.del(`interview:${interviewId}:latest_answer`),
      ]);

      console.log(`[storeNeon] Interview ${interviewId} persisted ✅ (${history.length} questions)`);
      res.json({ success: true, interviewId, questionsStored: history.length });
    } catch (err: any) {
      console.error("[storeNeon] Error:", err);
      res.status(500).json({ error: "Failed to persist interview", details: err.message });
    }
  },

  // ── POST /api/start-interview ─────────────────────────────────────────────
  startInterview: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id) return res.status(401).json({ message: "Unauthorized" });

      const userId = session.user.id;
      const {
        interviewTitle, interviewType,
        description   = "",
        difficulty    = "medium",
        questionCount = 10,
        topics        = [],
      } = req.body;

      if (!interviewTitle?.trim() || !interviewType)
        return res.status(400).json({ message: "Title and type are required" });

      const interview = await prisma.interview.create({
        data: { title: interviewTitle.trim(), type: interviewType, userId, status: "CREATED" },
      });

      await redisClient.set(`interview:${interview.id}:user_id`, userId, "EX", 60 * 60 * 24);

      const job = {
        type: "interview_creation",
        payload: {
          interview_id:   interview.id,
          user_id:        userId,
          role:           interviewTitle.trim(),
          interview_type: interviewType.toLowerCase(),
          description,
          difficulty:     difficulty.toLowerCase(),
          max_questions:  Math.max(3, Math.min(15, Number(questionCount))),
          topics:         Array.isArray(topics) ? topics : [],
        },
        meta: { enqueuedAt: new Date().toISOString() },
      };

      await redisClient.rpush("jobs", JSON.stringify(job));
      console.log(`✅ Interview job queued — id=${interview.id}`);
      return res.status(201).json({ message: "Interview Created", data: interview });
    } catch (error) {
      console.error("[startInterview] Error:", error);
      return res.status(500).json({ message: "Failed to create interview" });
    }
  },
};

function mapDifficulty(d: string): "EASY" | "MEDIUM" | "HARD" | null {
  switch (d.toLowerCase()) {
    case "intro":
    case "easy":   return "EASY";
    case "medium": return "MEDIUM";
    case "hard":   return "HARD";
    default:       return null;
  }
}