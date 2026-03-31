import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const {
    interviewId,
    endReason,
    interruptionCount,
    tabSwitches,
    fsExits,
    sessionDurationSec,
  } = await req.json();

  if (!interviewId)
    return NextResponse.json({ error: "Missing interviewId" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── Activity map & streak ──────────────────────────────────────────────
  const todayIso = new Date().toISOString().slice(0, 10);
  const activityMap = (user.activityMap as Record<string, number>) ?? {};
  activityMap[todayIso] = (activityMap[todayIso] ?? 0) + 1;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);
  const lastIso = user.lastLoginAt?.toISOString().slice(0, 10);

  let streak = user.streak;
  if (lastIso === yesterdayIso) streak += 1;
  else if (lastIso === todayIso) streak = streak;
  else streak = 1;

  // ── Run both updates in parallel ──────────────────────────────────────
  await Promise.all([
    prisma.user.update({
      where: { id: userId },
      data: {
        activityMap,
        streak,
        bestStreak: Math.max(streak, user.bestStreak),
        lastLoginAt: new Date(),
      },
    }),

    prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        endReason,
        interruptionCount,
        tabSwitches,
        fsExits,
        sessionDurationSec,
        // integrityScore: compute here if you want, or leave null for a separate job
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}