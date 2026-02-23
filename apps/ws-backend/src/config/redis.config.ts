import dotenv from "dotenv";
dotenv.config();

import {Redis} from "ioredis";

export const redisClient = new Redis(
  process.env.VALKEY_URL || "redis://localhost:6379"
);