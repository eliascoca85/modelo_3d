"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction } from "@/app/admin/login/actions";

const INITIAL = { ok: false, message: undefined as string | undefined };

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, INITIAL);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050816]">
      <div className="museum-backdrop absolute inset-0" />

      <div className="relative w-full max-w-sm px-4">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-1 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
              <svg
                className="h-7 w-7 text-amber-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-white">
            Museo Admin
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Ingresá tus credenciales para continuar
          </p>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-white/10 bg-black/70 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <form action={formAction} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="username"
                className="text-[10px] uppercase tracking-[0.25em] text-slate-400"
              >
                Usuario
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="admin"
                required
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/25 transition focus:border-amber-300/50 focus:bg-white/8 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-[10px] uppercase tracking-[0.25em] text-slate-400"
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/25 transition focus:border-amber-300/50 focus:bg-white/8 focus:outline-none"
              />
            </div>

            {state.message ? (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
                <svg
                  className="h-4 w-4 flex-shrink-0 text-rose-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <p className="text-xs text-rose-300">{state.message}</p>
              </div>
            ) : null}

            <button
              type="submit"
              className="mt-2 w-full rounded-2xl bg-amber-300 py-3 text-sm font-semibold text-slate-900 transition hover:bg-amber-200 active:scale-[0.98]"
            >
              Ingresar
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-xs text-slate-500 transition hover:text-slate-300"
          >
            Ver museo →
          </Link>
        </div>
      </div>
    </main>
  );
}