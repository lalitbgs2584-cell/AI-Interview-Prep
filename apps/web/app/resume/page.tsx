import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@repo/auth/server";

import ResumeListClient from "@/components/resume/ResumeListClient";

export default async function ResumeListPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  }).catch(() => null);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return <ResumeListClient />;
}
