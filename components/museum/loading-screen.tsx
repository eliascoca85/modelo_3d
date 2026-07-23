// Pantalla de carga del museo 3D.
//
// Cubre la escena mientras se cargan el modelo GLB (Draco), las texturas de los
// cuadros y se inicializa el audio, dando tiempo a que todo quede listo. Lleva:
//
//   - Un sello animado (anillos concéntricos en sentidos opuestos + núcleo
//     pulsante y letra "M" estilizada), inspirado en el ámbar cálido del museo.
//   - El título "Museo Inmersivo", bajada y una barra de progreso real (se llena
//     con el progreso reportado por el GLB; si no hay, simula una subida suave
//     que se asienta al 92% esperando la carga).
//   - Un indicador tipo "punto" de estados: Cargando modelo / Texturas / Audio.
//   - Al terminar la carga, aparece un botón "Entrar al museo": el clic en él es
//     la PRIMERA interacción del usuario, gesto que los navegadores exigen para
//     desbloquear el audio (autoplay policy) y que dispara la música de ambiente
//     + revela la escena. Así el sonido arranca al cerrar la pantalla, no antes.
//   - `onEnter` se invoca SÍNCRONAMENTE en el clic: el `AudioContext.resume()` del
//     música queda DENTRO del gesto válido. Un `setTimeout` aquí lo rompería: el
//     resume correría fuera del gesto y el audio nunca arrancaría. Sin fade-out a
//     propósito: la prioridad es que el sonido arranque ya y el museo se revele.
//
// `progress` va de 0 a 1 (fracción cargada del GLB). `onEnter` se invoca al pulsar
// "Entrar". Mientras `progress < 1` el botón está oculto. Todo respeta
// prefers-reduced-motion (las animaciones se anulan en globals.css).

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type LoadingScreenProps = {
	/** Progreso de carga del GLB, 0..1. `null` = aún no hay progreso. */
	progress: number | null;
	/** Se llama al pulsar "Entrar al museo" — dispara el desbloqueo de audio. */
	onEnter: () => void;
};

/** Etapas mostradas según el progreso (solo legenda: la transición es visual). */
function stageFor(p: number): { index: number; label: string } {
	if (p < 0.33) return { index: 0, label: "Cargando modelo" };
	if (p < 0.7) return { index: 1, label: "Cargando texturas" };
	if (p < 1) return { index: 2, label: "Preparando audio" };
	return { index: 3, label: "Listo" };
}

export default function LoadingScreen({ progress, onEnter }: LoadingScreenProps) {
	// Progreso mostrado (0..1). Se persigue con un único bucle de animación que vive
	// toda la pantalla y es INDEPENDIENTE del framerate (suavizado con dt), así no
	// importa el refresco del monitor. Reglas de una barra profesional:
	//   - Solo sube, nunca retrocede (marca de agua). Antes, cuando el GLB empezaba
	//     a reportar 20% tras una subida simulada al 92%, la barra retrocedía →
	//     eso era el "trabado". Ahora el piso la fija y no baja.
	//   - Mientras el GLB no reporta, una subida suave (easing) que se asienta cerca
	//     del 90% da sensación de actividad sin mentir un "100%".
	//   - Cuando el progreso real llega, lidera; el simulado queda de piso suave.
	const [displayed, setDisplayed] = useState(0);
	// Espejo del `displayed` para que el rAF lea/escriba el valor en curso SIN
	// pasar por el state de React (el updater de setState debe ser puro y, en
	// StrictMode, se llama 2×; además así evitamos lecturas stalled).
	const displayedRef = useRef(0);
	// Vida del progreso real accesible al bucle (un solo rAF que no se reinicia al
	// cambiar `progress`, evitando enganches por teardown/restart del efecto).
	const progressRef = useRef(progress);
	// Marca de agua del progreso real: el valor más alto visto (nunca baja).
	const realHighRef = useRef(0);
	// Guarda contra doble clic: tras el primer "Entrar" el proyecto del museo ya
	// está en marcha; no queremos disparar el callback (ni el audio) dos veces.
	const enteredRef = useRef(false);

	useEffect(() => {
		progressRef.current = progress;
	}, [progress]);

	useEffect(() => {
		let raf = 0;
		let lastT = 0;
		// Avance simulado mientras el GLB no reporta (se asienta cerca de 0,9).
		let sim = 0;
		let settled = false; // ya llegó al objetivo y paró de pedir frames
		const EPS = 0.0008;

		const tick = (t: number) => {
			if (settled) return; // detenido: nada que animar
			raf = requestAnimationFrame(tick);
			if (!lastT) lastT = t;
			// Segundos transcurridos, acotados para no saltar tras huecos (tab oculto).
			const dt = Math.min(0.05, (t - lastT) / 1000);
			lastT = t;

			const p = progressRef.current;
			// Marca de agua del real: solo sube.
			if (p != null && p > realHighRef.current) realHighRef.current = p;

			// Subida simulada (easing exponencial hacia 0,9): piso de actividad.
			sim += (0.9 - sim) * Math.min(1, dt * 0.6);

			// Objetivo = lo más adelantado entre el real y el simulado. Nunca baja.
			const target = Math.max(sim, realHighRef.current);
			const realDone = realHighRef.current >= 1;

			// Calculamos el nuevo valor fuera del updater de setState: React exige
			// que ese updater sea puro (lo llama 2× en StrictMode), de modo que el
			// cancelAnimationFrame/settled no pueden vivir dentro. Usamos un ref
			// mutable para el valor en curso, así conservamos `prev` sin side effects.
			const prev = displayedRef.current;
			const floor = Math.max(prev, target); // solo sube (no retrocede)
			// Suavizado frame-rate independent: alcanza el piso sin saltos.
			const k = 1 - Math.exp(-dt * 8);
			let next = prev + (floor - prev) * k;
			// Si el real terminó (100%) y ya casi llegamos, snap a 1: la barra se
			// asienta exacta y DEJAMOS de pedir frames. Sin esto, el rAF seguiría
			// disparando setDisplayed en cada frame compitiendo con el render WebGL
			// → contribuye al "trabado" de la pantalla de carga.
			if (realDone && next > 1 - EPS) {
				next = 1;
				settled = true;
				cancelAnimationFrame(raf);
			}
			next = Math.min(1, next);
			displayedRef.current = next;
			setDisplayed(next);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, []);

	// Garantizar cierre consistente: el 100% real se asienta sin oscilar.
	const pct = Math.round(displayed * 100);
	const ready = (progress != null ? progress : 0) >= 1 || pct >= 100;

	const stage = useMemo(() => stageFor(progress ?? 0), [progress]);
	const stages = ["Modelo", "Texturas", "Audio", "Listo"];

	// Al pulsar "Entrar": llamamos a `onEnter` SÍNCRONAMENTE (sin `setTimeout`).
	// El padre arranca la música dentro de este mismo gesto del usuario; el
	// `AudioContext.resume()` así queda dentro del gesto válido que exige la
	// autoplay policy. Cualquier retardo (p. ej. un timer para animar un fade)
	// rompería esa asociación y el sonido nunca se reproduciría.
	const handleEnter = () => {
		if (enteredRef.current) return;
		enteredRef.current = true;
		onEnter();
	};

	return (
		<div
			aria-busy={!ready}
			aria-live="polite"
			className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden text-center"
		>
			{/* Backdrop del museo + velo para enfocar el centro */}
			<div className="museum-backdrop absolute inset-0" />
			<div className="absolute inset-0 bg-black/30" />

			{/* Sello animado */}
			<div className="relative ms-fade-up" style={{ animationDelay: "0.05s" }}>
				{/* Anillo exterior (gira lento) */}
				<svg
					className="ms-spin-slow h-44 w-44 text-amber-200/30 sm:h-52 sm:w-52"
					viewBox="0 0 100 100"
					fill="none"
					stroke="currentColor"
					strokeWidth="0.6"
					aria-hidden
				>
					<circle cx="50" cy="50" r="48" strokeLinecap="round" />
					<circle cx="50" cy="50" r="42" strokeDasharray="2 3" />
				</svg>
				{/* Anillo interior (gira sentido opuesto) */}
				<svg
					className="ms-spin-rev absolute inset-0 m-auto h-32 w-32 text-amber-300/40 sm:h-40 sm:w-40"
					viewBox="0 0 100 100"
					fill="none"
					stroke="currentColor"
					strokeWidth="0.8"
					aria-hidden
				>
					<circle cx="50" cy="50" r="46" strokeLinecap="round" strokeDasharray="40 60" />
				</svg>
				{/* Halo pulsante */}
				<span
					aria-hidden
					className="ms-pulse-ring absolute inset-0 m-auto h-24 w-24 rounded-full bg-amber-300/25 blur-xl"
				/>
				{/* Núcleo: monograma "M" */}
				<div className="absolute inset-0 m-auto flex h-20 w-20 items-center justify-center rounded-full border border-amber-200/30 bg-black/40 backdrop-blur-md sm:h-24 sm:w-24">
					<span className="bg-gradient-to-b from-amber-100 to-amber-300 bg-clip-text font-serif text-4xl font-semibold text-transparent sm:text-5xl">
						M
					</span>
				</div>
			</div>

			{/* Título + bajada */}
			<div className="relative mt-10">
				<h1 className="ms-fade-up bg-gradient-to-b from-white to-amber-100 bg-clip-text text-3xl font-semibold tracking-wide text-transparent sm:text-4xl" style={{ animationDelay: "0.15s" }}>
					Museo Boliviano
				</h1>
				<p className="ms-fade-up mt-3 text-sm uppercase tracking-[0.35em] text-amber-100/70" style={{ animationDelay: "0.25s" }}>
					Una experiencia patrimonial en 3D
				</p>
			</div>

			{/* Barra de progreso + porcentaje */}
			<div className="relative mt-8 w-72 max-w-[80vw] sm:w-80">
				<div className="ms-fade-up" style={{ animationDelay: "0.35s" }}>
					<div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
						{/* El ancho lo anima el rAF del efecto; SIN `transition-[width]`
						 encima: dos suavizados apilados (rAF + CSS) colisionan y, cuando el
						 hilo principal roba un frame, la transición se "pega" tarde y la
						 barra se traba. Un solo suavizado (rAF) = barrido limpio. */}
						<div
							className="ms-bar-fill h-full rounded-full bg-gradient-to-r from-amber-400 via-amber-200 to-amber-400"
							style={{ width: `${pct}%` }}
						/>
						{/* Brillo deslizante sobre la barra */}
						<div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
							<span className="ms-shimmer absolute top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
						</div>
					</div>
					<div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-white/55">
						<span>{stage.label}</span>
						<span className="tabular-nums text-amber-100/80">{pct}%</span>
					</div>
				</div>
			</div>

			{/* Indicador punto por etapa */}
			<div className="ms-fade-up mt-6 flex items-center gap-3" style={{ animationDelay: "0.45s" }}>
				{stages.map((s, i) => (
					<div key={s} className="flex items-center gap-2">
						<span
							className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
								i < stage.index
									? "bg-amber-300"
									: i === stage.index && !ready
										? "animate-pulse bg-amber-300/80"
										: ready
											? "bg-amber-300"
											: "bg-white/20"
							}`}
						/>
						<span className="text-[10px] uppercase tracking-widest text-white/40">{s}</span>
						{i < stages.length - 1 && <span className="mx-1 h-px w-4 bg-white/10" />}
					</div>
				))}
			</div>

			{/* Botón Entrar (solo cuando la carga terminó). Efectos para que el
			 usuario sepa que debe pulsarlo: un halo que "respira" (ms-enter-btn),
			 un anillo que se expande y se desvanece (ms-enter-ring), un brillo que
			 barre el interior (ms-enter-sheen) y una flecha con rebote que invita a
			 entrar (ms-enter-chevron). Todo declarado en globals.css y respeta
			 prefers-reduced-motion (se anulan allí). */}
			{ready && (
				<div className="ms-pop absolute bottom-16 inline-flex flex-col items-center" style={{ animationDelay: "0.1s" }}>
					<span aria-hidden className="ms-enter-ring pointer-events-none absolute inset-0 -m-3 rounded-full" />
					<button
						type="button"
						onClick={handleEnter}
						className="ms-enter-btn group relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-200/40 bg-amber-300/10 px-7 py-3 text-sm font-medium uppercase tracking-[0.25em] text-amber-100 shadow-lg shadow-amber-900/20 backdrop-blur-md transition-colors duration-300 hover:border-amber-200/80 hover:bg-amber-300/20 hover:text-white motion-reduce:transition-none"
					>
						{/* Brillo que barre el botón (detrás del texto). Sin `rotate-12`:
						 la animación `ms-enter-sheen` anima `transform: translateX`, y un
						 `rotate` estático de Tailwind sería pisado por la animación (saltos
						 de rotación al entrar/salir del keyframe = trabón visual). */}
						<span
							aria-hidden
							className="ms-enter-sheen absolute inset-y-0 left-0 z-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
						/>
						<span className="relative z-10">Entrar al museo</span>
						{/* Flecha con rebote que invita a pulsar */}
						<svg
							className="ms-enter-chevron relative z-10 h-4 w-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden
						>
							<path d="M5 12h14M13 6l6 6-6 6" />
						</svg>
					</button>
				</div>
			)}
		</div>
	);
}
