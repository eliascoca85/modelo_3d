import { promises as fs } from "fs";
import path from "path";

export type User = {
  id: string;
  username: string;
  password: string;
  role: "admin" | "editor";
  createdAt: string;
};

type UsersStore = { users: User[] };

function getStorePath(): string {
  return path.join(process.cwd(), "data", "users.json");
}

export async function readUsers(): Promise<User[]> {
  const filePath = getStorePath();
  const data = await fs.readFile(filePath, "utf-8");
  const store: UsersStore = JSON.parse(data);
  return store.users;
}

export async function writeUsers(users: User[]): Promise<void> {
  const filePath = getStorePath();
  const store: UsersStore = { users };
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const users = await readUsers();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase()) ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const users = await readUsers();
  return users.find((u) => u.id === id) ?? null;
}

export async function createUser(data: {
  username: string;
  password: string;
  role: "admin" | "editor";
}): Promise<User> {
  const users = await readUsers();
  const user: User = {
    id: crypto.randomUUID(),
    username: data.username.trim(),
    password: data.password,
    role: data.role,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeUsers(users);
  return user;
}

export async function updateUser(
  id: string,
  data: Partial<Omit<User, "id" | "createdAt">>,
): Promise<User | null> {
  const users = await readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;

  users[idx] = {
    ...users[idx],
    ...(data.username !== undefined && { username: data.username.trim() }),
    ...(data.password !== undefined && { password: data.password }),
    ...(data.role !== undefined && { role: data.role }),
  };
  await writeUsers(users);
  return users[idx];
}

export async function deleteUser(id: string): Promise<boolean> {
  const users = await readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return false;

  users.splice(idx, 1);
  await writeUsers(users);
  return true;
}

export async function userExists(username: string, excludeId?: string): Promise<boolean> {
  const users = await readUsers();
  return users.some(
    (u) =>
      u.username.toLowerCase() === username.toLowerCase() &&
      (excludeId ? u.id !== excludeId : true),
  );
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