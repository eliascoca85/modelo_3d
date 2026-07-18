import crypto from "node:crypto";

import { supabase } from "@/lib/supabase";

// Usuarios del admin en Supabase + hashing de contraseñas con scrypt (nativo
// de Node, sin dependencias).
//
// Antes esto leía/escribía data/users.json en el FS con contraseñas en plano;
// ahora la tabla `users` guarda `password_hash` (scrypt + salt) y el servidor
// nunca devuelve el hash al cliente. El tipo `User` ya no incluye `password`.
// Local y Vercel comparten la misma DB.

export type User = {
  id: string;
  username: string;
  role: "admin" | "editor";
  createdAt: string;
};

// --- Hashing (scrypt) ----------------------------------------------------

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const hash = Buffer.from(hashHex, "hex");
    const test = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), hash.length);
    return crypto.timingSafeEqual(hash, test);
  } catch {
    return false;
  }
}

// --- Mapeo fila DB -> User (sin password_hash) --------------------------

function userFromDb(r: {
  id: string;
  username: string;
  role: string;
  created_at: string | null;
}): User {
  return {
    id: r.id,
    username: r.username,
    role: r.role as "admin" | "editor",
    createdAt: r.created_at ?? new Date(0).toISOString(),
  };
}

const SELECT = "id, username, role, created_at";

// --- Operaciones ---------------------------------------------------------

export async function readUsers(): Promise<User[]> {
  const { data, error } = await supabase.from("users").select(SELECT);
  if (error) throw error;
  return (data ?? []).map(userFromDb);
}

export async function findUserById(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from("users")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return userFromDb(data);
}

export async function userExists(
  username: string,
  excludeId?: string,
): Promise<boolean> {
  let query = supabase
    .from("users")
    .select("id")
    .ilike("username", username);
  if (excludeId) {
    query = query.neq("id", excludeId);
  }
  const { data, error } = await query.maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/**
 * Verifica credenciales para el login. Trae el password_hash de la DB y
 * compara con scrypt. Devuelve el User (sin hash) si coincide, o null.
 * Reemplaza al findUserByUsername + comparación en plano del login viejo.
 */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<User | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, role, created_at, password_hash")
    .ilike("username", username)
    .maybeSingle();
  if (error || !data) return null;
  if (!verifyPassword(password, data.password_hash)) return null;
  return userFromDb(data);
}

export async function createUser(data: {
  username: string;
  password: string;
  role: "admin" | "editor";
}): Promise<User> {
  const username = data.username.trim();
  const { data: row, error } = await supabase
    .from("users")
    .insert({
      username,
      password_hash: hashPassword(data.password),
      role: data.role,
    })
    .select(SELECT)
    .single();
  if (error) {
    // 23505 = unique_violation (username ya existe). El action ya lo valida
    // antes con userExists, pero cubrimos la carrera por las dudas.
    if (error.code === "23505") {
      throw new Error("El nombre de usuario ya está en uso");
    }
    throw error;
  }
  return userFromDb(row);
}

export async function updateUser(
  id: string,
  data: Partial<Omit<User, "id" | "createdAt">> & { password?: string },
): Promise<User | null> {
  const patch: Record<string, string> = {};
  if (data.username !== undefined) patch.username = data.username.trim();
  if (data.password !== undefined) patch.password_hash = hashPassword(data.password);
  if (data.role !== undefined) patch.role = data.role;

  const { data: row, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", id)
    .select(SELECT)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      throw new Error("El nombre de usuario ya está en uso");
    }
    throw error;
  }
  return row ? userFromDb(row) : null;
}

export async function deleteUser(id: string): Promise<boolean> {
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export function validateUserData(data: {
  username: string;
  password: string;
  role: string;
}): { valid: boolean; error?: string } {
  if (!data.username || data.username.trim().length < 3) {
    return { valid: false, error: "El usuario debe tener al menos 3 caracteres" };
  }
  if (data.username.trim().length > 30) {
    return { valid: false, error: "El usuario no puede superar los 30 caracteres" };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(data.username.trim())) {
    return { valid: false, error: "Solo letras, números y guiones bajos" };
  }
  if (!data.password || data.password.length < 4) {
    return { valid: false, error: "La contraseña debe tener al menos 4 caracteres" };
  }
  if (data.password.length > 50) {
    return { valid: false, error: "La contraseña no puede superar los 50 caracteres" };
  }
  if (!["admin", "editor"].includes(data.role)) {
    return { valid: false, error: "Rol inválido" };
  }
  return { valid: true };
}
