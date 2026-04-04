import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";

import { resolveStoredRecordingPath } from "@/lib/interview-recordings.server";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> },
) {
  const { name } = await ctx.params;

  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return new NextResponse("Invalid recording name", { status: 400 });
  }

  const fullPath = await resolveStoredRecordingPath(name);
  if (!fullPath) {
    return new NextResponse("Recording not found", { status: 404 });
  }

  try {
    const data = await fs.readFile(fullPath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": name.toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/webm",
        "Content-Length": data.length.toString(),
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new NextResponse("Recording not found", { status: 404 });
  }
}
