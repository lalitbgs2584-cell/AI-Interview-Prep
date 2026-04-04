import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

import { ensureRecordingDirectory } from "@/lib/interview-recordings.server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const interviewId = String(formData.get("interviewId") ?? "").trim();

  if (!file || !interviewId) {
    return NextResponse.json(
      { message: "Recording file and interview ID are required." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const extension = path.extname(file.name || "").toLowerCase() || ".webm";
  const filename = `interview-${interviewId}-${timestamp}${extension}`;

  const recordingsDir = await ensureRecordingDirectory();
  const savePath = path.join(recordingsDir, filename);
  await writeFile(savePath, buffer);

  return NextResponse.json({ saved: filename });
}
