import { readUsers } from "@/lib/users";
import UsersTable from "@/components/admin/users-table";

export const dynamic = "force-dynamic";

export default async function AdminUsuariosPage() {
  const users = await readUsers();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-100/75">
          Administración
        </p>
        <h1 className="text-3xl font-semibold text-white">
          Gestión de usuarios
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300/80">
          Creá, editá o eliminá usuarios que pueden acceder al panel administrativo.
        </p>
      </div>

      <UsersTable initialUsers={users} />
    </main>
  );
}