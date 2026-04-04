// app/api/dashboard/stats/route.ts

import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const session = await auth.api.getSession({
            headers: await headers() // you need to pass the headers object.
        })
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        // " Get all interviews for this user
        const allInterviews = await prisma.interview.findMany({
            where: { userId },
            include: {
                summary: {
                    select: {
                        overallScore: true,
                    },
                },
                questions: {
                    select: {
                        response: {
                            select: {
                                evaluation: {
                                    select: {
                                        overallScore100: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        // " Get user skills
        const userSkills = await prisma.userSkill.findMany({
            where: { userId },
            include: { skill: true },
        });

        // " Get current user for streak
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                streak: true,
                bestStreak: true,
            },
        });

        // " Calculate statistics
        const totalSessions = allInterviews.length;

        // Average score across all completed interviews
        const completedInterviews = allInterviews.filter((i: any) => i.status === "COMPLETED");
        const allScores = completedInterviews.flatMap((i: any) =>
            i.questions.flatMap((q: any) => q.response?.evaluation?.overallScore100 || [])
        );
        const averageScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

        // Sessions this week vs last week
        const thisWeekSessions = allInterviews.filter((i: any) => new Date(i.createdAt) >= oneWeekAgo).length;
        const lastWeekSessions = allInterviews.filter(
            (i: any) => new Date(i.createdAt) >= twoWeeksAgo && new Date(i.createdAt) < oneWeekAgo
        ).length;
        const weeklySessionDelta = thisWeekSessions - lastWeekSessions;

        // Score improvement
        const thisWeekScores = allInterviews
            .filter((i) => new Date(i.createdAt) >= oneWeekAgo && i.status === "COMPLETED")
            .flatMap((i) => i.questions.flatMap((q) => q.response?.evaluation?.overallScore100 || []));

        const lastWeekScores = allInterviews
            .filter(
                (i) =>
                    new Date(i.createdAt) >= twoWeeksAgo &&
                    new Date(i.createdAt) < oneWeekAgo &&
                    i.status === "COMPLETED"
            )
            .flatMap((i: any) => i.questions.flatMap((q: any) => q.response?.evaluation?.overallScore100 || []));

        const thisWeekAvg = thisWeekScores.length > 0 ? Math.round(thisWeekScores.reduce((a: any, b: any) => a + b, 0) / thisWeekScores.length) : 0;
        const lastWeekAvg = lastWeekScores.length > 0 ? Math.round(lastWeekScores.reduce((a: any, b: any) => a + b, 0) / lastWeekScores.length) : 0;
        const scoreImprovement = thisWeekAvg - lastWeekAvg;

        // Skills covered
        const skillsCovered = userSkills.length;
        const skillsRemaining = Math.max(0, 20 - skillsCovered); // Assuming 20 total skills

        return NextResponse.json({
            totalSessions,
            averageScore,
            skillsCovered,
            currentStreak: user?.streak || 0,
            weeklySessionDelta,
            scoreImprovement,
            skillsRemaining,
        });
    } catch (error) {
        console.error("Stats API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}