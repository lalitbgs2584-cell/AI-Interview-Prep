import { prisma } from "@repo/db/prisma-db";
import { io } from "../index.js";
import { createRedisClient } from "../config/redis.config.js";

type WorkerFailureEvent = {
  jobId: string;
  queue: string;
  userId?: string;
  interviewId?: string;
  fileId?: string;
  reason?: string;
};

const dlqSubscriber = createRedisClient();

dlqSubscriber.subscribe("worker:failed", (err) => {
  if (err) {
    console.error("[dlq] subscribe failed:", err);
    return;
  }
  console.log("[dlq] Listening for worker failure events...");
});

dlqSubscriber.on("message", async (channel, message) => {
  if (channel !== "worker:failed") return;

  try {
    const payload = JSON.parse(message) as WorkerFailureEvent;

    await prisma.jobFailure.create({
      data: {
        jobId: payload.jobId || "unknown",
        queue: payload.queue || "jobs",
        userId: payload.userId || null,
        reason: payload.reason || null,
      },
    });

    if (payload.userId) {
      io.to(`user:${payload.userId}`).emit("job_failed", {
        scope: payload.queue,
        jobId: payload.jobId,
        message: payload.reason || "A background job failed.",
      });
    }

    if (payload.interviewId) {
      io.to(`interview:${payload.interviewId}`).emit("job_failed", {
        scope: payload.queue,
        jobId: payload.jobId,
        message: payload.reason || "A background job failed.",
      });
    }
  } catch (error) {
    console.error("[dlq] failed to handle worker failure:", error);
  }
});
