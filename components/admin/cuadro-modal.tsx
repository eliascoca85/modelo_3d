"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clearCuadroImageAction, upsertCuadroAction, type CuadroActionState } from "@/app/admin/cuadros/actions";
import { cuadroDisplayName, type Cuadro } from "@/types/cuadros";
import CuadroDropzone from "@/components/admin/dropzone";
import type { CuratorialCard } from "@/lib/cuadro-vision";

type Props = {
  cuadro: Cuadro;
  onClose: () => void;
};

const INITIAL_STATE: CuadroActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex-1 rounded-2xl bg-amber-300 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
    >
      {pending ? "Guardando..." : "Guardar"}
    </button>
  );
}

function ClearButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Quitando..." : "Eliminar imagen"}
    </button>
  );
}

export default function CuadroModal({ cuadro, onClose }: Props) {
  const router = useRouter();

  // Refs para los inputs de título y descripción (pre-relleno programático)
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Sugerencia curatorial del análisis visual
  const [suggestion, setSuggestion] = useState<CuratorialCard | null>(null);

  const [, upsertFormAction] = useActionState(
    async (
      prevState: CuadroActionState,
      formData: FormData,
    ): Promise<CuadroActionState> => {
      const result = await upsertCuadroAction(prevState, cuadro.name, formData);
      if (result.ok) {
        toast.success(result.message ?? "Cambios guardados");
        router.refresh();
        onClose();
      } else {
        toast.error(result.message ?? "No se pudo guardar el cuadro");
      }
      return result;
    },
    INITIAL_STATE,
  );

  const [, clearFormAction] = useActionState(
    async (prevState: CuadroActionState): Promise<CuadroActionState> => {
      const result = await clearCuadroImageAction(prevState, cuadro.name);
      if (result.ok) {
        toast.success(result.message ?? "Imagen quitada");
        router.refresh();
        onClose();
      } else {
        toast.error(result.message ?? "No se pudo quitar la imagen");
      }
      return result;
    },
    INITIAL_STATE,
  );

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const displayName = cuadroDisplayName(cuadro.name);

  /** Recibe la sugerencia del dropzone y pre-rellena solo campos vacíos. */
  const handleSuggestion = (s: CuratorialCard | null) => {
    setSuggestion(s);
    if (!s) return;

    // Pre-rellenar título solo si el campo está vacío
    if (titleRef.current && !titleRef.current.value.trim()) {
      titleRef.current.value = s.title;
    }
    // Pre-rellenar descripción solo si el campo está vacío
    if (descRef.current && !descRef.current.value.trim()) {
      descRef.current.value = s.description;
    }
  };

  /** Aplica la sugerencia al campo indicado (sobrescribe). */
  const applySuggestionToField = (field: "title" | "description") => {
    if (!suggestion) return;
    if (field === "title" && titleRef.current) {
      titleRef.current.value = suggestion.title;
    }
    if (field === "description" && descRef.current) {
      descRef.current.value = suggestion.description;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0d0f1e] shadow-[0_32px_80px_rgba(0,0,0,0.7)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-amber-100/60">
              Editando
            </p>
            <h2 className="mt-0.5 text-xl font-semibold text-white">
              {displayName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {/* Upsert form */}
          <form action={upsertFormAction} className="flex flex-col gap-4">
            {/* Título mostrado en la tarjeta del museo. Opcional: si queda
                vacío, la tarjeta muestra el nombre derivado (cuadroDisplayName),
                así el admin no "renombra" la pieza, sólo el rótulo. */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-[10px] uppercase tracking-[0.25em] text-slate-400">
                  Título <span className="normal-case tracking-normal text-white/25">(opcional)</span>
                </label>
                {suggestion && (
                  <button
                    type="button"
                    onClick={() => applySuggestionToField("title")}
                    className="text-[10px] text-amber-200/50 transition hover:text-amber-200"
                  >
                    ✨ Usar sugerencia
                  </button>
                )}
              </div>
              <input
                ref={titleRef}
                type="text"
                name="title"
                defaultValue={cuadro.title ?? ""}
                maxLength={80}
                placeholder="Ej.: Estela del sol · deja vacío para usar el nombre de la pieza"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/25 transition focus:border-amber-300/40 focus:outline-none"
              />
            </div>

            {/* El dropzone vive dentro del form: su <input name="file"> oculto
                se sube con el submit del Server Action. */}
            <CuadroDropzone
              currentUrl={cuadro.imageUrl}
              alt={displayName}
              onSuggest={handleSuggestion}
            />

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-[10px] uppercase tracking-[0.25em] text-slate-400">
                  Descripción
                </label>
                {suggestion && (
                  <button
                    type="button"
                    onClick={() => applySuggestionToField("description")}
                    className="text-[10px] text-amber-200/50 transition hover:text-amber-200"
                  >
                    ✨ Usar sugerencia
                  </button>
                )}
              </div>
              <textarea
                ref={descRef}
                name="description"
                rows={4}
                defaultValue={cuadro.description}
                placeholder="Escribí la descripción que verá el visitante..."
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/25 transition focus:border-amber-300/40 focus:outline-none"
              />
            </div>

            {/* Chip de sección sugerida (no vinculante, solo informativo) */}
            {suggestion && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1.5 text-xs text-amber-200/80">
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM4.343 4.343a.75.75 0 011.06 0l1.061 1.06a.75.75 0 01-1.06 1.061l-1.061-1.06a.75.75 0 010-1.061zM13.536 13.536a.75.75 0 011.06 0l1.061 1.06a.75.75 0 01-1.06 1.061l-1.061-1.06a.75.75 0 010-1.061zM2 10a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 012 10zM15 10a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 0115 10zM4.343 15.657a.75.75 0 010-1.06l1.061-1.061a.75.75 0 111.06 1.06l-1.06 1.061a.75.75 0 01-1.061 0zM13.536 6.464a.75.75 0 010-1.06l1.061-1.061a.75.75 0 111.06 1.06l-1.06 1.061a.75.75 0 01-1.061 0z" />
                  </svg>
                  Sección sugerida: <strong>{suggestion.suggestedSection}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setSuggestion(null)}
                  className="text-white/20 transition hover:text-white/50"
                  title="Descartar sugerencia"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <SubmitButton />
            </div>
          </form>

          {/* Clear image (form independiente: no manda el file input) */}
          {cuadro.imageUrl && (
            <form action={clearFormAction} className="mt-3">
              <ClearButton />
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
