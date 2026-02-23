import { prisma } from "@repo/db/prisma-db";
import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { fileUrl, fileName,mime,S3fileName } = await req.json();

    // Create file entry (if you actually need it)
    const file = await prisma.file.create({
      data: {
        userId: session.user.id,   
        url: fileUrl,              // assuming your model has this
        OriginalFileName: fileName,
        fileType: mime,
        status: "UPLOADED",
        S3FileName: S3fileName
      }
    });

    // Update user resume info
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        isResumeUploaded: true,
      },
    });

    return NextResponse.json({ 
      success: true,
      fileId: file.id
     }, { status: 200 });

  } catch (error) {
    console.error("Error saving resume:", error);

    return NextResponse.json(
      { error: "Failed to save resume" },
      { status: 500 }
    );
  }
}