"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { clearCuadroImageAction, upsertCuadroAction, type CuadroActionState } from "@/app/admin/cuadros/actions";
import { cuadroDisplayName, type Cuadro } from "@/types/cuadros";

type Props = {
  cuadro: Cuadro;
  onClose: () => void;
  onUpdated: (updated: Cuadro) => void;
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

export default function CuadroModal({ cuadro, onClose, onUpdated }: Props) {
  const router = useRouter();

  const [upsertState, upsertFormAction] = useActionState(
    async (
      prevState: CuadroActionState,
      formData: FormData,
    ): Promise<CuadroActionState> => {
      const result = await upsertCuadroAction(prevState, cuadro.name, formData);
      if (result.ok) {
        onUpdated(cuadro);
        router.refresh();
      }
      return result;
    },
    INITIAL_STATE,
  );

  const [clearState, clearFormAction] = useActionState(
    async (
      prevState: CuadroActionState,
    ): Promise<CuadroActionState> => {
      const result = await clearCuadroImageAction(prevState, cuadro.name);
      if (result.ok) {
        onUpdated({ ...cuadro, imageUrl: null });
        router.refresh();
      }
      return result;
    },
    INITIAL_STATE,
  );

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
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
              {cuadroDisplayName(cuadro.name)}
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
          {/* Preview */}
          <div className="mb-5 aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
            {cuadro.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cuadro.imageUrl}
                alt={cuadroDisplayName(cuadro.name)}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                <svg className="h-8 w-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M18 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75z" />
                </svg>
                <span className="text-xs text-white/30">Sin imagen subida</span>
              </div>
            )}
          </div>

          {/* Upsert form */}
          <form action={upsertFormAction} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.25em] text-slate-400">
                Imagen WebP
              </label>
              <input
                type="file"
                name="file"
                accept="image/webp"
                className="block w-full text-xs text-white/80 file:mr-3 file:rounded-full file:border-0 file:bg-amber-300/90 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-900 hover:file:bg-amber-200"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.25em] text-slate-400">
                Descripción
              </label>
              <textarea
                name="description"
                rows={4}
                defaultValue={cuadro.description}
                placeholder="Escribí la descripción que verá el visitante..."
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/25 transition focus:border-amber-300/40 focus:outline-none"
              />
            </div>

            {upsertState.message ? (
              <p
                role="status"
                className={`text-xs ${upsertState.ok ? "text-emerald-300" : "text-rose-300"}`}
              >
                {upsertState.message}
              </p>
            ) : null}

            <div className="flex items-center gap-3 pt-1">
              <SubmitButton />
            </div>
          </form>

          {/* Clear image form */}
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