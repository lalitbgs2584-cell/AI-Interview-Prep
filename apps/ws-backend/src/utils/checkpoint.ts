import { redisClient } from "../config/redis.config.js";

export type CheckpointStatus = "CREATED" | "IN_PROGRESS" | "COMPLETED" | "ENDED";

export interface CheckpointMessage {
  id: number;
  role: "ai" | "user";
  text: string;
  time: string;
}

export interface InterviewCheckpoint {
  interviewId: string;
  userId?: string | null;
  traceId?: string | null;
  status: CheckpointStatus;
  currentQuestion?: {
    index: number;
    difficulty: string;
    question: string;
    time: number;
  } | null;
  messages: CheckpointMessage[];
  lastAnswer?: string | null;
  lastActivityAt: number;
  updatedAt: string;
}

const CHECKPOINT_TTL_SECONDS = 60 * 60 * 24;

export function checkpointKey(interviewId: string): string {
  return `session:checkpoint:${interviewId}`;
}

export function buildCheckpointMessage(
  role: "ai" | "user",
  text: string,
  timestamp = Date.now(),
): CheckpointMessage {
  return {
    id: timestamp,
    role,
    text,
    time: new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export async function readCheckpoint(interviewId: string): Promise<InterviewCheckpoint | null> {
  const raw = await redisClient.get(checkpointKey(interviewId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as InterviewCheckpoint;
  } catch (error) {
    console.error("[checkpoint] parse failed:", error);
    return null;
  }
}

export async function writeCheckpoint(
  interviewId: string,
  checkpoint: InterviewCheckpoint,
): Promise<void> {
  await redisClient.set(
    checkpointKey(interviewId),
    JSON.stringify({
      ...checkpoint,
      interviewId,
      updatedAt: new Date().toISOString(),
    }),
    "EX",
    CHECKPOINT_TTL_SECONDS,
  );
}

export async function patchCheckpoint(
  interviewId: string,
  updater: (current: InterviewCheckpoint | null) => InterviewCheckpoint,
): Promise<InterviewCheckpoint> {
  const current = await readCheckpoint(interviewId);
  const next = updater(current);
  await writeCheckpoint(interviewId, next);
  return next;
}

export async function clearCheckpoint(interviewId: string): Promise<void> {
  await redisClient.del(checkpointKey(interviewId));
}
