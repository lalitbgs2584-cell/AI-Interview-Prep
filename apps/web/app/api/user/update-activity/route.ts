// app/api/user/update-activity/route.ts

import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * POST /api/user/update-activity
 * 
 * Called after interview completion to increment the activity counter for today.
 * This is separate from middleware streak calculation because we want to track
 * how many interviews were completed on a given day.
 * 
 * Request body: { interviewId?: string } (optional, for validation)
 */
export async function POST(request: Request) {
    try {
        const session = await auth.api.getSession({
            headers: await headers() // you need to pass the headers object.
        }) 
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;
        const body = await request.json().catch(() => ({}));

        // Get current user
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                activityMap: true,
                lastLoginAt: true,
                streak: true,
                bestStreak: true,
            },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Get today's date in ISO format (YYYY-MM-DD)
        const today = new Date().toISOString().slice(0, 10);

        // Parse activity map (stored as JSON in DB)
        const activityMap = (user.activityMap as Record<string, number>) || {};

        // Increment today's counter
        activityMap[today] = (activityMap[today] ?? 0) + 1;

        // Ensure streak is updated if this is the first activity today
        const lastLogin = user.lastLoginAt ? new Date(user.lastLoginAt) : null;
        const lastLoginDate = lastLogin ? lastLogin.toISOString().slice(0, 10) : null;
        const needsStreakUpdate = lastLoginDate !== today && lastLoginDate !== null;

        const updateData: any = {
            activityMap,
            lastLoginAt: new Date(),
        };

        // If this is first activity after yesterday, increment streak
        if (needsStreakUpdate) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayIso = yesterday.toISOString().slice(0, 10);

            if (lastLoginDate === yesterdayIso) {
                // Continued from yesterday: increment
                updateData.streak = (user.streak || 0) + 1;
                updateData.bestStreak = Math.max(user.bestStreak || 0, updateData.streak);
            } else {
                // Broke streak or first time: reset to 1
                updateData.streak = 1;
                // Don't update bestStreak on reset
            }
        }

        // Update user
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                streak: true,
                bestStreak: true,
                activityMap: true,
            },
        });

        return NextResponse.json({
            success: true,
            streak: updatedUser.streak,
            bestStreak: updatedUser.bestStreak,
            activityMap: updatedUser.activityMap,
            message: `Activity recorded for ${today}`,
        });
    } catch (error) {
        console.error("Update activity error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * GET /api/user/update-activity
 * 
 * Returns current user's streak and activity info
 */
export async function GET() {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                streak: true,
                bestStreak: true,
                lastLoginAt: true,
                activityMap: true,
            },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({
            streak: user.streak,
            bestStreak: user.bestStreak,
            lastLoginAt: user.lastLoginAt,
            activityMap: user.activityMap,
        });
    } catch (error) {
        console.error("Get activity error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}