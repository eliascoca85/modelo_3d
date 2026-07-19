// Persistencia de cuadros en Supabase + imágenes en Cloudinary.
//
// Antes esto leía/escribía data/cuadros.json y public/uploads/cuadros/ en el FS,
// lo cual no funciona en serverless (Vercel: FS read-only). Ahora:
//   - Las descripciones y la referencia a la imagen viven en la tabla `cuadros`
//     de Supabase (columnas: name, description, image_url, image_public_id).
//   - Las imágenes se suben a Cloudinary (lib/cloudinary.ts) y se guardan su
//     URL (image_url) + public_id (image_public_id) en la fila.
//
// El tipo público `Cuadro` ({ name, imageUrl, description }) NO incluye
// image_public_id: eso vive solo en la DB y en las acciones, para poder borrar
// la imagen vieja al reemplazarla o al "Eliminar imagen".

import { supabase } from "@/lib/supabase";
import {
  deleteCloudinaryImage,
  uploadCuadroImage,
} from "@/lib/cloudinary";
import {
  CANONICAL_CUADROS,
  emptyCuadro,
  type Cuadro,
} from "@/types/cuadros";

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const CUADRO_LIMITS = { MAX_IMAGE_BYTES };

/** Fila tal cual vive en la DB (incluye image_public_id). */
export type CuadroRow = {
  name: string;
  title: string | null;
  description: string;
  imageUrl: string | null;
  imagePublicId: string | null;
};

function rowFromDb(r: {
  name: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  image_public_id: string | null;
}): CuadroRow {
  return {
    name: r.name,
    title: r.title,
    description: r.description ?? "",
    imageUrl: r.image_url,
    imagePublicId: r.image_public_id,
  };
}

function toCuadro(r: CuadroRow): Cuadro {
  return {
    name: r.name,
    title: r.title,
    imageUrl: r.imageUrl,
    description: r.description,
  };
}

/**
 * Mezcla las filas guardadas con los nombres canónicos para garantizar que
 * readCuadros() siempre devuelva los 24 paneles (los que falten en la DB,
 * completados como vacíos). Misma lógica que el viejo mergeCanonical del JSON.
 */
function mergeCanonical(rows: CuadroRow[]): Cuadro[] {
  const map = new Map<string, CuadroRow>(rows.map((r) => [r.name.toLowerCase(), r]));
  return CANONICAL_CUADROS.map((name) => {
    const row = map.get(name.toLowerCase());
    return row ? toCuadro(row) : emptyCuadro(name);
  });
}

export async function readCuadros(): Promise<Cuadro[]> {
  try {
    const { data, error } = await supabase
      .from("cuadros")
      .select("name, title, description, image_url, image_public_id");
    if (error) throw error;
    return mergeCanonical((data ?? []).map(rowFromDb));
  } catch {
    // Si la DB no responde o aún no se creó la tabla, el museo igual carga con
    // los paneles canónicos vacíos (sin textura). Evita derribar la escena 3D.
    return CANONICAL_CUADROS.map(emptyCuadro);
  }
}

export async function getCuadroRow(name: string): Promise<CuadroRow | null> {
  const { data, error } = await supabase
    .from("cuadros")
    .select("name, title, description, image_url, image_public_id")
    .eq("name", name.toLowerCase())
    .maybeSingle();
  if (error) return null;
  return data ? rowFromDb(data) : null;
}

type CuadroUpsert = {
  title: string | null;
  description: string;
  imageUrl: string | null;
  imagePublicId: string | null;
};

export async function upsertCuadro(
  name: string,
  patch: CuadroUpsert,
): Promise<void> {
  const { error } = await supabase
    .from("cuadros")
    .upsert(
      {
        name: name.toLowerCase(),
        title: patch.title,
        description: patch.description,
        image_url: patch.imageUrl,
        image_public_id: patch.imagePublicId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" },
    );
  if (error) throw error;
}

/**
 * Sube una imagen WebP a Cloudinary y devuelve su URL pública + public_id.
 * Mantiene las validaciones de tipo y tamaño que usaba la versión anterior
 * (las acciones y el form confían en estos límites).
 */
export async function saveCuadroImage(
  name: string,
  data: Uint8Array,
  mime: string,
): Promise<{ url: string; publicId: string }> {
  if (mime !== "image/webp") {
    throw new Error("Tipo de archivo no soportado");
  }
  if (data.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("La imagen supera 6 MB");
  }
  return uploadCuadroImage(name, data, mime);
}

/**
 * Elimina una imagen de Cloudinary por public_id. Best-effort: no rompe el
 * flujo del admin si ya no existe.
 */
export async function deleteCuadroImage(publicId: string): Promise<void> {
  await deleteCloudinaryImage(publicId);
}
