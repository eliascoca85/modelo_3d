"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { cuadroDisplayName, type Cuadro } from "@/types/cuadros";
import {
  clearCuadroImageAction,
  upsertCuadroAction,
  type CuadroActionState,
} from "@/app/admin/cuadros/actions";
import {
  suggestCuratorialCard,
  type CuratorialSuggestion,
} from "@/lib/image-analyzer";

type Props = { cuadro: Cuadro };

const INITIAL: CuadroActionState = { ok: false };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-amber-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Guardando..." : label}
   </button>
  );
}

function ClearButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Quitando..." : "Quitar imagen"}
   </button>
  );
}

export default function CuadroForm({ cuadro }: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const [suggestion, setSuggestion] = useState<CuratorialSuggestion | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [upsertState, upsertFormAction] = useActionState(
    async (
      prevState: CuadroActionState,
      formData: FormData,
    ): Promise<CuadroActionState> => {
      return upsertCuadroAction(prevState, cuadro.name, formData);
    },
    INITIAL,
  );

  const [clearState, clearFormAction] = useActionState(
    async (prevState: CuadroActionState): Promise<CuadroActionState> => {
      return clearCuadroImageAction(prevState, cuadro.name);
    },
    INITIAL,
  );

  /** Analiza la imagen seleccionada y pre-rellena campos vacíos. */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file || file.type !== "image/webp") return;

    setAnalyzing(true);
    setSuggestion(null);
    try {
      const result = await suggestCuratorialCard(file);
      setSuggestion(result);

      // Pre-rellenar solo si están vacíos
      if (titleRef.current && !titleRef.current.value.trim()) {
        titleRef.current.value = result.title;
      }
      if (descRef.current && !descRef.current.value.trim()) {
        descRef.current.value = result.description;
      }
    } catch {
      // Best-effort: si falla, el curador sigue sin sugerencia.
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <article className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/60 p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {cuadroDisplayName(cuadro.name)}
       </h2>
        <Link
          href="/"
          className="text-[10px] uppercase tracking-[0.3em] text-amber-100/60 hover:text-amber-50"
        >
          Ver en museo
       </Link>
     </header>

      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
        {cuadro.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cuadro.imageUrl}
            alt={cuadroDisplayName(cuadro.name)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
            Sin imagen subida
         </div>
        )}
     </div>

      <form action={upsertFormAction} className="flex flex-col gap-3">
        <label className="text-[10px] uppercase tracking-[0.3em] text-white/50">
          Imagen WebP
       </label>
        <div className="relative">
          <input
            type="file"
            name="file"
            accept="image/webp"
            onChange={handleFileChange}
            className="block w-full text-xs text-white/80 file:mr-3 file:rounded-full file:border-0 file:bg-amber-300/90 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-900 hover:file:bg-amber-200"
          />
          {analyzing && (
            <span className="mt-1 flex items-center gap-1.5 text-[10px] text-amber-200/60">
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analizando imagen…
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-[0.3em] text-white/50">
            Titulo (mostrado en la tarjeta)
          </label>
          {suggestion && (
            <button
              type="button"
              onClick={() => {
                if (titleRef.current) titleRef.current.value = suggestion.title;
              }}
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
          placeholder="Ej: La Creacion..."
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-200/40"
        />

        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-[0.3em] text-white/50">
            Descripcion (tarjeta lateral al hacer clic)
          </label>
          {suggestion && (
            <button
              type="button"
              onClick={() => {
                if (descRef.current) descRef.current.value = suggestion.description;
              }}
              className="text-[10px] text-amber-200/50 transition hover:text-amber-200"
            >
              ✨ Usar sugerencia
            </button>
          )}
        </div>
        <textarea
          ref={descRef}
          name="description"
          rows={3}
          defaultValue={cuadro.description}
          placeholder="Escribe aquí la descripción que verá el visitante..."
          className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-200/40"
        />

        {/* Chip de sección sugerida (no vinculante) */}
        {suggestion && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-[11px] text-amber-200/80">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
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
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {upsertState.message ? (
          <p
            role="status"
            className={`text-xs ${upsertState.ok ? "text-emerald-300" : "text-rose-300"}`}
          >
            {upsertState.message}
         </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton label="Guardar" />
          <Link
            href={`/#${cuadro.name}`}
            className="ml-auto rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/70 transition hover:bg-white/10"
          >
            Ver en escena
         </Link>
       </div>
     </form>

      {cuadro.imageUrl ? (
        <form action={clearFormAction} className="-mt-1">
          <ClearButton />
       </form>
      ) : null}
   </article>
  );
}
