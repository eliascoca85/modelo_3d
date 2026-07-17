"use server";

import { revalidatePath } from "next/cache";
import {
  createUser,
  deleteUser,
  findUserById,
  readUsers,
  updateUser,
  userExists,
  validateUserData,
  type User,
} from "@/lib/users";

export type UserActionState = {
  ok: boolean;
  message?: string;
  user?: User;
};

const INITIAL_STATE: UserActionState = { ok: false };

export async function listUsersAction(): Promise<User[]> {
  return readUsers();
}

export async function createUserAction(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "editor") as "admin" | "editor";

  const validation = validateUserData({ username, password, role });
  if (!validation.valid) {
    return { ok: false, message: validation.error };
  }

  const exists = await userExists(username);
  if (exists) {
    return { ok: false, message: "El nombre de usuario ya está en uso" };
  }

  try {
    const user = await createUser({ username, password, role });
    revalidatePath("/admin/usuarios");
    return { ok: true, message: "Usuario creado correctamente", user };
  } catch (err) {
    const m = err instanceof Error ? err.message : "Error desconocido";
    return { ok: false, message: m };
  }
}

export async function updateUserAction(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const id = String(formData.get("id") ?? "");
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "editor") as "admin" | "editor";

  const existing = await findUserById(id);
  if (!existing) {
    return { ok: false, message: "Usuario no encontrado" };
  }

  if (username !== existing.username || password) {
    const validation = validateUserData({
      username,
      password: password || "dummy1234",
      role,
    });
    if (!validation.valid) {
      return { ok: false, message: validation.error };
    }
  }

  const dupExists = await userExists(username, id);
  if (dupExists) {
    return { ok: false, message: "El nombre de usuario ya está en uso" };
  }

  try {
    const updated = await updateUser(id, {
      username,
      ...(password ? { password } : {}),
      role,
    });
    revalidatePath("/admin/usuarios");
    return { ok: true, message: "Usuario actualizado", user: updated ?? undefined };
  } catch (err) {
    const m = err instanceof Error ? err.message : "Error desconocido";
    return { ok: false, message: m };
  }
}

export async function deleteUserAction(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const id = String(formData.get("id") ?? "");

  const existing = await findUserById(id);
  if (!existing) {
    return { ok: false, message: "Usuario no encontrado" };
  }

  if (existing.role === "admin") {
    const users = await readUsers();
    const adminCount = users.filter((u) => u.role === "admin").length;
    if (adminCount <= 1) {
      return { ok: false, message: "No se puede eliminar el último administrador" };
    }
  }

  try {
    await deleteUser(id);
    revalidatePath("/admin/usuarios");
    return { ok: true, message: "Usuario eliminado" };
  } catch (err) {
    const m = err instanceof Error ? err.message : "Error desconocido";
    return { ok: false, message: m };
  }
}