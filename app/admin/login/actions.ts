"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifyCredentials } from "@/lib/users";

const AUTH_COOKIE = "museo_admin_session";

export async function loginAction(
  _prevState: { ok: boolean; message?: string },
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const user = String(formData.get("username") ?? "");
  const pass = String(formData.get("password") ?? "");

  if (!user || !pass) {
    return { ok: false, message: "Completá todos los campos" };
  }

  const found = await verifyCredentials(user, pass);
  if (!found) {
    return { ok: false, message: "Usuario o contraseña incorrectos" };
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, `user:${found.id}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  redirect("/admin/cuadros");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
  revalidatePath("/");
  redirect("/admin/login");
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const value = cookieStore.get(AUTH_COOKIE)?.value;
  if (!value) return false;
  return value.startsWith("user:");
}