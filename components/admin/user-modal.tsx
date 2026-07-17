"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createUserAction, updateUserAction, type UserActionState } from "@/app/admin/usuarios/actions";
import type { User } from "@/lib/users";

type Props = {
  mode: "create" | "edit";
  user?: User | null;
  onClose: () => void;
  onSuccess: () => void;
};

const INITIAL_STATE: UserActionState = { ok: false };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex-1 rounded-2xl bg-amber-300 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
    >
      {pending ? "Guardando..." : label}
    </button>
  );
}

export default function UserModal({ mode, user, onClose, onSuccess }: Props) {
  const router = useRouter();
  const isEdit = mode === "edit" && user;

  const [state, formAction] = useActionState(
    async (
      prevState: UserActionState,
      formData: FormData,
    ): Promise<UserActionState> => {
      let result: UserActionState;
      if (isEdit) {
        result = await updateUserAction(prevState, formData);
      } else {
        result = await createUserAction(prevState, formData);
      }
      if (result.ok) {
        onSuccess();
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
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0d0f1e] shadow-[0_32px_80px_rgba(0,0,0,0.7)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-amber-100/60">
              {isEdit ? "Editando" : "Nuevo"}
            </p>
            <h2 className="mt-0.5 text-xl font-semibold text-white">
              {isEdit ? user.username : "Usuario"}
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
          <form action={formAction} className="flex flex-col gap-4">
            {isEdit && <input type="hidden" name="id" value={user.id} />}

            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.25em] text-slate-400">
                Usuario
              </label>
              <input
                type="text"
                name="username"
                defaultValue={user?.username ?? ""}
                placeholder=" nombre_de_usuario"
                required
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_]+"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/25 transition focus:border-amber-300/40 focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-white/30">Solo letras, números y guiones bajos</p>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.25em] text-slate-400">
                {isEdit ? "Nueva contraseña (opcional)" : "Contraseña"}
              </label>
              <input
                type="password"
                name="password"
                placeholder={isEdit ? " Dejar vacío para no cambiar" : "••••••••"}
                {...(!isEdit && { required: true, minLength: 4, maxLength: 50 })}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/25 transition focus:border-amber-300/40 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.25em] text-slate-400">
                Rol
              </label>
              <select
                name="role"
                defaultValue={user?.role ?? "editor"}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition focus:border-amber-300/40 focus:outline-none"
              >
                <option value="editor">Editor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            {state.message ? (
              <p
                role="status"
                className={`text-xs ${state.ok ? "text-emerald-300" : "text-rose-300"}`}
              >
                {state.message}
              </p>
            ) : null}

            <div className="flex items-center gap-3 pt-1">
              <SubmitButton label={isEdit ? "Actualizar" : "Crear usuario"} />
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/60 transition hover:bg-white/10"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}