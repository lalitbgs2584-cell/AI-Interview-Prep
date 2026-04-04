import { NextFunction, Request, Response } from "express";
import { AuthenticatedRequest } from "../types/auth-request.js";
import { redisClient } from "../config/redis.config.js";

type KeyFn = (req: AuthenticatedRequest) => string | Promise<string>;

function setRateHeaders(res: Response, max: number, remaining: number, ttlMs: number) {
  res.setHeader("RateLimit-Limit", String(max));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("RateLimit-Reset", String(Math.max(0, Math.ceil(ttlMs / 1000))));
}

function createRateLimiter(name: string, windowMs: number, max: number, keyFn: KeyFn) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const key = `ratelimit:${name}:${await keyFn(authReq)}`;

    try {
      const multi = redisClient.multi();
      multi.incr(key);
      multi.pttl(key);
      const results = await multi.exec();

      const count = Number(results?.[0]?.[1] ?? 0);
      let ttlMs = Number(results?.[1]?.[1] ?? -1);

      if (ttlMs < 0) {
        await redisClient.pexpire(key, windowMs);
        ttlMs = windowMs;
      }

      setRateHeaders(res, max, max - count, ttlMs);

      if (count > max) {
        return res.status(429).json({
          error: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please wait and try again.",
          retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
        });
      }

      next();
    } catch (error) {
      console.error(`[ratelimit:${name}] falling through after redis error:`, error);
      next();
    }
  };
}

const userOrIp = (req: AuthenticatedRequest) => req.session?.user?.id || req.ip || "unknown";

export const generalRateLimiter = createRateLimiter("general", 15 * 60 * 1000, 100, (req) => req.ip || "unknown");
export const interviewStartRateLimiter = createRateLimiter("interview-start", 15 * 60 * 1000, 10, userOrIp);
export const resumeUploadRateLimiter = createRateLimiter("resume-upload", 24 * 60 * 60 * 1000, 5, userOrIp);
