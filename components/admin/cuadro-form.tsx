"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { cuadroDisplayName, type Cuadro } from "@/types/cuadros";
import {
  clearCuadroImageAction,
  upsertCuadroAction,
  type CuadroActionState,
} from "@/app/admin/cuadros/actions";

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
        <input
          type="file"
          name="file"
          accept="image/webp"
          className="block w-full text-xs text-white/80 file:mr-3 file:rounded-full file:border-0 file:bg-amber-300/90 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-900 hover:file:bg-amber-200"
        />

        <label className="text-[10px] uppercase tracking-[0.3em] text-white/50">
          Titulo (mostrado en la tarjeta)
        </label>
        <input
          type="text"
          name="title"
          defaultValue={cuadro.title ?? ""}
          placeholder="Ej: La Creacion..."
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-200/40"
        />

        <label className="text-[10px] uppercase tracking-[0.3em] text-white/50">
          Descripcion (tarjeta lateral al hacer clic)
       </label>
        <textarea
          name="description"
          rows={3}
          defaultValue={cuadro.description}
          placeholder="Escribe aquí la descripción que verá el visitante..."
          className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-200/40"
        />

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
