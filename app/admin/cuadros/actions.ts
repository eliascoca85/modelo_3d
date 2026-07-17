"use server";

import { revalidatePath } from "next/cache";

import {
  deleteCuadroImage,
  readCuadros,
  saveCuadroImage,
  writeCuadros,
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
  const file = formData.get("file");
  const wantsClear = formData.get("clearImage") === "1";

  const records = await readCuadros();
  const idx = records.findIndex(
    (r) => r.name.toLowerCase() === name.toLowerCase(),
  );
  if (idx === -1) {
    return { ok: false, message: "No se encontró la pieza" };
  }

  let imageUrl: string | null = records[idx].imageUrl;

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
      imageUrl = await saveCuadroImage(name, buffer, file.type);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Error desconocido";
      return { ok: false, message: m };
    }
  } else if (wantsClear) {
    await deleteCuadroImage(name);
    imageUrl = null;
  }

  records[idx] = {
    ...records[idx],
    description: description.trim(),
    imageUrl,
  };
  await writeCuadros(records);

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

  const records = await readCuadros();
  const idx = records.findIndex(
    (r) => r.name.toLowerCase() === name.toLowerCase(),
  );
  if (idx === -1) {
    return { ok: false, message: "No se encontró la pieza" };
  }

  await deleteCuadroImage(name);
  records[idx] = { ...records[idx], imageUrl: null };
  await writeCuadros(records);

  revalidatePath("/");
  revalidatePath("/museo");
  revalidatePath("/admin/cuadros");

  return { ok: true, message: "Imagen quitada" };
}
