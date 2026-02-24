import { auth } from "@repo/auth/server";
import { fromNodeHeaders } from "better-auth/node";
import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/auth-request.js";

// 🔹 Global Error Middleware
export function errorMiddleware(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(err);

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
}

// 🔹 Auth Middleware
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      return res.status(401).json({ error: "No session" });
    }

    // Attach session to request (optional but recommended)
    req.session = session;

    next(); // continue to next middleware
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}