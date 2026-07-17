"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import Sidebar from "@/components/admin/sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const segment = useSelectedLayoutSegment();

  if (segment === "login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-[#060916]">
      <Sidebar />
      <main className="ml-64 flex-1">
        {children}
      </main>
    </div>
  );
}