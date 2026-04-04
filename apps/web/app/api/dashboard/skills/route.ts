// app/api/dashboard/skills/route.ts

import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers() 
    })
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const oneMonthAgo = new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000);

    // " Get all user skills
    const userSkills = await prisma.userSkill.findMany({
      where: { userId },
      include: { skill: true },
    });

    // " Get all completed interviews in the last month
    const recentInterviews = await prisma.interview.findMany({
      where: {
        userId,
        status: "COMPLETED",
        completedAt: { gte: oneMonthAgo },
      },
      include: {
        questions: {
          select: {
            response: {
              select: {
                evaluation: {
                  select: {
                    // Using the correct fields from your schema
                    overallScore100: true,  // 0-100 score
                    overallScore: true,     // 0-10 score
                    dimensions: true,       // JSON field with dimension scores
                  },
                },
              },
            },
          },
        },
      },
    });

    // " Calculate skill scores based on interview performance
    const skillScoreMap = new Map<string, number[]>();

    // Initialize skill scores with empty arrays
    userSkills.forEach((us: any) => {
      skillScoreMap.set(us.skill.name, []);
    });

    // Aggregate scores from interviews
    recentInterviews.forEach((interview: any) => {
      interview.questions.forEach((q: any) => {
        if (q.response?.evaluation?.overallScore100) {
          const score = q.response.evaluation.overallScore100;

          // Try to extract dimension scores if available
          if (q.response.evaluation.dimensions) {
            try {
              const dimensions = JSON.parse(
                typeof q.response.evaluation.dimensions === "string"
                  ? q.response.evaluation.dimensions
                  : JSON.stringify(q.response.evaluation.dimensions)
              );

              // Check if dimensions has skill-specific scores
              // Adjust key names based on your actual dimension structure
              const skillKeyMap: Record<string, string[]> = {
                "Technical Depth": ["correctness", "depth", "clarity", "communication"],
                "Communication": ["clarity", "communication"],
                "Problem Solving": ["correctness", "depth"],
              };

              Object.entries(skillKeyMap).forEach(([skillName, _keys]) => {
                if (skillScoreMap.has(skillName) && dimensions[skillName]) {
                  skillScoreMap.get(skillName)!.push(dimensions[skillName]);
                }
              });
            } catch (e) {
              // If parsing fails, fall back to generic distribution
              userSkills.forEach((us) => {
                skillScoreMap.get(us.skill.name)!.push(score);
              });
            }
          } else {
            // Fallback: distribute interview score evenly across all skills
            userSkills.forEach((us) => {
              skillScoreMap.get(us.skill.name)!.push(score);
            });
          }
        }
      });
    });

    // " Calculate average scores for each skill
    const skillsWithScores = userSkills.map((us) => {
      const scores = skillScoreMap.get(us.skill.name) || [];
      const avgScore =
        scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 50;

      return {
        skill: us.skill.name,
        score: Math.min(100, Math.max(0, avgScore)), // Clamp 0-100
        category: us.skill.category,
      };
    });

    // " Sort by score (descending) for better UX
    skillsWithScores.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      skills: skillsWithScores,
      total: skillsWithScores.length,
      period: "Last 30 days",
      interviewsAnalyzed: recentInterviews.length,
    });
  } catch (error) {
    console.error("Skills API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}