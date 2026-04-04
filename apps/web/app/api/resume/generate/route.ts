import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";

import { generateResumeWithAi } from "@/lib/resume-ai";
import { normalizeBuilderData, profileToResumeBuilderData } from "@/lib/resume-builder-core";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const incoming = normalizeBuilderData(body ?? {});

    const profile = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
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
        interviews: {
          select: {
            id: true,
            title: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 8,
        },
        resumes: {
          include: {
            insights: true,
            workExperience: true,
            education: true,
            projects: true,
          },
          take: 1,
        },
      },
    });

    const base = profileToResumeBuilderData(profile);
    const merged = normalizeBuilderData({
      ...base,
      ...incoming,
      skills: {
        core: incoming.skills.core.length ? incoming.skills.core : base.skills.core,
        tools: incoming.skills.tools.length ? incoming.skills.tools : base.skills.tools,
        platforms: incoming.skills.platforms.length ? incoming.skills.platforms : base.skills.platforms,
      },
      experience: incoming.experience.some((entry) => entry.company || entry.title || entry.bullets.some(Boolean))
        ? incoming.experience
        : base.experience,
      education: incoming.education.some((entry) => entry.institution || entry.degree)
        ? incoming.education
        : base.education,
      projects: incoming.projects.some((entry) => entry.name || entry.bullets.some(Boolean))
        ? incoming.projects
        : base.projects,
      achievements: incoming.achievements.length ? incoming.achievements : base.achievements,
      certifications: incoming.certifications.length ? incoming.certifications : base.certifications,
    });

    const generated = await generateResumeWithAi(merged);

    return NextResponse.json(generated);
  } catch (error) {
    console.error("Resume generate route failed:", error);
    return NextResponse.json({ error: "Failed to generate resume." }, { status: 500 });
  }
}
