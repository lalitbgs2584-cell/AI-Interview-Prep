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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      resumeUrl: user.resumeUrl?.split("uploads/")[1] || null, 
      resumeFileName: user.resumeFileName,
    });
        


  } catch (error) {
    console.error("Error getting resume:", error);
    return NextResponse.json(
      { error: "Failed to get resume" },
      { status: 500 }
    );
  }
}