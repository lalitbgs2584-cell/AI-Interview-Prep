// app/api/user/update-activity/route.ts

import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

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