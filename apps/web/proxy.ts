import { auth } from "@repo/auth/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/", "/login", "/signup",
  "/api/auth",           // ✅ Better Auth OAuth routes
  "/api/auth/callback",  // ✅ Google/GitHub callbacks
  "/api/auth/signin", 
  "/api/auth/callback/google",
  "/api/auth/callback/github"
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ Allow public routes
  const isPublic = PUBLIC_ROUTES.some(route =>
    pathname === route || pathname.startsWith(route + "/")
  );

  if (isPublic) {
    return NextResponse.next();
  }

  // ✅ Get session using Better Auth
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};