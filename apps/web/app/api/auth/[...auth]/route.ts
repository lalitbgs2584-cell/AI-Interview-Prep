import { NextRequest, NextResponse } from "next/server";
import { auth } from "@repo/auth/server";

export async function GET(request: NextRequest) {
  return auth.handler(request);
}

export async function POST(request: NextRequest) {
  return auth.handler(request);
}
