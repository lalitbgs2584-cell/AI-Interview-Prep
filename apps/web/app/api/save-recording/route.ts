import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const interviewId = formData.get("interviewId") as string;

  const buffer = Buffer.from(await file.arrayBuffer());
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `interview-${interviewId}-${timestamp}.webm`;

  const savePath = path.join(process.cwd(), "recordings", filename);
  await writeFile(savePath, buffer);

  return NextResponse.json({ saved: filename });
}