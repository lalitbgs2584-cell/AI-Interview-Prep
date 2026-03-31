import { prisma } from "@repo/db/prisma-db";
import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      redirect("/login");
    }

    const file = await prisma.file.findFirst({
      where: { userId: session.user.id },
    });

    if (!file) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      resumeUrl: file.url?.split("uploads/")[1] || null, 
      resumeFileName: file.OriginalFileName,
    });
  } catch (error) {
    console.error("Error getting resume:", error);
    return NextResponse.json(
      { error: "Failed to get resume" },
      { status: 500 }
    );
  }
}