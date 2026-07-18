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
import { cuadroDisplayName, type Cuadro } from "@/types/cuadros";
import CuadroModal from "@/components/admin/cuadro-modal";

const columnHelper = createColumnHelper<Cuadro>();

type Props = { initialCuadros: Cuadro[] };

export default function CuadrosTable({ initialCuadros }: Props) {
  const [data, setData] = useState<Cuadro[]>(initialCuadros);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [activeCuadro, setActiveCuadro] = useState<Cuadro | null>(null);

  useEffect(() => {
    setData(initialCuadros);
  }, [initialCuadros]);

  const columns = [
    columnHelper.accessor("name", {
      header: "Pieza",
      cell: (info) => (
        <span className="text-base font-semibold text-white">
          {cuadroDisplayName(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor("imageUrl", {
      header: "Imagen",
      cell: (info) => (
        <div className="h-14 w-20 overflow-hidden rounded-xl border border-white/10 bg-white/5">
          {info.getValue() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={info.getValue()!}
              alt="preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <svg className="h-6 w-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M18 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75z" />
              </svg>
            </div>
          )}
        </div>
      ),
    }),
    columnHelper.accessor("description", {
      header: "¿Tiene descripción?",
      cell: (info) => {
        const text = info.getValue();
        return (
          <span className="text-sm text-slate-400">
            {text ? (
              <span className="flex items-center gap-1.5 text-emerald-300">
                <svg className="h-3.5 w-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
                Sí
              </span>
            ) : (
              <span className="text-white/25">Sin descripción</span>
            )}
          </span>
        );
      },
    }),
    columnHelper.accessor("imageUrl", {
      id: "estado",
      header: "Estado",
      cell: (info) => (
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide ${
            info.getValue()
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-white/10 bg-white/5 text-slate-500"
          }`}
        >
          {info.getValue() ? "Con imagen" : "Sin imagen"}
        </span>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setActiveCuadro(row.original)}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            Gestionar
          </button>
          <a
            href={`/#${row.original.name}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            Ver
          </a>
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
              placeholder="Buscar por nombre..."
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="w-80 rounded-2xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/30 transition focus:border-amber-300/40 focus:bg-white/8 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>
              {table.getFilteredRowModel().rows.length} piezas
            </span>
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
                    No se encontraron piezas
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

        {/* Empty state */}
        {table.getRowModel().rows.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <svg className="h-6 w-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white/60">Sin resultados</p>
              <p className="mt-1 text-xs text-slate-600">Probá cambiando el filtro de búsqueda</p>
            </div>
          </div>
        )}
      </div>

      {activeCuadro && (
        <CuadroModal cuadro={activeCuadro} onClose={() => setActiveCuadro(null)} />
      )}
    </>
  );
}