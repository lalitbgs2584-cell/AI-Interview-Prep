import { Request } from "express";
import { auth } from "@repo/auth/server";

export function normalizeHeaders(
  headers: Request["headers"]
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const key in headers) {
    const value = headers[key];

    if (typeof value === "string") {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value.join(", ");
    }
  }
  console.log("Result of headers: ",result)
  return result;
}

export const getUserIdFromRequest = async (
  req: Request
): Promise<string | null> => {
  try {
    const session = await auth.api.getSession({
      headers: normalizeHeaders(req.headers),
    });

    return session?.user?.id ?? null;
  } catch (error) {
    console.error("Error fetching session:", error);
    return null;
  }
};