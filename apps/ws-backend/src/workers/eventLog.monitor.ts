import { prisma } from "@repo/db/prisma-db";
import { subscriber } from "../config/redis.config.js";

subscriber.subscribe("event:log", (err) => {
  if (err) console.error("[eventLog.monitor] subscribe failed:", err);
});

subscriber.on("message", async (channel, message) => {
  if (channel !== "event:log") return;

  try {
    const payload = JSON.parse(message) as {
      traceId: string;
      service: string;
      stage: string;
      eventType: string;
      level?: string;
      userId?: string | null;
      interviewId?: string | null;
      fileId?: string | null;
      payload?: Record<string, unknown> | null;
      createdAt?: string;
    };

    await prisma.eventLog.create({
      data: {
        traceId: payload.traceId,
        service: payload.service,
        stage: payload.stage,
        eventType: payload.eventType,
        level: payload.level ?? "info",
        userId: payload.userId ?? null,
        interviewId: payload.interviewId ?? null,
        fileId: payload.fileId ?? null,
        payload: payload.payload as any ?? undefined,
        createdAt: payload.createdAt ? new Date(payload.createdAt) : undefined,
      },
    });
  } catch (error) {
    console.error("[eventLog.monitor] failed:", error);
  }
});