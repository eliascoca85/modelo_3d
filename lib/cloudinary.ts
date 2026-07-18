import crypto from "node:crypto";

import { v2 as cloudinary } from "cloudinary";

// Cliente de Cloudinary para subir y eliminar las imágenes de los cuadros.
// Configurado con credenciales server-side (CLOUDINARY_*). Al igual que
// Supabase, esto corre solo en el servidor; las env vars no llevan
// NEXT_PUBLIC_ para no exponerse al browser.
//
// Las imágenes viven en la carpeta "museo" de Cloudinary. Guardamos el
// `public_id` devuelto en la DB (columna `image_public_id`) para poder borrar
// la imagen vieja al reemplazarla o al "Eliminar imagen" desde el admin.
//
// Configuración LAZY (mismo motivo que lib/supabase.ts): configuramos Cloudinary
// recién en el primer upload/delete, para que `next build` no se caiga por
// falta de env vars al evaluar el grafo de módulos.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Configurala en .env.local y, para Vercel, en Project Settings → Environment Variables.`,
    );
  }
  return value;
}

let configured = false;
function ensureConfig(): void {
  if (configured) return;
  cloudinary.config({
    cloud_name: requireEnv("CLOUDINARY_CLOUD_NAME"),
    api_key: requireEnv("CLOUDINARY_API_KEY"),
    api_secret: requireEnv("CLOUDINARY_API_SECRET"),
  });
  configured = true;
}

export type UploadedImage = {
  url: string;
  publicId: string;
};

/**
 * Sube un buffer de imagen WebP a Cloudinary. Devuelve la URL pública (secure)
 * y el `public_id` para poder eliminarla después.
 *
 * Usamos `upload_stream` envuelto en una Promise: el stream se alimenta con
 * `end(buffer)` y resolvemos en el callback. Es el patrón robusto y compatible
 * entre versiones del SDK para subir desde un Buffer sin archivo en disco.
 */
export function uploadCuadroImage(
  name: string,
  buffer: Uint8Array,
  mime: string,
): Promise<UploadedImage> {
  if (mime !== "image/webp") {
    return Promise.reject(new Error("Tipo de archivo no soportado"));
  }
  ensureConfig();

  const publicIdSuffix = crypto.randomBytes(6).toString("hex");
  const publicId = `museo/${name.toLowerCase()}-${publicIdSuffix}`;

  return new Promise<UploadedImage>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder: "museo",
        public_id: publicId,
        overwrite: false,
        unique_filename: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result?.secure_url || !result?.public_id) {
          reject(new Error("Cloudinary no devolvió una URL válida"));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(Buffer.from(buffer));
  });
}

/**
 * Elimina una imagen de Cloudinary por `public_id`. Best-effort: si ya no
 * existe o falla, se loguea y se resuelve OK para no bloquear el guardado del
 * cuadro (la fila de la DB ya quedó sin image_url).
 */
export async function deleteCloudinaryImage(publicId: string): Promise<void> {
  ensureConfig();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (error) {
    console.warn("Cloudinary: no se pudo eliminar la imagen", publicId, error);
  }
}
