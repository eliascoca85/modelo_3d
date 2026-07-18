"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clearCuadroImageAction, upsertCuadroAction, type CuadroActionState } from "@/app/admin/cuadros/actions";
import { cuadroDisplayName, type Cuadro } from "@/types/cuadros";
import CuadroDropzone from "@/components/admin/dropzone";

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
            {/* El dropzone vive dentro del form: su <input name="file"> oculto
                se sube con el submit del Server Action. */}
            <CuadroDropzone currentUrl={cuadro.imageUrl} alt={displayName} />

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
