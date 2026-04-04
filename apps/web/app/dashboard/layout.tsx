import type { Metadata } from "next";
import "@/components/dashboard/dashboard-components/styles/index.css";

export const metadata: Metadata = {
  title: "InterviewAI - Dashboard",
  description: "AI-powered interview practice platform",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
