import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";

import { normalizeBuilderData } from "@/lib/resume-builder-core";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const latexCode = typeof body?.latexCode === "string" ? body.latexCode : "";

    if (!latexCode.trim()) {
      return NextResponse.json({ error: "LaTeX code is required." }, { status: 400 });
    }

    const normalized = normalizeBuilderData(body?.sourceData ?? {});
    const payload: any = {
      title: typeof body?.title === "string" && body.title.trim() ? body.title.trim() : `${normalized.fullName || "Candidate"} Resume`,
      latexCode,
      atsScore: Number.isFinite(body?.atsScore) ? Number(body.atsScore) : 0,
      targetRole: normalized.targetRole || null,
      jobDescription: normalized.jobDescription || null,
      atsBreakdown: JSON.parse(JSON.stringify(body?.ats ?? body?.atsBreakdown ?? {})),
      sourceData: JSON.parse(JSON.stringify(normalized)),
    };

    let record;
    if (typeof body?.id === "string" && body.id.trim()) {
      const existing = await prisma.generatedResume.findFirst({
        where: {
          id: body.id,
          userId: session.user.id,
        },
      });

      if (!existing) {
        return NextResponse.json({ error: "Resume not found." }, { status: 404 });
      }

      record = await prisma.generatedResume.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      record = await prisma.generatedResume.create({
        data: {
          userId: session.user.id,
          ...payload,
        },
      });
    }

    return NextResponse.json({
      id: record.id,
      title: record.title,
      atsScore: record.atsScore,
      updatedAt: record.updatedAt,
    });
  } catch (error) {
    console.error("Resume save route failed:", error);
    return NextResponse.json({ error: "Failed to save resume." }, { status: 500 });
  }
}

