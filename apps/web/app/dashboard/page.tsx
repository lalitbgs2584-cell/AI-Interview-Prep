import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import React from "react";

import DashboardApp from "@/components/dashboard/dashboard-components/pages/DashboardApp";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }
  console.log(session)
  return <DashboardApp user={session.user} />;
}