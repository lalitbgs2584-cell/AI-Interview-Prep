// app/api/user/profile/route.ts

import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * GET /api/user/profile
 * 
 * Fetches complete user profile data including:
 * - User identity info (name, email, role, avatar)
 * - Streak data (current streak, best streak)
 * - Login tracking (lastLoginAt)
 * - Activity map (daily session counts)
 * - All interviews with evaluations
 * - Skills data
 * - Resume data (with insights)
 */
export async function GET(request: Request) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        // Fetch complete user profile
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                // ── Basic user data ──
                // name, email, role, etc. are already on User model

                // ── Interviews with all nested data ──
                interviews: {
                    include: {
                        questions: {
                            include: {
                                question: {
                                    select: {
                                        difficulty: true,
                                        type: true,
                                    },
                                },
                                response: {
                                    select: {
                                        evaluation: {
                                            select: {
                                                overallScore: true,
                                                overallScore100: true,
                                                clarity: true,
                                                technical: true,
                                                confidence: true,
                                                feedback: true,
                                                strengths: true,
                                                improvements: true,
                                                verdict: true,
                                                dimensions: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { createdAt: "desc" },
                },

                // ── Skills data ──
                skills: {
                    include: {
                        skill: {
                            select: {
                                name: true,
                                category: true,
                            },
                        },
                    },
                },

                // ── Resume data ──
                resumes: {
                    include: {
                        insights: {
                            select: {
                                experienceLevel: true,
                                keySkills: true,
                                ATSSCORE: true,
                                strongDomains: true,
                                weakAreas: true,
                            },
                        },
                        workExperience: {
                            select: {
                                company: true,
                                role: true,
                                duration: true,
                            },
                        },
                        education: {
                            select: {
                                institution: true,
                                degree: true,
                                grade: true,
                            },
                        },
                        projects: {
                            select: {
                                title: true,
                                techStack: true,
                            },
                        },
                    },
                },
            },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Transform and return profile data matching ProfilePageProps interface
        return NextResponse.json({
            user: {
                name: user.name,
                email: user.email,
                avatar: user.image,
                role: user.role,
                createdAt: user.createdAt,
                streak: user.streak,
                bestStreak: user.bestStreak,
                lastLoginAt: user.lastLoginAt,
                activityMap: JSON.parse(JSON.stringify(user.activityMap ?? {})),
                skills: user.skills.map((us) => ({
                    skill: {
                        name: us.skill.name,
                        category: us.skill.category,
                    },
                })),
                interviews: user.interviews.map((iv) => ({
                    id: iv.id,
                    title: iv.title,
                    type: iv.type,
                    status: iv.status,
                    createdAt: iv.createdAt,
                    completedAt: iv.completedAt,
                    questions: iv.questions.map((q) => ({
                        score: q.score,
                        order: q.order,
                        question: {
                            difficulty: q.question.difficulty,
                            type: q.question.type,
                        },
                        response: q.response
                            ? {
                                evaluation: q.response.evaluation
                                    ? {
                                        overallScore: q.response.evaluation.overallScore,
                                        overallScore100: q.response.evaluation.overallScore100,
                                        clarity: q.response.evaluation.clarity,
                                        technical: q.response.evaluation.technical,
                                        confidence: q.response.evaluation.confidence,
                                        feedback: q.response.evaluation.feedback,
                                        strengths: q.response.evaluation.strengths
                                            ? Array.isArray(q.response.evaluation.strengths)
                                                ? q.response.evaluation.strengths.join(", ")
                                                : q.response.evaluation.strengths
                                            : null,
                                        improvements: q.response.evaluation.improvements
                                            ? Array.isArray(q.response.evaluation.improvements)
                                                ? q.response.evaluation.improvements.join(", ")
                                                : q.response.evaluation.improvements
                                            : null,
                                        verdict: q.response.evaluation.verdict,
                                    }
                                    : null,
                            }
                            : null,
                    })),
                })),
                resumes: user.resumes.map((r) => ({
                    insights: r.insights
                        ? {
                            experienceLevel: r.insights.experienceLevel,
                            keySkills: r.insights.keySkills,
                            ATSSCORE: r.insights.ATSSCORE,
                            strongDomains: r.insights.strongDomains,
                            weakAreas: r.insights.weakAreas,
                        }
                        : null,
                    workExperience: r.workExperience,
                    education: r.education,
                    projects: r.projects,
                })),
            },
        });
    } catch (error) {
        console.error("Profile API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}