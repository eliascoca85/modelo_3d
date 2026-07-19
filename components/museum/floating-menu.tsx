// Menú flotante decorativo del museo 3D.
// Sin función todavía: es un índice visual de las secciones temáticas.
// Cada categoría es un "nodo" sobre un riel vertical; al pasar el cursor el
// nodo se enciende con un halo ámbar, en sintonía con las luces cálidas de
// la escena 3D.

const SECCIONES = [
	{ id: "independencia", label: "Independencia" },
	{ id: "historia", label: "Historia" },
	{ id: "lugares", label: "Lugares" },
	{ id: "comidas", label: "Comidas" },
	{ id: "fiestas", label: "Fiestas" },
] as const;

export default function FloatingMenu() {
	return (
		<nav
			aria-label="Secciones del museo"
			className="pointer-events-auto absolute left-4 top-1/2 z-30 -translate-y-1/2 sm:left-6"
		>
			<p className="mb-3 pl-5 text-[10px] uppercase tracking-[0.3em] text-amber-100/60">
				Secciones
			</p>

			<div className="relative pl-5">
				{/* Riel vertical que une los nodos */}
				<span
					aria-hidden
					className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-gradient-to-b from-white/5 via-white/25 to-white/5"
				/>

				<ul className="flex flex-col gap-2.5 sm:gap-3">
					{SECCIONES.map((seccion) => (
						<li key={seccion.id}>
							<span className="group flex cursor-default items-center gap-3">
								<span className="relative flex h-[11px] w-[11px] items-center justify-center">
									{/* Halo ámbar al encender el nodo */}
									<span
										aria-hidden
										className="absolute h-3 w-3 rounded-full bg-amber-200/0 blur-[5px] transition-colors duration-300 group-hover:bg-amber-200/25 motion-reduce:transition-none"
									/>
									{/* Nodo */}
									<span className="relative h-1.5 w-1.5 rounded-full bg-amber-200/70 transition-all duration-300 group-hover:scale-150 group-hover:bg-amber-200 motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
								</span>

								<span className="text-[11px] font-medium uppercase tracking-[0.25em] text-white/45 transition-colors duration-300 group-hover:text-white/90 motion-reduce:transition-none">
									{seccion.label}
								</span>
							</span>
						</li>
					))}
				</ul>
			</div>
		</nav>
	);
}
