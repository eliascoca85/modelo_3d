"use server";

import { revalidatePath } from "next/cache";

import {
  deleteCuadroImage,
  getCuadroRow,
  saveCuadroImage,
  upsertCuadro,
  CUADRO_LIMITS,
} from "@/lib/cuadros";
import { isManagedPanelName } from "@/types/cuadros";

export type CuadroActionState = {
  ok: boolean;
  message?: string;
};

const INITIAL_STATE: CuadroActionState = { ok: false };

// TODO: autenticación. Cuando se agregue, verificar sesión antes de
// permitir mutaciones (ver docs/app/guides/data-security).
function authorize(): void {
  // placeholder para auth futura
}

export async function upsertCuadroAction(
  _prevState: CuadroActionState,
  name: string,
  formData: FormData,
): Promise<CuadroActionState> {
  authorize();

  if (!isManagedPanelName(name)) {
    return { ok: false, message: "Nombre de pieza inválido" };
  }

  const description = String(formData.get("description") ?? "");
  const rawTitle = String(formData.get("title") ?? "");
  const file = formData.get("file");
  const wantsClear = formData.get("clearImage") === "1";

  const row = await getCuadroRow(name);
  const oldPublicId = row?.imagePublicId ?? null;

  let imageUrl: string | null = row?.imageUrl ?? null;
  let imagePublicId: string | null = row?.imagePublicId ?? null;

  if (file instanceof File && file.size > 0) {
    if (file.type !== "image/webp") {
      return { ok: false, message: "La imagen debe ser WebP" };
    }
    if (file.size > CUADRO_LIMITS.MAX_IMAGE_BYTES) {
      return {
        ok: false,
        message: "La imagen supera los 6 MB permitidos",
      };
    }
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const uploaded = await saveCuadroImage(name, buffer, file.type);
      imageUrl = uploaded.url;
      imagePublicId = uploaded.publicId;
      // La imagen anterior ya no se referencia: se borra de Cloudinary para no
      // acumular huérfanos. Best-effort.
      if (oldPublicId && oldPublicId !== imagePublicId) {
        await deleteCuadroImage(oldPublicId);
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : "Error desconocido";
      return { ok: false, message: m };
    }
  } else if (wantsClear) {
    if (oldPublicId) await deleteCuadroImage(oldPublicId);
    imageUrl = null;
    imagePublicId = null;
  }

  try {
    await upsertCuadro(name, { title: rawTitle.trim() || null, description: description.trim(), imageUrl, imagePublicId });
  } catch (err) {
    const m = err instanceof Error ? err.message : "Error al guardar";
    return { ok: false, message: m };
  }

  revalidatePath("/");
  revalidatePath("/museo");
  revalidatePath("/admin/cuadros");

  return { ok: true, message: "Cambios guardados" };
}

export async function clearCuadroImageAction(
  _prevState: CuadroActionState,
  name: string,
): Promise<CuadroActionState> {
  authorize();

  if (!isManagedPanelName(name)) {
    return { ok: false, message: "Nombre de pieza inválido" };
  }

  const row = await getCuadroRow(name);
  if (row?.imagePublicId) {
    await deleteCuadroImage(row.imagePublicId);
  }

  try {
    await upsertCuadro(name, {
      title: row?.title ?? null,
      description: row?.description ?? "",
      imageUrl: null,
      imagePublicId: null,
    });
  } catch (err) {
    const m = err instanceof Error ? err.message : "Error al quitar la imagen";
    return { ok: false, message: m };
  }

  revalidatePath("/");
  revalidatePath("/museo");
  revalidatePath("/admin/cuadros");

  return { ok: true, message: "Imagen quitada" };
}
