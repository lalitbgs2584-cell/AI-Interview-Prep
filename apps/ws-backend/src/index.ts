// Load env FIRST
import dotenv from "dotenv";
dotenv.config({ override: true });

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import http from "http";
import routes from "./routes/resume.routes.js";
import sessionRoutes from "./routes/session.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import { errorMiddleware } from "./middlewares/error.middlewares.js";
import { generalRateLimiter } from "./middlewares/ratelimit.middleware.js";
import { auth } from "@repo/auth/server";
import { toNodeHandler } from "better-auth/node";
import { prisma } from "@repo/db/prisma-db";
import "./workers/processResume.workers.js";
import "./workers/interviewCreation.workers.js";
import "./workers/dlq.monitor.js";
import "./workers/eventLog.monitor.js";
import "./workers/tokenUsage.monitor.js";

import { redisClient } from "./config/redis.config.js";
import {
  buildCheckpointMessage,
  patchCheckpoint,
  readCheckpoint,
} from "./utils/checkpoint.js";
import { logEvent } from "./utils/eventLogger.js";

type StructuredAnswerPayload = {
  text?: string;
  analytics?: Record<string, unknown>;
};

function serializeAnswerPayload(answer: unknown): string {
  if (typeof answer === "string") return answer;

  if (answer && typeof answer === "object") {
    const payload = answer as StructuredAnswerPayload;
    if (typeof payload.text === "string") {
      return JSON.stringify({
        text: payload.text,
        analytics: payload.analytics ?? {},
      });
    }
  }

  return "";
}

const app: express.Application = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.BETTER_AUTH_BASE_URL || "http://localhost:3000",
  process.env.ADMIN_APP_URL || "http://localhost:3001",
];

export const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

/* ---------------------------
   Global Middlewares
--------------------------- */
app.use(cookieParser());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(generalRateLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.all("/api/auth/*splat", toNodeHandler(auth));

/* ---------------------------
   Health Check
--------------------------- */
app.get("/health", async (_req, res) => {
  try {
    const users = await prisma.user.findFirst();
    res.status(200).json({
      status: "OK",
      users,
      timestamp: new Date().toISOString(),
      dbConnected: true,
    });
  } catch (error: any) {
    console.error("Health check DB error:", error);
    res.status(500).json({
      status: "ERROR",
      error: "DB connection failed",
      details: error.message,
    });
  }
});

/* ---------------------------
   API Routes
--------------------------- */
app.use("/api", routes);
app.use("/api", sessionRoutes);
app.use("/api/admin", adminRoutes);

/* ---------------------------
   WebSocket
--------------------------- */
io.on("connection", (socket) => {
  console.log("[ws] WebSocket client connected:", socket.id);

  socket.on("resume_uploaded", (data) => {
    console.log("Resume uploaded:", data);
    socket.emit("resume_processed", { status: "success" });
  });

  socket.on("admin:join", () => {
    socket.join("admin");
    console.log(`[admin] Socket ${socket.id} joined admin room`);
  });

  socket.on("user:join", ({ userId }: { userId: string }) => {
    if (!userId) return;
    socket.join(`user:${userId}`);
    console.log(`[user] Socket ${socket.id} joined user:${userId}`);
  });

  // Join room + replay cached question if already generated
  socket.on("join_interview", async ({ interviewId }: { interviewId: string }) => {
    socket.join(`interview:${interviewId}`);
    console.log(`[join_interview] Socket ${socket.id} joined room interview:${interviewId}`);

    try {
      const traceId = await redisClient.get(`interview:${interviewId}:trace_id`);
      await logEvent({
        traceId,
        stage: "socket.session",
        eventType: "join_interview",
        interviewId,
        payload: { socketId: socket.id },
      });

      const checkpoint = await readCheckpoint(interviewId);
      if (checkpoint) {
        socket.emit("checkpoint_data", checkpoint);
      }

      const cached = await redisClient.get(`interview:${interviewId}:current_question`);
      if (cached) {
        console.log(`[join_interview] Replaying cached question for ${interviewId}`);
        socket.emit("interview:question", JSON.parse(cached));
      }
    } catch (err) {
      console.error(`[join_interview] Failed to replay cached question:`, err);
    }
  });

  socket.on("request_checkpoint", async ({ interviewId }: { interviewId: string }) => {
    try {
      const checkpoint = await readCheckpoint(interviewId);
      if (!checkpoint) {
        socket.emit("session_expired", { interviewId });
        return;
      }

      socket.emit("checkpoint_data", checkpoint);
    } catch (error) {
      console.error("[request_checkpoint] failed:", error);
      socket.emit("session_expired", { interviewId });
    }
  });

  socket.on("submit_answer", async ({ interviewId, answer }) => {
    const serializedAnswer = serializeAnswerPayload(answer);
    await redisClient.set(
      `interview:${interviewId}:latest_answer`,
      serializedAnswer,
      "EX",
      300,
    );
    const traceId = await redisClient.get(`interview:${interviewId}:trace_id`);
    const parsedAnswer =
      typeof answer === "object" && answer && "text" in (answer as StructuredAnswerPayload)
        ? String((answer as StructuredAnswerPayload).text ?? "")
        : serializedAnswer;
    await patchCheckpoint(interviewId, (current) => ({
      interviewId,
      userId: current?.userId ?? null,
      traceId: current?.traceId ?? traceId,
      status: "IN_PROGRESS",
      currentQuestion: current?.currentQuestion ?? null,
      messages:
        parsedAnswer.trim()
          ? [
              ...(current?.messages ?? []),
              buildCheckpointMessage("user", parsedAnswer.trim()),
            ]
          : (current?.messages ?? []),
      lastAnswer: parsedAnswer,
      lastActivityAt: Date.now(),
      updatedAt: new Date().toISOString(),
    }));
    await logEvent({
      traceId,
      stage: "socket.session",
      eventType: "answer_submitted",
      interviewId,
      payload: {
        socketId: socket.id,
        answerLength: parsedAnswer.length,
      },
    });

    // Signal the Python node that an answer is ready
    await redisClient.publish(`interview:${interviewId}:answer_ready`, "1");
  });

  socket.on("interview:interruption", async ({
    interviewId,
    count,
    timestamp,
  }: {
    interviewId: string;
    count: number;
    timestamp?: number;
  }) => {
    await redisClient.set(
      `interview:${interviewId}:interruptions`,
      String(Math.max(0, count || 0)),
      "EX",
      60 * 60 * 24,
    );

    await redisClient.publish(
      `interview:${interviewId}:events`,
      JSON.stringify({
        type: "interruption",
        count: Math.max(0, count || 0),
        timestamp: timestamp ?? Date.now(),
      }),
    );
  });

  socket.on("interview:end", async ({ interviewId, reason }) => {
    const traceId = await redisClient.get(`interview:${interviewId}:trace_id`);
    await redisClient.srem("admin:active_interviews", interviewId);
    await redisClient.del(`admin:active_interviews:${interviewId}`);
    await redisClient.set(
      `interview:${interviewId}:ended`,
      "1",
      "EX",
      3600
    );
    if (reason) {
      await redisClient.set(
        `interview:${interviewId}:end_reason`,
        String(reason),
        "EX",
        3600
      );
    }
    await redisClient.set(
      `interview:${interviewId}:latest_answer`,
      "__END__"
    );
    await redisClient.publish(
      `interview:${interviewId}:answer_ready`,
      "1"
    );
    await patchCheckpoint(interviewId, (current) => ({
      interviewId,
      userId: current?.userId ?? null,
      traceId: current?.traceId ?? traceId,
      status: "ENDED",
      currentQuestion: current?.currentQuestion ?? null,
      messages: current?.messages ?? [],
      lastAnswer: current?.lastAnswer ?? null,
      lastActivityAt: Date.now(),
      updatedAt: new Date().toISOString(),
    }));
    await logEvent({
      traceId,
      stage: "socket.session",
      eventType: "interview_ended",
      interviewId,
      payload: {
        socketId: socket.id,
        reason: String(reason ?? "user_ended"),
      },
    });
  });

  socket.on("disconnect", () => {
    console.log("' WebSocket client disconnected:", socket.id);
  });
});

app.set("io", io);

/* ---------------------------
   Error Handler (LAST)
--------------------------- */
app.use(errorMiddleware);

/* ---------------------------
   Start Server
--------------------------- */
const PORT = 4000;

server.listen(PORT, () => {
  console.log(`[ok] ws-backend + WebSocket running on port ${PORT}`);
  console.log(`[ok] DATABASE_URL loaded:`, !!process.env.DATABASE_URL ? "yes" : "no");
  console.log(`[ok] Environment: ${process.env.NODE_ENV || "development"}`);
});

