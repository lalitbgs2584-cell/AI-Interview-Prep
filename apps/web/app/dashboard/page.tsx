import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import React from "react";

type UserRole = "USER" | "ADMIN";

import DashboardApp from "@/components/dashboard/dashboard-components/pages/DashboardApp";

export default async function DashboardPage() {
  let session = null;
  try {
    session = await auth.api.getSession({
      headers: await headers(),
    });
  } catch (error) { }

  if (!session) redirect("/login");

  const user = {
    ...session.user,
    role: session.user.role as UserRole,
  };

  return <DashboardApp user={user} />;
}