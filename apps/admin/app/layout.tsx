import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layouts/Sidebar";

export const metadata: Metadata = {
  title: "Admin - InterviewAI",
  description: "Admin control center for the InterviewAI platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="noise" />
        <div className="admin-shell">
          <Sidebar />
          {children}
        </div>
      </body>
    </html>
  );
}
