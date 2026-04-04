
import dotenv from "dotenv";
dotenv.config();
import {Redis} from "ioredis";

export const redisUrl = process.env.VALKEY_URL || "redis://localhost:6379";

function getRedisOptions() {
  return redisUrl.startsWith("rediss://")
    ? { tls: { rejectUnauthorized: false } }
    : {};
}

export function createRedisClient() {
  return new Redis(redisUrl, getRedisOptions());
}

export const redisClient = createRedisClient();
export const subscriber = createRedisClient(); // locked to subscribe only
