import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@repo/auth/server";

import ResumeBuilderClient from "@/components/resume/ResumeBuilderClient";

export default async function ResumeBuilderPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  }).catch(() => null);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return <ResumeBuilderClient />;
}
