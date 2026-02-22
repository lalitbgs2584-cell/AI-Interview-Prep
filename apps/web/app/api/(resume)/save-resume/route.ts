import { prisma } from "@repo/db/prisma-db";
import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      redirect("/login");
    }

    const { fileUrl, fileName } = await req.json();

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        resumeUrl: fileUrl,
        resumeFileName: fileName,
        isResumeUploaded: true,
        resumeUploadedAt: new Date(),
      },
    });

    // ✅ Must return a response — without this Next.js returns 500
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error("Error saving resume:", error);
    return NextResponse.json(
      { error: "Failed to save resume" },
      { status: 500 }
    );
  }
}