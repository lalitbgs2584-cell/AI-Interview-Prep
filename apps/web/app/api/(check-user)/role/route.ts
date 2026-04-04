import { auth } from "@repo/auth/server";
import { NextRequest } from "next/server";

export async function GET(req:NextRequest) {
  const user = await requireAdmin(req);

  return Response.json({ message: "Admin data" });
}

export async function requireAdmin(req:NextRequest) {
  const session = await auth.api.getSession({
    headers: req.headers
  });

  if (!session || session.user.role !== "admin") {
    throw new Error("Unauthorized");
  }

  return session.user;
}