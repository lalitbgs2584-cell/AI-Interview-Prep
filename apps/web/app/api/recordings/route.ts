import { NextRequest, NextResponse } from "next/server";

import { listStoredRecordings } from "@/lib/interview-recordings.server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const interviewId = searchParams.get("interviewId")?.trim();

  const recordings = await listStoredRecordings(interviewId);
  return NextResponse.json({ recordings });
}
