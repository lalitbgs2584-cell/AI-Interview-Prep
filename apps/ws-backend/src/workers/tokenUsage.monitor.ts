import { prisma } from "@repo/db/prisma-db";
import { createRedisClient } from "../config/redis.config.js";

type TokenUsageEvent = {
  userId: string;
  model: string;
  date: string;
  tokensUsed: number;
  totalTokens: number;
};

const tokenUsageSubscriber = createRedisClient();

tokenUsageSubscriber.subscribe("token:usage", (err) => {
  if (err) {
    console.error("[token-usage] subscribe failed:", err);
    return;
  }
  console.log("[token-usage] Listening for token usage events...");
});

tokenUsageSubscriber.on("message", async (channel, message) => {
  if (channel !== "token:usage") return;

  try {
    const payload = JSON.parse(message) as TokenUsageEvent;
    if (!payload.userId || !payload.model || !payload.date) return;

    await prisma.userTokenUsage.upsert({
      where: {
        userId_date_model: {
          userId: payload.userId,
          date: new Date(`${payload.date}T00:00:00.000Z`),
          model: payload.model,
        },
      },
      update: {
        tokensUsed: Number(payload.totalTokens || payload.tokensUsed || 0),
      },
      create: {
        userId: payload.userId,
        date: new Date(`${payload.date}T00:00:00.000Z`),
        model: payload.model,
        tokensUsed: Number(payload.totalTokens || payload.tokensUsed || 0),
      },
    });
  } catch (error) {
    console.error("[token-usage] failed to persist usage:", error);
  }
});
