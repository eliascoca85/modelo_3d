"use client";

import { useEffect, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteUserAction } from "@/app/admin/usuarios/actions";
import UserModal from "@/components/admin/user-modal";
import type { User } from "@/lib/users";

const columnHelper = createColumnHelper<User>();

type Props = { initialUsers: User[] };

export default function UsersTable({ initialUsers }: Props) {
  const router = useRouter();
  const [data, setData] = useState<User[]>(initialUsers);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  // null = modal cerrado. Antes usábamos "create" por defecto + activeUser, lo
  // que hacía que "Cancelar"/"X" en modo create no cerraran (activeUser ya era
  // null y onClose no cambiaba nada). Ahora closeModal → modalMode null.
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [activeUser, setActiveUser] = useState<User | null>(null);

  // Sincroniza el state local cuando el server refresca los datos (tras un
  // éxito, router.refresh() trae initialUsers nuevo y este efecto actualiza
  // la tabla sin recargar la página entera).
  useEffect(() => {
    setData(initialUsers);
  }, [initialUsers]);

  const openCreate = () => {
    setModalMode("create");
    setActiveUser(null);
  };

  const openEdit = (user: User) => {
    setModalMode("edit");
    setActiveUser(user);
  };

  const closeModal = () => {
    setModalMode(null);
    setActiveUser(null);
  };

  const handleDelete = async (user: User) => {
    const formData = new FormData();
    formData.set("id", user.id);
    const result = await deleteUserAction({ ok: false }, formData);
    if (result.ok) {
      toast.success(result.message ?? "Usuario eliminado");
      setData((prev) => prev.filter((u) => u.id !== user.id));
      router.refresh();
    } else {
      toast.error(result.message ?? "No se pudo eliminar el usuario");
    }
  };

  const columns = [
    columnHelper.accessor("username", {
      header: "Usuario",
      cell: (info) => (
        <span className="text-base font-semibold text-white">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("role", {
      header: "Rol",
      cell: (info) => (
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide ${
            info.getValue() === "admin"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
              : "border-white/10 bg-white/5 text-slate-500"
          }`}
        >
          {info.getValue() === "admin" ? "Administrador" : "Editor"}
        </span>
      ),
    }),
    columnHelper.accessor("createdAt", {
      header: "Creado",
      cell: (info) => {
        const date = new Date(info.getValue());
        return (
          <span className="text-sm text-slate-400">
            {date.toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => openEdit(row.original)}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            Editar
          </button>
          <button
            onClick={() => handleDelete(row.original)}
            className="rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300 transition hover:bg-rose-500/20"
          >
            Eliminar
          </button>
        </div>
      ),
    }),
  ];

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 6 },
    },
  });

  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex;

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
              <svg className="h-5 w-5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Buscar usuario..."
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="w-80 rounded-2xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/30 transition focus:border-amber-300/40 focus:bg-white/8 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-2xl bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Nuevo usuario
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-white/10">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.2em] text-slate-500"
                    >
                      {header.isPlaceholder
                        ? null
                        : (
                          <div
                            className={`flex items-center gap-2 ${
                              header.column.getCanSort() ? "cursor-pointer select-none" : ""
                            }`}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() && (
                              <span className="text-white/20">
                                {header.column.getIsSorted() === "asc" ? (
                                  <svg className="h-3.5 w-3.5 text-amber-300" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                                  </svg>
                                ) : header.column.getIsSorted() === "desc" ? (
                                  <svg className="h-3.5 w-3.5 text-amber-300" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                ) : (
                                  <svg className="h-3.5 w-3.5 text-white/10" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </span>
                            )}
                          </div>
                        )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-16 text-center text-slate-500">
                    No se encontraron usuarios
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-white/5 transition hover:bg-white/[0.03]"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-6 py-5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-2 pb-4">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>

            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                onClick={() => table.setPageIndex(i)}
                className={`flex h-10 min-w-[2.5rem] items-center justify-center rounded-full px-3 text-sm font-medium transition ${
                  currentPage === i
                    ? "bg-amber-300 text-slate-900"
                    : "border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {i + 1}
              </button>
            ))}

            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {modalMode === "create" && (
        <UserModal mode="create" onClose={closeModal} onSuccess={closeModal} />
      )}

      {modalMode === "edit" && activeUser && (
        <UserModal
          mode="edit"
          user={activeUser}
          onClose={closeModal}
          onSuccess={closeModal}
        />
      )}
    </>
  );
}