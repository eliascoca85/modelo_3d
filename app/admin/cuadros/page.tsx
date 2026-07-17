import Link from "next/link";
import { readCuadros } from "@/lib/cuadros";
import CuadrosTable from "@/components/admin/cuadros-table";

export const dynamic = "force-dynamic";

export default async function AdminCuadrosPage() {
  const cuadros = await readCuadros();

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-amber-100/75">
            Administración
          </p>
          <h1 className="text-3xl font-semibold text-white">
            Imágenes del museo
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300/80">
            Gestioná cuadros, pintura y paneles de presentación: subí una imagen
            WebP y editá la descripción que verá el visitante en la escena 3D.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/80 transition hover:bg-white/10"
        >
          ← Volver al museo
        </Link>
      </div>

      <CuadrosTable initialCuadros={cuadros} />
    </main>
  );
}