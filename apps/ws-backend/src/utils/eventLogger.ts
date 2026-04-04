import { randomUUID } from "crypto";
import { redisClient } from "../config/redis.config.js";

export type EventLogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface EventLogEnvelope {
  traceId?: string | null;
  service?: string;
  stage: string;
  eventType: string;
  level?: EventLogLevel;
  userId?: string | null;
  interviewId?: string | null;
  fileId?: string | null;
  payload?: Record<string, unknown> | null;
}

export async function logEvent(event: EventLogEnvelope): Promise<string> {
  const traceId = event.traceId || randomUUID();
  const envelope = {
    traceId,
    service: event.service ?? "ws-backend",
    stage: event.stage,
    eventType: event.eventType,
    level: event.level ?? "INFO",
    userId: event.userId ?? null,
    interviewId: event.interviewId ?? null,
    fileId: event.fileId ?? null,
    payload: event.payload ?? null,
    createdAt: new Date().toISOString(),
  };

  try {
    await redisClient.publish("event:log", JSON.stringify(envelope));
  } catch (error) {
    console.error("[eventLogger] publish failed:", error);
  }

  return traceId;
}
