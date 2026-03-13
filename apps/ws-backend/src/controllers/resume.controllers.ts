import { Request, Response } from "express";
import { redisClient } from "../config/redis.config.js";
import { AuthenticatedRequest } from "../types/auth-request.js";
import { prisma } from "@repo/db/prisma-db";

export const resumeController = {
  processResume: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;

      if (!session?.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = session.user.id;
      const { fileId, S3fileName } = req.body;

      if (!fileId || !S3fileName) {
        return res.status(400).json({ message: "Missing fileId or S3fileName" });
      }

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

  interviewFeedback: async (req: AuthenticatedRequest, res: Response) => {
    const interviewId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!interviewId) {
      res.status(400).json({ error: "Interview ID is required" });
      return;
    }

    try {
      const raw = await redisClient.get(`interview:${interviewId}:summary`);
      if (!raw) {
        res.status(404).json({ error: "Results not ready yet." });
        return;
      }

      const summary = JSON.parse(raw);
      const userId = summary.user_id;
      let history: any[] = [];

      if (userId) {
        const historyRaw = await redisClient.lrange(`user:${userId}:interview_scores`, 0, 19);
        history = historyRaw
          .map((h: string) => { try { return JSON.parse(h); } catch { return null; } })
          .filter(Boolean)
          .reverse();

        const alreadySaved = history.some((h) => h.interview_id === interviewId);
        if (!alreadySaved) {
          await redisClient.rpush(
            `user:${userId}:interview_scores`,
            JSON.stringify({
              interview_id: interviewId,
              score: summary.overall_score,
              role: summary.role,
              date_iso: summary.date_iso,
            })
          );
        }
      }

      res.json({ ...summary, history });
    } catch (err) {
      console.error("[results]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  getResumeStatus: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;

      if (!session?.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = session.user.id;

      const user = await prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          isResumeUploaded: true
        }
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json({
        resumeUploaded: user.isResumeUploaded
      });

    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
  
  storeNeon: async (req: AuthenticatedRequest, res: Response) => {
    const interviewId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!interviewId) {
      res.status(400).json({ error: "Interview ID is required" });
      return;
    }

    try {
      // ── 1. Read summary from Redis ───────────────────────────────────────
      const rawSummary = await redisClient.get(`interview:${interviewId}:summary`);
      if (!rawSummary) {
        res.status(404).json({ error: "Summary not found in Redis. Interview may not be complete yet." });
        return;
      }
      const summary = JSON.parse(rawSummary);

      // ── 2. Read full Q&A history from Redis ─────────────────────────────
      const rawHistory = await redisClient.lrange(`interview:${interviewId}:history`, 0, -1);

      type HistoryStep = {
        index: number;
        question: string;
        answer: string;
        score: number;       // 0–10 from Python
        confidence: number;  // 0.0–1.0
        feedback: string;
        difficulty: string;
        followup: boolean;
        timestamp: number;
      };

      const history: HistoryStep[] = rawHistory.map((h: string) => JSON.parse(h));

      if (history.length === 0) {
        res.status(400).json({ error: "No question history found in Redis." });
        return;
      }

      // ── 3. Verify interview exists ───────────────────────────────────────
      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
      });

      if (!interview) {
        res.status(404).json({ error: `Interview ${interviewId} not found in database.` });
        return;
      }

      // ── 4. Idempotency — skip if already completed ───────────────────────
      if (interview.status === "COMPLETED") {
        res.json({ success: true, message: "Already persisted", interviewId });
        return;
      }

      // ── 5. Persist in a single transaction ──────────────────────────────
      await prisma.$transaction(async (tx) => {

        for (const step of history) {
          // ── 5a. Create Question (always new per interview, no upsert needed) ──
          // We use a deterministic id so re-runs are idempotent
          const questionId = `${interviewId}-q${step.index}`;

          const question = await tx.question.upsert({
            where: { id: questionId },
            update: {}, // nothing to update
            create: {
              id: questionId,
              content: step.question,
              difficulty: mapDifficulty(step.difficulty),
              type: interview.type,
            },
          });

          // ── 5b. Upsert InterviewQuestion ─────────────────────────────────
          const interviewQuestion = await tx.interviewQuestion.upsert({
            where: {
              interviewId_questionId: {
                interviewId,
                questionId: question.id,
              },
            },
            update: {
              score: Math.round(step.score * 10), // 0–10 → 0–100
              order: step.index,
            },
            create: {
              interviewId,
              questionId: question.id,
              score: Math.round(step.score * 10),
              order: step.index,
            },
          });

          // ── 5c. Upsert Response (the candidate's actual answer) ──────────
          const response = await tx.response.upsert({
            where: { interviewQuestionId: interviewQuestion.id },
            update: {
              submittedAt: step.timestamp ? new Date(step.timestamp * 1000) : new Date(),
            },
            create: {
              interviewQuestionId: interviewQuestion.id,
              submittedAt: step.timestamp
                ? new Date(step.timestamp * 1000)
                : new Date(),
            },
          });

          // ── 5d. Upsert Evaluation ────────────────────────────────────────
          // skill_scores from summary — per-question clarity/technical/confidence
          // aren't available per-step so we use the overall summary skill scores
          await tx.evaluation.upsert({
            where: { responseId: response.id },
            update: {
              overallScore: Math.round(step.score * 10),
              confidenceScore: step.confidence,
              feedback: step.feedback ?? "",
              clarity: summary.skill_scores?.["Clarity"] ?? null,
              technical: summary.skill_scores?.["Technical Depth"] ?? null,
              confidence: summary.skill_scores?.["Confidence"] ?? null,
              strengths: summary.strengths?.join(" | ") ?? null,
              improvements: summary.weaknesses?.join(" | ") ?? null,
            },
            create: {
              responseId: response.id,
              overallScore: Math.round(step.score * 10),
              confidenceScore: step.confidence,
              feedback: step.feedback ?? "",
              clarity: summary.skill_scores?.["Clarity"] ?? null,
              technical: summary.skill_scores?.["Technical Depth"] ?? null,
              confidence: summary.skill_scores?.["Confidence"] ?? null,
              strengths: summary.strengths?.join(" | ") ?? null,
              improvements: summary.weaknesses?.join(" | ") ?? null,
            },
          });
        }

        // ── 5e. Mark interview as COMPLETED ─────────────────────────────────
        await tx.interview.update({
          where: { id: interviewId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });
      });

      // ── 6. Save score to Redis history list (for feedback page chart) ────
      const historyKey = `user:${interview.userId}:interview_scores`;
      const existingScores = await redisClient.lrange(historyKey, 0, -1);
      const alreadySaved = existingScores.some((e: string) => {
        try { return JSON.parse(e).interview_id === interviewId; }
        catch { return false; }
      });

      if (!alreadySaved) {
        await redisClient.rpush(historyKey, JSON.stringify({
          interview_id: interviewId,
          score: summary.overall_score,
          role: summary.role,
          date_iso: summary.date_iso,
        }));
      }

      // ── 7. Clean up Redis keys ───────────────────────────────────────────
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

  startInterview: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;
      if (!session?.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = session.user.id;

      const {
        interviewTitle,     // string  — becomes state.role
        interviewType,      // "TECHNICAL" | "HR" | "SYSTEM_DESIGN" | "BEHAVIORAL"
        description = "",   // string  — packed description (topics + notes + JD)
        difficulty = "medium",  // "easy" | "medium" | "hard" — job payload only
        questionCount = 10, // number — job payload only (max_questions in Python)
        topics = [],        // string[] — job payload only (already in description)
      } = req.body;

      if (!interviewTitle?.trim() || !interviewType) {
        return res.status(400).json({ message: "Title and type are required" });
      }

      // 1. Persist Interview record in DB
      const interview = await prisma.interview.create({
        data: {
          title: interviewTitle.trim(),
          type: interviewType,          // stored as-is (TECHNICAL etc.)
          userId: userId,
          status: "CREATED",
        },
      });

      // 2. Cache user_id in Redis so storeNeon can read it without a DB lookup
      await redisClient.set(
        `interview:${interview.id}:user_id`,
        userId,
        "EX",
        60 * 60 * 24, // 24 h
      );

      // 3. Build the Python job — maps directly onto InterviewState + extra payload fields
      const job = {
        type: "interview_creation",
        payload: {
          // ── InterviewState fields ──────────────────────────────────────────
          interview_id: interview.id,
          user_id: userId,
          role: interviewTitle.trim(),          // state.role
          interview_type: interviewType.toLowerCase(),    // state.interview_type: "technical" etc.
          description: description,                    // state.description (packed)

          // ── Job payload fields (Python reads these, not in state) ──────────
          difficulty: difficulty.toLowerCase(),       // "easy" | "medium" | "hard"
          max_questions: Math.max(3, Math.min(15, Number(questionCount))),
          topics: Array.isArray(topics) ? topics : [],
        },
        meta: { enqueuedAt: new Date().toISOString() },
      };

      await redisClient.rpush("jobs", JSON.stringify(job));
      console.log(`✅ Interview job queued — id=${interview.id} type=${interviewType} diff=${difficulty} q=${questionCount}`);

      return res.status(201).json({ message: "Interview Created", data: interview });

    } catch (error) {
      console.error("[startInterview] Error:", error);
      return res.status(500).json({ message: "Failed to create interview" });
    }
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapDifficulty(d: string): "EASY" | "MEDIUM" | "HARD" | null {
  switch (d.toLowerCase()) {
    case "intro":
    case "easy": return "EASY";
    case "medium": return "MEDIUM";
    case "hard": return "HARD";
    default: return null;
  }
}