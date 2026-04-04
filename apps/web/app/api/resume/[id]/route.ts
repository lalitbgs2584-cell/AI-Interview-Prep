import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const resume = await prisma.generatedResume.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!resume) {
      return NextResponse.json({ error: "Resume not found." }, { status: 404 });
    }

    return NextResponse.json({ resume });
  } catch (error) {
    console.error("Resume detail route failed:", error);
    return NextResponse.json({ error: "Failed to fetch resume." }, { status: 500 });
  }
}
