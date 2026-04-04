import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@repo/auth/server";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const latexCode = typeof body?.latexCode === "string" ? body.latexCode : "";

    if (!latexCode.trim()) {
      return NextResponse.json({ error: "LaTeX code is required." }, { status: 400 });
    }

    const compileUrl = new URL("https://latexonline.cc/compile");
    compileUrl.searchParams.set("text", latexCode);
    compileUrl.searchParams.set("command", "pdflatex");
    compileUrl.searchParams.set("force", "true");

    const compileResponse = await fetch(compileUrl.toString(), {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/pdf",
      },
    });

    if (!compileResponse.ok) {
      const errorText = await compileResponse.text();
      return NextResponse.json(
        {
          error: "Compilation failed.",
          details: errorText.slice(0, 2000),
        },
        { status: 400 },
      );
    }

    const pdfBuffer = Buffer.from(await compileResponse.arrayBuffer());

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Resume compile route failed:", error);
    return NextResponse.json({ error: "Failed to compile resume." }, { status: 500 });
  }
}
