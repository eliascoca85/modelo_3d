// Crea el usuario admin inicial en la DB de Supabase (idempotente).
//
// Uso:
//   node --env-file=.env.local scripts/seed.mjs
//
// Duplica el hashing scrypt de lib/users.ts (no se puede importar el .ts sin
// compilar). Si querés otro usuario/contraseña, pasalos como env:
//   ADMIN_USERNAME=otro ADMIN_PASSWORD=supersegura node --env-file=.env.local scripts/seed.mjs
//
// Como local y Vercel comparten la misma Supabase, correrlo una sola vez
// alcanza para ambos entornos.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Correlo con --env-file=.env.local.",
  );
  process.exit(1);
}

// La URL base del proyecto, ej: https://<project-ref>.supabase.co
// NO debe llevar /rest/v1 al final (el SDK lo agrega solo) ni esquema distinto.
if (!/^https?:\/\/[^\s/]+/i.test(url) || /\/rest\/v1\/?$/i.test(url)) {
  console.error("SUPABASE_URL inválida. Tiene que ser la URL base del proyecto, ej:");
  console.error("  https://cqiznpqnrpiiehkfjein.supabase.co");
  console.error("Sacá el /rest/v1 final (el SDK ya lo agrega) y que empiece con https://");
  process.exit(1);
}

const username = process.env.ADMIN_USERNAME || "admin";
const password = process.env.ADMIN_PASSWORD || "admin123";

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error } = await supabase
  .from("users")
  .upsert(
    { username, password_hash: hashPassword(password), role: "admin" },
    { onConflict: "username" },
  );

if (error) {
  console.error("No se pudo crear el usuario admin:", error.message);
  console.error(
    "¿Corriste supabase/schema.sql en el SQL Editor de Supabase para crear la tabla users?",
  );
  process.exit(1);
}

console.log(`✔ Usuario admin listo: "${username}" / "${password}"`);
console.log("  Local y Vercel comparten esta DB: no hace falta repetir el seed.");
