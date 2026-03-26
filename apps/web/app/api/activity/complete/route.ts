import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const todayIso = new Date().toISOString().slice(0, 10);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const activityMap = (user.activityMap as Record<string, number>) ?? {};

  // Increment today's session count
  activityMap[todayIso] = (activityMap[todayIso] ?? 0) + 1;

  // Streak logic
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);
  const lastIso = user.lastLoginAt?.toISOString().slice(0, 10);

  let streak = user.streak;
  if (lastIso === yesterdayIso) streak += 1;       // continued streak
  else if (lastIso === todayIso) streak = streak;   // already did one today
  else streak = 1;                                   // gap — reset

  await prisma.user.update({
    where: { id: userId },
    data: {
      activityMap,
      streak,
      bestStreak: Math.max(streak, user.bestStreak),
      lastLoginAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}