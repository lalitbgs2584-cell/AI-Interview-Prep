import { Response } from "express";
import { redisClient } from "../config/redis.config.js";
import { AuthenticatedRequest } from "../types/auth-request.js";
import { prisma } from "@repo/db/prisma-db";

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED RESPONSE SHAPE
//
// Single interface satisfying both consumers of GET /api/interview/:id/results:
//
//   1. FeedbackPage   — reads snake_case fields:
//        overall_score, skill_scores, question_scores, weaknesses, role,
//        interview_type, candidate_name, date_iso, duration_seconds,
//        recommendation, tips, history, what_went_right, what_went_wrong,
//        gap_analysis
//
//   2. HistoryPage drawer — reads camelCase fields:
//        overallScore, technicalScore, communicationScore, problemSolvingScore,
//        confidenceScore, improvements, questions
// ─────────────────────────────────────────────────────────────────────────────

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

interface UnifiedInterviewResult {
  // ── Metadata ──────────────────────────────────────────────────────────────
  role: string;
  interview_type: string;
  candidate_name: string;
  date_iso: string;
  duration_seconds: number;
  recommendation: string;

  // ── Narrative ─────────────────────────────────────────────────────────────
  summary: string;
  strengths: string[];      // backward-compat — mirrors what_went_right points
  weaknesses: string[];     // backward-compat — mirrors what_went_wrong points (FeedbackPage)
  improvements: string[];   // HistoryPage drawer alias of weaknesses
  tips: string[];

  // ── Rich feedback (from Python finalize node) ─────────────────────────────
  what_went_right: WentPoint[];   // [{ point, tag }]
  what_went_wrong: WentPoint[];   // [{ point, tag }]

  // ── Gap analysis (deterministic, from finalize node) ──────────────────────
  gap_analysis: GapAnalysis;

  // ── Scores — snake_case (FeedbackPage) ────────────────────────────────────
  overall_score: number;
  skill_scores: Record<string, number>;

  // ── Scores — camelCase (HistoryPage drawer) ───────────────────────────────
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  problemSolvingScore: number;
  confidenceScore: number;

  // ── Questions — FeedbackPage format ──────────────────────────────────────
  // score here is 0-100 (finalize node already multiplies by 10)
  question_scores: {
    index: number;
    score: number;         // 0-100
    difficulty: string;
    question: string;
    verdict: string;       // primary — from LLM narration
    feedback: string;      // alias of verdict for backward-compat
    missing_concepts: string[];
    strengths: string[];
    weaknesses: string[];
    timestamp: number;
  }[];

  // ── Questions — HistoryPage drawer format ─────────────────────────────────
  questions: {
    order: number | null;
    content: string;
    difficulty: string | null;
    score: number | null;
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

  // ── Session history (FeedbackPage score-history chart) ────────────────────
  history: {
    interview_id: string;
    score: number;
    role: string;
    date_iso: string;
  }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALISER — Python finalize node Redis payload → UnifiedInterviewResult
//
// The Python finalize node stores snake_case keys.
// question_scores from finalize already have score 0-100 (raw_score * 10).
// ─────────────────────────────────────────────────────────────────────────────
function normalizeRedisSummary(
  raw: any,
  history: UnifiedInterviewResult["history"],
): UnifiedInterviewResult {
  const skillScores: Record<string, number> = raw.skill_scores ?? {};

  // question_scores from finalize node: score is already 0-100
  const questionScoresRaw: any[] = raw.question_scores ?? [];

  const overall = raw.overall_score ?? 0;

  // Derive camelCase score fields from skill_scores (populated by finalize node)
  const technicalScore =
    skillScores["Technical Depth"] ?? skillScores["Technical"] ?? skillScores["Correctness"] ?? 0;
  const communicationScore =
    skillScores["Communication"] ?? skillScores["Clarity"] ?? 0;
  const problemSolvingScore =
    skillScores["Problem Solving"] ?? skillScores["Domain Knowledge"] ?? overall;
  const confidenceScore =
    skillScores["Confidence"] ?? skillScores["Self-Awareness"] ?? 0;

  // what_went_right / what_went_wrong come as [{point, tag}] from finalize
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

  // Backward-compat flat arrays (also accept legacy flat string arrays)
  const strengths: string[] = Array.isArray(raw.strengths)
    ? raw.strengths.map(String)
    : whatWentRight.map((w) => w.point);

  const weaknesses: string[] = Array.isArray(raw.weaknesses)
    ? raw.weaknesses.map(String)
    : whatWentWrong.map((w) => w.point);

  const tips: string[] = Array.isArray(raw.tips) ? raw.tips.map(String) : [];

  // Gap analysis — fully deterministic from finalize node
  const rawGap = raw.gap_analysis ?? {};
  const gapAnalysis: GapAnalysis = {
    repeated_gaps:   Array.isArray(rawGap.repeated_gaps) ? rawGap.repeated_gaps : [],
    all_gaps:        Array.isArray(rawGap.all_gaps) ? rawGap.all_gaps : [],
    gap_frequency:   rawGap.gap_frequency && typeof rawGap.gap_frequency === "object"
      ? rawGap.gap_frequency
      : {},
    weak_dimensions: Array.isArray(rawGap.weak_dimensions) ? rawGap.weak_dimensions : [],
    dim_averages:    rawGap.dim_averages && typeof rawGap.dim_averages === "object"
      ? rawGap.dim_averages
      : {},
  };

  // Build FeedbackPage question_scores — finalize already outputs 0-100 scores
  const question_scores: UnifiedInterviewResult["question_scores"] = questionScoresRaw.map(
    (q: any) => {
      const verdict = String(q.verdict ?? q.feedback ?? "No feedback available");
      return {
        index:            Number(q.index ?? 0),
        score:            Number(q.score ?? 0),           // 0-100 from finalize
        difficulty:       String(q.difficulty ?? "medium").toLowerCase(),
        question:         String(q.question ?? ""),
        verdict,
        feedback:         verdict,                         // alias
        missing_concepts: Array.isArray(q.missing_concepts) ? q.missing_concepts.map(String) : [],
        strengths:        Array.isArray(q.strengths) ? q.strengths.map(String) : [],
        weaknesses:       Array.isArray(q.weaknesses) ? q.weaknesses.map(String) : [],
        timestamp:        Number(q.timestamp ?? 0),
      };
    },
  );

  // Build HistoryPage questions array from same source
  const questions: UnifiedInterviewResult["questions"] = questionScoresRaw.map((q: any) => ({
    order:      Number(q.index ?? 0),
    content:    String(q.question ?? ""),
    difficulty: q.difficulty ? String(q.difficulty).toUpperCase() : null,
    score:      q.score !== undefined && q.score !== null ? Number(q.score) : null,
    evaluation: {
      overallScore: q.score !== undefined && q.score !== null ? Number(q.score) : null,
      clarity:      null,
      technical:    null,
      confidence:   null,
      feedback:     String(q.verdict ?? q.feedback ?? ""),
      strengths:    Array.isArray(q.strengths) && q.strengths.length
        ? q.strengths.join(" | ")
        : null,
      improvements: Array.isArray(q.weaknesses) && q.weaknesses.length
        ? q.weaknesses.join(" | ")
        : null,
    },
  }));

  return {
    // Metadata
    role:             String(raw.role ?? "Interview"),
    interview_type:   String(raw.interview_type ?? "technical"),
    candidate_name:   String(raw.candidate_name ?? "Candidate"),
    date_iso:         String(raw.date_iso ?? new Date().toISOString()),
    duration_seconds: Number(raw.duration_seconds ?? 0),
    recommendation:   String(raw.recommendation ?? "Needs More Evaluation"),

    // Narrative
    summary:        String(raw.summary ?? "No summary available."),
    strengths,
    weaknesses,
    improvements:   weaknesses,
    tips,

    // Rich feedback
    what_went_right: whatWentRight,
    what_went_wrong: whatWentWrong,

    // Gap analysis
    gap_analysis: gapAnalysis,

    // Scores — snake_case
    overall_score: overall,
    skill_scores:  skillScores,

    // Scores — camelCase
    overallScore:         overall,
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
// HELPERS
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
  // ⚠️  Must be registered BEFORE /interview/:id/results in the router.
  interviewHistory: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id) return res.status(401).json({ message: "Unauthorized" });

      const userId = session.user.id;

      const interviews = await prisma.interview.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, title: true, type: true, status: true,
          createdAt: true, completedAt: true,
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
        const validScores = iv.questions.map((q) => q.score).filter((s): s is number => s !== null);
        const score = validScores.length
          ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
          : null;
        const duration = iv.completedAt
          ? Math.floor((iv.completedAt.getTime() - iv.createdAt.getTime()) / 1000)
          : null;
        return {
          id: iv.id,
          title: iv.title,
          type: TYPE_LABEL[iv.type] ?? iv.type,
          status: STATUS_MAP[iv.status] ?? "in_progress",
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

  // ── GET /api/interview/:id/results ────────────────────────────────────────
  // Returns UnifiedInterviewResult — satisfies both FeedbackPage and
  // HistoryPage drawer with a single endpoint.
  //
  // Priority: 1️⃣ Redis (Python finalize summary) → 2️⃣ DB (InterviewSummary) → 3️⃣ DB fallback
  interviewFeedback: async (req: AuthenticatedRequest, res: Response) => {
    const interviewId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!interviewId) return res.status(400).json({ error: "Interview ID is required" });

    const session = req.session;
    if (!session?.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const userId = session.user.id;

    try {
      // ── Fetch session history from Redis ──────────────────────────────────
      let history: UnifiedInterviewResult["history"] = [];
      try {
        const rawHistory = await redisClient.lrange(`user:${userId}:interview_scores`, 0, -1);
        history = rawHistory.map((h: string) => JSON.parse(h));
      } catch {
        history = [];
      }

      // ── 1️⃣ REDIS FIRST — Python finalize summary ─────────────────────────
      const redisSummary = await redisClient.get(`interview:${interviewId}:summary`);
      if (redisSummary) {
        console.log(`[interviewFeedback] Redis hit for ${interviewId}`);
        const raw = JSON.parse(redisSummary);
        return res.status(200).json(normalizeRedisSummary(raw, history));
      }

      // ── 2️⃣ InterviewSummary TABLE (persisted after storeNeon) ─────────────
      // This is the richest DB source — mirrors the finalize node output exactly.
      const summaryRecord = await prisma.interviewSummary.findUnique({
        where: { interviewId },
        include: { interview: { select: { userId: true, title: true, type: true, createdAt: true, completedAt: true } } },
      });

      if (summaryRecord && summaryRecord.interview.userId === userId) {
        console.log(`[interviewFeedback] InterviewSummary hit for ${interviewId}`);

        const iv      = summaryRecord.interview;
        const summary = summaryRecord;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });

        const TYPE_LABEL: Record<string, string> = {
          TECHNICAL: "Coding", HR: "Behavioral",
          SYSTEM_DESIGN: "System Design", BEHAVIORAL: "Behavioral",
        };

        const skillScores: Record<string, number> =
          summary.skillScores && typeof summary.skillScores === "object"
            ? (summary.skillScores as Record<string, number>)
            : {};

        const questionScoresRaw: any[] = Array.isArray(summary.questionScores)
          ? summary.questionScores
          : [];

        const gapRaw: any = summary.gapAnalysis ?? {};
        const gapAnalysis: GapAnalysis = {
          repeated_gaps:   Array.isArray(gapRaw.repeated_gaps) ? gapRaw.repeated_gaps : [],
          all_gaps:        Array.isArray(gapRaw.all_gaps) ? gapRaw.all_gaps : [],
          gap_frequency:   gapRaw.gap_frequency ?? {},
          weak_dimensions: Array.isArray(gapRaw.weak_dimensions) ? gapRaw.weak_dimensions : [],
          dim_averages:    gapRaw.dim_averages ?? {},
        };

        const whatWentRightRaw: any[] = Array.isArray(summary.whatWentRight)
          ? summary.whatWentRight
          : [];
        const whatWentWrongRaw: any[] = Array.isArray(summary.whatWentWrong)
          ? summary.whatWentWrong
          : [];

        const whatWentRight: WentPoint[] = whatWentRightRaw.map((w: any) => ({
          point: String(w.point ?? ""),
          tag:   String(w.tag ?? "Core"),
        }));
        const whatWentWrong: WentPoint[] = whatWentWrongRaw.map((w: any) => ({
          point: String(w.point ?? ""),
          tag:   String(w.tag ?? "Gap"),
        }));

        const strengths  = whatWentRight.map((w) => w.point);
        const weaknesses = whatWentWrong.map((w) => w.point);

        const overall = summary.overallScore;

        const technicalScore     = skillScores["Technical Depth"] ?? skillScores["Technical"] ?? 0;
        const communicationScore = skillScores["Communication"] ?? skillScores["Clarity"] ?? 0;
        const problemSolvingScore = skillScores["Problem Solving"] ?? skillScores["Domain Knowledge"] ?? overall;
        const confidenceScore    = skillScores["Confidence"] ?? skillScores["Self-Awareness"] ?? 0;

        // question_scores — InterviewSummary stores them as 0-100 already
        const question_scores: UnifiedInterviewResult["question_scores"] = questionScoresRaw.map(
          (q: any) => {
            const verdict = String(q.verdict ?? q.feedback ?? "");
            return {
              index:            Number(q.index ?? 0),
              score:            Number(q.score ?? 0),
              difficulty:       String(q.difficulty ?? "medium").toLowerCase(),
              question:         String(q.question ?? ""),
              verdict,
              feedback:         verdict,
              missing_concepts: Array.isArray(q.missing_concepts) ? q.missing_concepts.map(String) : [],
              strengths:        Array.isArray(q.strengths) ? q.strengths.map(String) : [],
              weaknesses:       Array.isArray(q.weaknesses) ? q.weaknesses.map(String) : [],
              timestamp:        Number(q.timestamp ?? 0),
            };
          },
        );

        const questions: UnifiedInterviewResult["questions"] = questionScoresRaw.map((q: any) => ({
          order:      Number(q.index ?? 0),
          content:    String(q.question ?? ""),
          difficulty: q.difficulty ? String(q.difficulty).toUpperCase() : null,
          score:      q.score !== undefined ? Number(q.score) : null,
          evaluation: {
            overallScore: q.score !== undefined ? Number(q.score) : null,
            clarity:      null,
            technical:    null,
            confidence:   null,
            feedback:     String(q.verdict ?? q.feedback ?? ""),
            strengths:    Array.isArray(q.strengths) && q.strengths.length
              ? q.strengths.join(" | ") : null,
            improvements: Array.isArray(q.weaknesses) && q.weaknesses.length
              ? q.weaknesses.join(" | ") : null,
          },
        }));

        const payload: UnifiedInterviewResult = {
          role:             iv.title,
          interview_type:   TYPE_LABEL[iv.type] ?? iv.type,
          candidate_name:   user?.name ?? "Candidate",
          date_iso:         iv.createdAt.toISOString(),
          duration_seconds: summary.durationSeconds,
          recommendation:   summary.recommendation,
          summary:          summary.summary ?? "No summary available.",
          strengths,
          weaknesses,
          improvements:     weaknesses,
          tips:             summary.tips ?? [],
          what_went_right:  whatWentRight,
          what_went_wrong:  whatWentWrong,
          gap_analysis:     gapAnalysis,
          overall_score:    overall,
          skill_scores:     skillScores,
          overallScore:     overall,
          technicalScore,
          communicationScore,
          problemSolvingScore,
          confidenceScore,
          question_scores,
          questions,
          history,
        };

        return res.status(200).json(payload);
      }

      // ── 3️⃣ RAW DB FALLBACK (InterviewQuestion evaluations) ───────────────
      // Used only when InterviewSummary hasn't been persisted yet.
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

      if (!interview) return res.status(404).json({ error: "Interview not found" });

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      type Eval = NonNullable<
        NonNullable<typeof interview.questions[0]["response"]>["evaluation"]
      >;
      const evals: Eval[] = interview.questions
        .map((iq) => iq.response?.evaluation)
        .filter((e): e is Eval => e != null);

      // Aggregate scores from DB evaluations
      const overallScore        = meanOf(evals.map((e) => e.overallScore));
      const technicalScore      = meanOf(evals.map((e) => e.technical));
      const communicationScore  = meanOf(evals.map((e) => e.clarity));
      const problemSolvingScore = overallScore;
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

      // Aggregate strengths/weaknesses from piped strings in Evaluation
      const strengths  = [...new Set(evals.flatMap((e) => splitPiped(e.strengths?.join ? e.strengths.join("|") : (e.strengths as any))))].slice(0, 5);
      const weaknesses = [...new Set(evals.flatMap((e) => splitPiped(e.improvements ?? null)))].slice(0, 5);
      const summaryText = evals.find((e) => e.feedback)?.feedback ?? "No summary available.";

      const recommendation =
        overallScore >= 75 ? "Strong Hire" :
          overallScore >= 60 ? "Hire" :
            overallScore >= 45 ? "Leaning No Hire" : "No Hire";

      const duration_seconds = interview.completedAt
        ? Math.floor((interview.completedAt.getTime() - interview.createdAt.getTime()) / 1000)
        : 0;

      const TYPE_LABEL: Record<string, string> = {
        TECHNICAL: "Coding", HR: "Behavioral",
        SYSTEM_DESIGN: "System Design", BEHAVIORAL: "Behavioral",
      };

      // question_scores — DB stores score as 0-100 in InterviewQuestion.score
      const question_scores: UnifiedInterviewResult["question_scores"] = interview.questions.map(
        (iq) => {
          const ev = iq.response?.evaluation;
          const verdict = ev?.feedback ?? ev?.verdict ?? "";
          const qStrengths  = Array.isArray(ev?.strengths)  ? ev.strengths  : splitPiped(null);
          const qWeaknesses = Array.isArray(ev?.weaknesses) ? ev.weaknesses : splitPiped(ev?.improvements ?? null);
          return {
            index:            iq.order ?? 0,
            score:            iq.score ?? 0,                 // 0-100 from DB
            difficulty:       (iq.question.difficulty ?? "medium").toLowerCase(),
            question:         iq.question.content,
            verdict,
            feedback:         verdict,
            missing_concepts: (ev as any)?.missingConcepts ?? [],
            strengths:        qStrengths,
            weaknesses:       qWeaknesses,
            timestamp:        Math.floor((iq.response?.submittedAt?.getTime() ?? Date.now()) / 1000),
          };
        },
      );

      const questions: UnifiedInterviewResult["questions"] = interview.questions.map((iq) => {
        const ev = iq.response?.evaluation ?? null;
        return {
          order:      iq.order,
          content:    iq.question.content,
          difficulty: iq.question.difficulty ?? null,
          score:      iq.score ?? null,
          evaluation: ev
            ? {
                overallScore: ev.overallScore ?? null,
                clarity:      ev.clarity ?? null,
                technical:    ev.technical ?? null,
                confidence:   (ev as any).confidenceScore !== undefined
                  ? Math.round((ev as any).confidenceScore * 100)
                  : null,
                feedback:     ev.feedback ?? ev.verdict ?? null,
                strengths:    Array.isArray(ev.strengths) && ev.strengths.length
                  ? ev.strengths.join(" | ") : (ev.strengths as any) ?? null,
                improvements: ev.improvements ?? null,
              }
            : null,
        };
      });

      const payload: UnifiedInterviewResult = {
        role:             interview.title,
        interview_type:   TYPE_LABEL[interview.type] ?? interview.type,
        candidate_name:   user?.name ?? "Candidate",
        date_iso:         interview.createdAt.toISOString(),
        duration_seconds,
        recommendation,
        summary:          summaryText,
        strengths,
        weaknesses,
        improvements:     weaknesses,
        tips:             [],
        what_went_right:  strengths.map((s) => ({ point: s, tag: "Strength" })),
        what_went_wrong:  weaknesses.map((w) => ({ point: w, tag: "Gap" })),
        gap_analysis: {
          repeated_gaps:   [],
          all_gaps:        [],
          gap_frequency:   {},
          weak_dimensions: [],
          dim_averages:    {},
        },
        overall_score:    overallScore,
        skill_scores,
        overallScore,
        technicalScore,
        communicationScore,
        problemSolvingScore,
        confidenceScore,
        question_scores,
        questions,
        history,
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
      console.log("Get resume route started.");

      const resume = await prisma.resume.findUnique({
        where: { userId: session.user.id },
        include: {
          file: true,
          insights: true,
        },
      });

      console.log("DEBUG - Resume found:", !!resume);

      if (!resume || !resume.file) {
        return res.status(200).json({
          resumeUploaded: false,
          debug: "No resume or file in DB",
        });
      }

      return res.status(200).json({
        resumeUploaded:   true,
        resumeUrl:        resume.file.url || resume.file.S3FileName,
        resumeFileName:   resume.file.OriginalFileName,
        fileStatus:       resume.file.status,
        insights: resume.insights
          ? {
              experienceLevel: resume.insights.experienceLevel,
              keySkills:       resume.insights.keySkills,
              ATSSCORE:        resume.insights.ATSSCORE,
              strongDomains:   resume.insights.strongDomains,
              weakAreas:       resume.insights.weakAreas,
            }
          : null,
      });
    } catch (error) {
      console.error("[getResumeStatus]", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // ── POST /api/interview/:id/complete ─────────────────────────────────────
  // Reads the full finalize payload from Redis and persists to:
  //   - InterviewQuestion / Response / Evaluation (per-question)
  //   - InterviewSummary (full rich summary incl. what_went_right/wrong, gap_analysis)
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
        index: number;
        question: string;
        user_answer: string;
        score: number;             // 0-10 from evaluate_answer
        confidence: number;
        feedback: string;
        verdict: string;
        difficulty: string;
        followup: boolean;
        timestamp: number;
        dimensions: Record<string, number>;
        missing_concepts: string[];
        incorrect_points: string[];
        strengths: string[];
        weaknesses: string[];
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
      console.log("Interview status is :",interview.status)

      if (interview.status === "COMPLETED") {
        res.json({ success: true, message: "Already persisted", interviewId });
        return;
      }
      
      await prisma.$transaction(async (tx) => {
        // ── Per-question rows ─────────────────────────────────────────────
        for (const step of history) {
          const questionId = `${interviewId}-q${step.index}`;

          const question = await tx.question.upsert({
            where: { id: questionId },
            update: {},
            create: {
              id:         questionId,
              content:    step.question,
              difficulty: mapDifficulty(step.difficulty),
              type:       interview.type,
            },
          });

          // score stored on InterviewQuestion is 0-100
          // step.score is 0-10 from evaluate_answer, finalize multiplies by 10
          const score100 = Math.round(step.score * 10);

          const interviewQuestion = await tx.interviewQuestion.upsert({
            where:  { interviewId_questionId: { interviewId, questionId: question.id } },
            update: { score: score100, order: step.index },
            create: { interviewId, questionId: question.id, score: score100, order: step.index },
          });

          const response = await tx.response.upsert({
            where:  { interviewQuestionId: interviewQuestion.id },
            update: {
              userAnswer:  step.user_answer ?? "",
              submittedAt: step.timestamp ? new Date(step.timestamp * 1000) : new Date(),
            },
            create: {
              interviewQuestionId: interviewQuestion.id,
              userAnswer:          step.user_answer ?? "",
              submittedAt:         step.timestamp ? new Date(step.timestamp * 1000) : new Date(),
            },
          });

          // Dimensions from evaluate_answer node
          const dims = step.dimensions ?? {};

          await tx.evaluation.upsert({
            where:  { responseId: response.id },
            update: {
              overallScore:     score100,
              overallScore100:  score100,
              confidence:  step.confidence ?? null,
              dimensions:       dims,
              missingConcepts:  step.missing_concepts ?? [],
              incorrectPoints:  step.incorrect_points ?? [],
              strengths:        step.strengths ?? [],
              weaknesses:       step.weaknesses ?? [],
              verdict:          step.verdict ?? step.feedback ?? "",
              feedback:         step.verdict ?? step.feedback ?? "",
              clarity:          dims["clarity"]   ?? dims["star_structure"]  ?? null,
              technical:        dims["correctness"] ?? dims["depth"]          ?? null,
              followup:         step.followup ?? false,
            },
            create: {
              responseId:       response.id,
              overallScore:     score100,
              overallScore100:  score100,
              confidence:  step.confidence ?? null,
              dimensions:       dims,
              missingConcepts:  step.missing_concepts ?? [],
              incorrectPoints:  step.incorrect_points ?? [],
              strengths:        step.strengths ?? [],
              weaknesses:       step.weaknesses ?? [],
              verdict:          step.verdict ?? step.feedback ?? "",
              feedback:         step.verdict ?? step.feedback ?? "",
              clarity:          dims["clarity"]   ?? dims["star_structure"]  ?? null,
              technical:        dims["correctness"] ?? dims["depth"]          ?? null,
              followup:         step.followup ?? false,
            },
          });
        }

        // ── InterviewSummary — stores rich finalize output ────────────────
        // This is the primary source for future GET /results DB reads.
        await tx.interviewSummary.upsert({
          where:  { interviewId },
          update: {
            overallScore:    summary.overall_score ?? 0,
            plainAvg:        summary.plain_avg ?? 0,
            weightedAvg:     summary.weighted_avg ?? 0,
            recommendation:  summary.recommendation ?? "Needs More Evaluation",
            durationSeconds: summary.duration_seconds ?? 0,
            summary:         summary.summary ?? "",
            whatWentRight:   summary.what_went_right   ?? [],
            whatWentWrong:   summary.what_went_wrong   ?? [],
            tips:            summary.tips              ?? [],
            skillScores:     summary.skill_scores      ?? {},
            questionScores:  summary.question_scores   ?? [],
            gapAnalysis:     summary.gap_analysis      ?? {},
          },
          create: {
            interviewId,
            overallScore:    summary.overall_score ?? 0,
            plainAvg:        summary.plain_avg ?? 0,
            weightedAvg:     summary.weighted_avg ?? 0,
            recommendation:  summary.recommendation ?? "Needs More Evaluation",
            durationSeconds: summary.duration_seconds ?? 0,
            summary:         summary.summary ?? "",
            whatWentRight:   summary.what_went_right   ?? [],
            whatWentWrong:   summary.what_went_wrong   ?? [],
            tips:            summary.tips              ?? [],
            skillScores:     summary.skill_scores      ?? {},
            questionScores:  summary.question_scores   ?? [],
            gapAnalysis:     summary.gap_analysis      ?? {},
          },
        });

        // ── Mark interview completed ──────────────────────────────────────
        await tx.interview.update({
          where: { id: interviewId },
          data:  { status: "COMPLETED", completedAt: new Date() },
        });
      });
      console.log("UPDATED STATUS:", interview.status);

      // Save score to Redis history list (for score-history chart)
      const historyKey      = `user:${interview.userId}:interview_scores`;
      const existingScores  = await redisClient.lrange(historyKey, 0, -1);
      const alreadySaved    = existingScores.some((e: string) => {
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

      // Cleanup Redis keys for this interview
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
        description  = "",
        difficulty   = "medium",
        questionCount = 10,
        topics       = [],
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
          interview_id:  interview.id,
          user_id:       userId,
          role:          interviewTitle.trim(),
          interview_type: interviewType.toLowerCase(),
          description,
          difficulty:    difficulty.toLowerCase(),
          max_questions: Math.max(3, Math.min(15, Number(questionCount))),
          topics:        Array.isArray(topics) ? topics : [],
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

  // ── GET /api/skills-insights ──────────────────────────────────────────────
  getSkillsInsights: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id) return res.status(401).json({ message: "Unauthorized" });
      const userId = session.user.id;

      const userSkills = await prisma.userSkill.findMany({
        where:   { userId },
        include: { skill: true },
      });

      const interviews = await prisma.interview.findMany({
        where:   { userId, status: "COMPLETED" },
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
        where:   { userId },
        include: { insights: true },
      });

      // Build per-category score map
      const categoryScores: Record<string, number[]> = {};
      for (const interview of interviews) {
        const type = interview.type;
        for (const iq of interview.questions) {
          const score = iq.score ?? iq.response?.evaluation?.overallScore ?? null;
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

      const sortedCategories = Object.entries(categoryAverages).sort((a, b) => b[1] - a[1]);
      const strongest = sortedCategories[0] ?? null;
      const weakest   = sortedCategories[sortedCategories.length - 1] ?? null;

      const allScores  = Object.values(categoryScores).flat();
      const overallAvg = allScores.length
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : null;

      const coveredTypes = new Set(interviews.map((iv) => iv.type));

      const weakAreas: string[] = resume?.insights?.weakAreas ?? [];

      const TYPE_LABEL: Record<string, string> = {
        TECHNICAL: "Technical", HR: "HR / Behavioral",
        SYSTEM_DESIGN: "System Design", BEHAVIORAL: "Behavioral",
      };
      const uncoveredTypes = (["TECHNICAL", "HR", "SYSTEM_DESIGN", "BEHAVIORAL"] as const)
        .filter((t) => !coveredTypes.has(t))
        .map((t) => TYPE_LABEL[t]);

      const upcomingSkills = [
        ...weakAreas,
        ...uncoveredTypes.map((t) => `Practice ${t} interviews`),
      ].slice(0, 6);

      return res.status(200).json({
        skills: userSkills.map((us) => ({
          id:       us.skill.id,
          name:     us.skill.name,
          category: us.skill.category ?? "Other",
        })),
        strongest:  strongest  ? { label: TYPE_LABEL[strongest[0]]  ?? strongest[0],  score: strongest[1]  } : null,
        weakest:    weakest    ? { label: TYPE_LABEL[weakest[0]]    ?? weakest[0],    score: weakest[1]    } : null,
        overallAvg,
        categoryAverages: Object.fromEntries(
          Object.entries(categoryAverages).map(([k, v]) => [TYPE_LABEL[k] ?? k, v]),
        ),
        upcomingSkills,
        totalInterviews:    interviews.length,
        interviewsCovered:  [...coveredTypes].map((t) => TYPE_LABEL[t] ?? t),
      });
    } catch (error) {
      console.error("[getSkillsInsights]", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  generateInterviewPlan: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id) return res.status(401).json({ message: "Unauthorized" });
      const userId = session.user.id;
      const {
        interviewType,
        description  = "",
        difficulty   = "medium",
        numQuestions = 10,
        targetRole,
        duration,
      } = req.body;

      if (!interviewType || !targetRole?.trim() || !numQuestions || !duration) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const job = {
        type: "plan_generation",
        payload: {
          role:           targetRole.trim(),
          interview_type: interviewType.toLowerCase(),
          duration,
          difficulty:     difficulty.toLowerCase(),
          max_questions:  Number(numQuestions),
        },
        meta: { enqueuedAt: new Date().toISOString() },
      };

      await redisClient.rpush("jobs", JSON.stringify(job));
      console.log(`✅ Generate Plan Queued — id=${userId}`);
      return res.status(201).json({ message: "Plan Generated" });
    } catch (error) {
      console.error("[generateInterviewPlan] Error:", error);
      return res.status(500).json({ message: "Failed to create plan" });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────
function mapDifficulty(d: string): "EASY" | "MEDIUM" | "HARD" | null {
  switch ((d ?? "").toLowerCase()) {
    case "intro":
    case "easy":   return "EASY";
    case "medium": return "MEDIUM";
    case "hard":   return "HARD";
    default:       return null;
  }
}