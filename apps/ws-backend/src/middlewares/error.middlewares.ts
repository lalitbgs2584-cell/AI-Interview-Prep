import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";
import { fromNodeHeaders } from "better-auth/node";
import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/auth-request.js";

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

async function loadSession(req: AuthenticatedRequest) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session?.user?.id) {
    return null;
  }

  req.session = session;
  return session;
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const session = await loadSession(req);

    if (!session) {
      return res.status(401).json({ error: "No session" });
    }

    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export async function adminMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const session = await loadSession(req);
    if (!session?.user?.id) {
      return res.status(401).json({ error: "No session" });
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isBlocked: true,
        isDeleted: true,
      },
    });

    if (!adminUser || adminUser.isDeleted || adminUser.isBlocked) {
      return res.status(403).json({ error: "Admin access unavailable" });
    }

    if (adminUser.role !== "ADMIN") {
      return res.status(403).json({ error: "Admin only" });
    }

    req.adminUser = adminUser;
    next();
  } catch (error) {
    console.error("[adminMiddleware]", error);
    return res.status(401).json({ error: "Unauthorized" });
  }
}
