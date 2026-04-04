import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/", "/login", "/signup",
  "/api/auth",
  "/api/auth/callback",
  "/api/auth/signin",
  "/api/auth/callback/google",
  "/api/auth/callback/github",
];

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL;
if(!ADMIN_URL) {
  throw new Error("NEXT_PUBLIC_ADMIN_URL is not defined in environment variables");
}

function calculateNewStreak(lastLoginAt: Date | null): { newStreak: number; newBestStreak: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!lastLoginAt) return { newStreak: 1, newBestStreak: 1 };

  const lastLogin = new Date(lastLoginAt);
  lastLogin.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { newStreak: 0, newBestStreak: 0 };
  if (diffDays === 1) return { newStreak: 1, newBestStreak: 1 };
  return { newStreak: 1, newBestStreak: 0 };
}

export async function proxy(req: NextRequest) {
  try {
    const { pathname } = req.nextUrl;

    const isPublic = PUBLIC_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route + "/")
    );
    if (isPublic) return NextResponse.next();

    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return NextResponse.redirect(new URL("/login", req.url));

    if (session.user.isBlocked) {
      return NextResponse.redirect(new URL("/blocked", req.url));
    }

    const userId = session.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastLoginAt: true, streak: true, bestStreak: true, activityMap: true, role: true },
    });

    if (!user) return NextResponse.next();

    const isAdminRoute = pathname === ADMIN_URL || pathname.startsWith(ADMIN_URL + "/");

    // ... Admin routing
    if (user.role.toLowerCase() === "admin") {
      if (!isAdminRoute) return NextResponse.redirect(new URL(ADMIN_URL!, req.url));
      return NextResponse.next();
    }

    // ... Block regular users from admin routes
    if (isAdminRoute) return NextResponse.redirect(new URL("/", req.url));

    // Streak + activity tracking
    const { newStreak } = calculateNewStreak(user.lastLoginAt);
    const today = new Date().toISOString().slice(0, 10);
    const activityMap = (user.activityMap as Record<string, number>) || {};
    const hasActivityToday = activityMap[today] !== undefined;

    if (newStreak > 0 || !hasActivityToday) {
      const updateData: any = { lastLoginAt: new Date() };

      if (newStreak > 0) {
        updateData.streak = Math.max(user.streak + newStreak, 1);
        updateData.bestStreak = Math.max(user.bestStreak, updateData.streak);
      }

      if (!hasActivityToday) {
        updateData.activityMap = { ...activityMap, [today]: 0 };
      }

      await prisma.user.update({ where: { id: userId }, data: updateData });
    }

    return NextResponse.next();
  } catch (error) {
    console.error("Middleware error (non-blocking):", error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};