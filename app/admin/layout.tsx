"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { Toaster } from "sonner";
import Sidebar from "@/components/admin/sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const segment = useSelectedLayoutSegment();

  return (
    <>
      {segment === "login" ? (
        <>{children}</>
      ) : (
        <div className="flex min-h-screen bg-[#060916]">
          <Sidebar />
          <main className="ml-64 flex-1">{children}</main>
        </div>
      )}
      {/* Notificaciones (subir imagen, crear/editar/borrar usuario, etc.) */}
      <Toaster
        position="bottom-right"
        theme="dark"
        richColors
        closeButton
        toastOptions={{
          style: { fontFamily: "var(--font-geist-sans)" },
        }}
      />
    </>
  );
}