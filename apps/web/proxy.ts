import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/", "/login", "/signup",
  "/api/auth",           // ✅ Better Auth OAuth routes
  "/api/auth/callback",  // ✅ Google/GitHub callbacks
  "/api/auth/signin",
  "/api/auth/callback/google",
  "/api/auth/callback/github"
];
function calculateNewStreak(lastLoginAt: Date | null): { newStreak: number; newBestStreak: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!lastLoginAt) {
    return { newStreak: 1, newBestStreak: 1 };
  }

  const lastLogin = new Date(lastLoginAt);
  lastLogin.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - lastLogin.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // If they logged in today: no change
  if (diffDays === 0) {
    return { newStreak: 0, newBestStreak: 0 }; // No update needed
  }

  // If they logged in yesterday: continue streak
  if (diffDays === 1) {
    return { newStreak: 1, newBestStreak: 1 }; // +1 to existing streak
  }

  // If they missed a day: reset
  return { newStreak: 1, newBestStreak: 0 }; // Reset to 1, don't update best
}

export async function proxy(req: NextRequest) {
  try {
    const { pathname } = req.nextUrl;

    // ✅ Allow public routes
    const isPublic = PUBLIC_ROUTES.some(route =>
      pathname === route || pathname.startsWith(route + "/")
    );

    if (isPublic) {
      return NextResponse.next();
    }

    // ✅ Get session using Better Auth
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const userId = session.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        lastLoginAt: true,
        streak: true,
        bestStreak: true,
        activityMap: true,
      },
    });
    if (!user) {
      return NextResponse.next();
    }

    const { newStreak, newBestStreak } = calculateNewStreak(user.lastLoginAt);
    // If today's activity doesn't exist yet, initialize it
    const today = new Date().toISOString().slice(0, 10);
    const activityMap = (user.activityMap as Record<string, number>) || {};
    const hasActivityToday = activityMap[today] !== undefined;

    // Only update if:
    // 1. Not yet logged in today (newStreak > 0), OR
    // 2. Activity map doesn't have today
    if (newStreak > 0 || !hasActivityToday) {
      const updateData: any = {
        lastLoginAt: new Date(),
      };

      // Only update streak if it changed
      if (newStreak > 0) {
        updateData.streak = Math.max(user.streak + newStreak, 1);
        updateData.bestStreak = Math.max(user.bestStreak, updateData.streak);
      }

      // Initialize today's activity if needed
      if (!hasActivityToday) {
        updateData.activityMap = {
          ...activityMap,
          [today]: 0, // Will be incremented when interview completes
        };
      }

      await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
      return NextResponse.next();
    }
  } catch (error) {
    console.error("Middleware error (non-blocking):", error);

  }
}
export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};