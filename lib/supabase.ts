import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente server-side de Supabase con la service role key.
//
// La service role key bypasa RLS, así que este cliente SOLO se usa en el
// servidor (server components y "use server" actions). Jamás se importa desde
// un componente cliente ni se le antepone NEXT_PUBLIC_ a las env vars, para que
// no terminen bundladas para el browser.
//
// Inicialización LAZY: si validáramos las env vars al importar el módulo,
// `next build` (que "collect page data" y evalúa el grafo de módulos) rompería
// entero cuando falte alguna var, aunque sea para rutas que no la usan. Acá el
// cliente se crea recién en el primer uso real (request); si falta una var, se
// lanza un error claro desde esa ruta, sin tocar el resto.
//
// Local y Vercel apuntan a la misma DB (mismas SUPABASE_URL/KEY).

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Configurala en .env.local y, para Vercel, en Project Settings → Environment Variables.`,
    );
  }
  return value;
}

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return client;
}

// Proxy para mantener la API `supabase.from("...").select(...)` sin que los
// call sites cambien; solo el primer acceso materializa el cliente.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getClient();
    const value = Reflect.get(c, prop);
    return typeof value === "function" ? (value as Function).bind(c) : value;
  },
});
