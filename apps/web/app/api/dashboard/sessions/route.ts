// app/api/dashboard/sessions/route.ts
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

        // " Fetch recent interviews with full context
        const interviews = await prisma.interview.findMany({
            where: {
                userId,
                status: "COMPLETED", // Only show completed interviews
            },
            include: {
                questions: {
                    select: {
                        response: {
                            select: {
                                evaluation: {
                                    select: {
                                        // Using the correct fields from your schema
                                        overallScore100: true, // 0-100 score
                                        overallScore: true,    // 0-10 score (fallback)
                                    },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: { completedAt: "desc" },
            take: 10, // Get last 10 sessions
        });

        // " Transform to frontend format
        const transformedInterviews = interviews.map((interview) => {
            // Get scores from all questions in the interview
            const questionScores = interview.questions
                .map((q) => {
                    const evalData = q.response?.evaluation;

                    if (!evalData) return null;

                    if (evalData.overallScore100 != null) {
                        return evalData.overallScore100;
                    }

                    if (evalData.overallScore != null) {
                        return evalData.overallScore * 10;
                    }

                    return null;
                })
                .filter((score): score is number => score != null);

            // Calculate average score for this interview
            const avgScore =
                questionScores.length > 0
                    ? Math.round(questionScores.reduce((a, b) => a + b, 0) / questionScores.length)
                    : 0;

            // Determine status from score
            const status = avgScore >= 75 ? "high" : avgScore >= 60 ? "medium" : "low";

            // Estimate duration (using a default if not available)
            // Note: Your schema doesn't have a duration field in Interview
            // You may need to add it or calculate from questions
            const durationMinutes = interview.questions.length * 5; // Rough estimate: 5 min per question

            return {
                id: interview.id,
                title: interview.title,
                type: interview.type || "TECHNICAL",
                score: avgScore,
                date: interview.completedAt || interview.createdAt,
                duration: durationMinutes,
                status,
            };
        });

        return NextResponse.json({
            interviews: transformedInterviews,
            total: transformedInterviews.length,
        });
    } catch (error) {
        console.error("Sessions API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}