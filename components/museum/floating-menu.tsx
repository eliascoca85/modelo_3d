// Menú flotante del museo 3D.
// Índice visual de las secciones temáticas. Cada categoría es un "nodo" sobre
// un riel vertical; al pasar el cursor el nodo se enciende con un halo ámbar,
// en sintonía con las luces cálidas de la escena 3D.
//
// Las secciones que declaran `wall` son interactivas: al hacer clic (o pulsar
// Enter/Espacio) navegan la cámara hacia esa pared del escenario. Las demás
// siguen siendo decorativas por ahora.

const SECCIONES = [
	{ id: "independencia", label: "Independencia", wall: "pared_6" },
	{ id: "historia", label: "Historia", wall: "pedestal_presentacion" },
	{ id: "lugares", label: "Lugares", wall: "pared_1" },
	{ id: "comidas", label: "Comidas" },
	{ id: "fiestas", label: "Fiestas", wall: "pared_6" },
] as const;

type FloatingMenuProps = {
	/** Se llama al activar una sección interactiva (con `wall`). */
	onSelectSection?: (sectionId: string, wall: string) => void;
	/** Id de la sección actualmente activa, para resaltarla. */
	activeSection?: string | null;
};

export default function FloatingMenu({ onSelectSection, activeSection }: FloatingMenuProps) {
	return (
		<nav
			aria-label="Secciones del museo"
			className="pointer-events-auto absolute left-4 top-1/2 z-30 -translate-y-1/2 sm:left-8"
		>
			<p className="mb-5 pl-7 text-[15px] uppercase tracking-[0.28em] text-amber-100/90">
				Secciones
			</p>

			<div className="relative pl-7">
				{/* Riel vertical que une los nodos */}
				<span
					aria-hidden
					className="absolute left-[8px] top-1.5 bottom-1.5 w-0.5 bg-gradient-to-b from-white/10 via-white/50 to-white/10"
				/>

				<ul className="flex flex-col gap-4 sm:gap-5">
					{SECCIONES.map((seccion) => {
						const wall = "wall" in seccion ? seccion.wall : null;
						const interactive = Boolean(onSelectSection && wall);
						const isActive = interactive && activeSection === seccion.id;

						const handleActivate = () => {
							if (!interactive || !wall) return;
							onSelectSection?.(seccion.id, wall);
						};

						return (
							<li key={seccion.id}>
								<span
									className={`group flex items-center gap-4 ${interactive ? "cursor-pointer" : "cursor-default"}`}
									role={interactive ? "button" : undefined}
									tabIndex={interactive ? 0 : undefined}
									onClick={interactive ? handleActivate : undefined}
									onKeyDown={
										interactive
											? (event) => {
													if (event.key === "Enter" || event.key === " ") {
														event.preventDefault();
														handleActivate();
													}
												}
											: undefined
									}
								>
									<span className="relative flex h-5 w-5 items-center justify-center">
										{/* Halo ámbar al encender el nodo */}
										<span
											aria-hidden
											className={`absolute h-6 w-6 rounded-full blur-[7px] transition-colors duration-300 group-hover:bg-amber-200/45 motion-reduce:transition-none ${
												isActive ? "bg-amber-200/45" : "bg-amber-200/0"
											}`}
										/>
										{/* Nodo */}
										<span
											aria-hidden
											className={`relative h-2.5 w-2.5 rounded-full transition-all duration-300 group-hover:scale-150 motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${
												isActive ? "scale-150 bg-amber-200" : "bg-amber-200/90 group-hover:bg-amber-200"
											}`}
										/>
									</span>

									<span
										className={`text-[16px] font-medium uppercase tracking-[0.2em] transition-colors duration-300 group-hover:text-white motion-reduce:transition-none ${
											isActive ? "text-white" : "text-white/75"
										}`}
									>
										{seccion.label}
									</span>
								</span>
							</li>
						);
					})}
				</ul>
			</div>
		</nav>
	);
}
