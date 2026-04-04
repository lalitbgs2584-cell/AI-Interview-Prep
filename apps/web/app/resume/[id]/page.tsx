import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@repo/auth/server";

import ResumeDetailClient from "@/components/resume/ResumeDetailClient";

export default async function ResumeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  }).catch(() => null);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  return <ResumeDetailClient resumeId={id} />;
}
