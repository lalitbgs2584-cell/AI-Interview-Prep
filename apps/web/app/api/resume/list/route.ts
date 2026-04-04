import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resumes = await prisma.generatedResume.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        atsScore: true,
        targetRole: true,
        createdAt: true,
        updatedAt: true,
        atsBreakdown: true,
      },
    });

    return NextResponse.json({ resumes });
  } catch (error) {
    console.error("Resume list route failed:", error);
    return NextResponse.json({ error: "Failed to fetch resumes." }, { status: 500 });
  }
}
