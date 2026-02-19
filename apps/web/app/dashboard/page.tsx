import DashboardPage from "@/components/dashboard/dashboard";
import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import React from 'react'

const Dashboard = async () => {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if(!session){
    redirect("/login")
  }
  return (
    <>
      <DashboardPage/>
    </>
  )
}

export default Dashboard