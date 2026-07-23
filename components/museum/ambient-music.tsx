// Música de ambiente del museo 3D.
//
// Reproduce `public/music/videoplayback.opus` en bucle INFINITO y SIN CORTES
// bruscos en la costura, usando la Web Audio API:
//   1. Se decodifica el archivo a un `AudioBuffer` (`decodeAudioData`).
//   2. Se calculan los límites de contenido útil (`computeLoopBounds`) descartando
//      el silencio inicial/final, y se aplican al source vía `loopStart`/`loopEnd`:
//      la costura del bucle no produce un "salto" (click) brusco al reiniciar,
//      queda limpia (sin copiar ni reconstruir el buffer).
//   3. Se monta un `AudioBufferSourceNode` con `loop = true`: precisión de muestra,
//      sin el hueco que deja el `loop` nativo del elemento <audio>.
//   4. Un `GainNode` común hace fade in/out (0,6 s) en play/pausa → sin clicks.
//
// El navegador (autoplay policy) solo permite sonido TRAS un gesto del usuario.
// Por eso el componente expone, vía ref, `autoplay()` / `play()` / `pause()` para
// que la pantalla de carga pueda disparar la reproducción al pulsar "Entrar" (ese
// clic es el gesto válido). `autoplay()` SIEMPRE suena (no respeta una preferencia
// "pausada" guardada) y desbloquea el `AudioContext` dentro de ese mismo clic.
//
// Si el opus aún no terminó de decodificarse cuando se llama `autoplay()`, el gesto
// ya hizo el `ctx.resume()` y dejamos el arranque pendiente: al acabar el decode lo
// dispara `load()`. Así nunca se pierde el sonido por una carrera entre la carga del
// GLB (que llena la barra) y la del opus (independiente).
//
// Si la Web Audio API no puede decodificar el opus, se degrada a un <audio loop>
// clásico (bucle con el leve hueco nativo, pero funcional). La preferencia
// play/pausa del BOTÓN se guarda en localStorage para recordarla entre recargas.
//
// El botón usa un ALTAVOZ con barras de ecualizador animadas cuando suena, y un
// altavoz "apagado" cuando está pausado — más llamativo y reconocible que play/pause.

"use client";

import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";

const MUSIC_URL = "/music/videoplayback.opus";
const STORAGE_KEY = "museo:ambient-music-playing";
// Volumen de ambiente (coro de apoyo, no debe tapar la locución por voz del museo).
const TARGET_GAIN = 0.55;
// Fade suave al arrancar/detener (segundos): evita "clicks" abruptos.
const FADE_SECONDS = 0.6;
// Umbral de amplitud para considerar una muestra como "silencio" al recortar los
// bordes del buffer y dejar un bucle limpio.
const SILENCE_THRESHOLD = 0.011;

type Status = "loading" | "playing" | "paused" | "unsupported";

/** API que el componente expone a su padre (p. ej. la pantalla de carga). */
export type AmbientMusicHandle = {
	/** Arranca la música SIEMPRE al "Entrar" (no respeta preferencia guardada). Gesto válido. */
	autoplay: () => void;
	/** Arranca la música sin importar la preferencia guardada. */
	play: () => void;
	/** Pausa la música. */
	pause: () => void;
};

/** Lee la preferencia guardada (default: reproduciendo). */
function readStoredPreference(): boolean {
	if (typeof window === "undefined") return true;
	try {
		return window.localStorage.getItem(STORAGE_KEY) !== "0";
	} catch {
		return true;
	}
}

/**
 * Calcula los límites de muestra (índices en el canal 0) del contenido útil del
 * buffer, descartando el silencio inicial/final. En lugar de copiar el recorte a
 * un `AudioBuffer` nuevo, estos índices se aplican a `AudioBufferSourceNode` vía
 * `loopStart`/`loopEnd`: así el bucle (`loop = true`) salta el silencio de los
 * bordes y la costura queda limpia, sin copiar memoria ni reconstruir el buffer.
 *
 * Devuelve `null` cuando no hay silencio que recortar (bucle del buffer entero).
 */
function computeLoopBounds(buffer: AudioBuffer): { start: number; end: number } | null {
	const len = buffer.length;
	if (len < 2 || buffer.numberOfChannels === 0) return null;

	const data = buffer.getChannelData(0);
	let start = 0;
	while (start < len && Math.abs(data[start]) < SILENCE_THRESHOLD) start++;
	let end = len - 1;
	while (end > start && Math.abs(data[end]) < SILENCE_THRESHOLD) end--;

	// Margen de unas pocas muestras a cada lado → suaviza aún más la costura sin
	// reintroducir silencio perceptible.
	const pad = 32;
	start = Math.max(0, start - pad);
	end = Math.min(len - 1, end + pad);

	if (start === 0 && end === len - 1) return null; // sin recorte necesario
	return { start, end };
}

/** Persiste la preferencia play/pausa (tolerante a localStorage inaccesible). */
function writeStoredPreference(playing: boolean) {
	try {
		window.localStorage.setItem(STORAGE_KEY, playing ? "1" : "0");
	} catch {
		// noop
	}
}

const AmbientMusic = forwardRef<AmbientMusicHandle>(function AmbientMusic(_props, ref) {
	const [status, setStatus] = useState<Status>("loading");

	// AudioContext + grafo persistente.
	const ctxRef = useRef<AudioContext | null>(null);
	const gainRef = useRef<GainNode | null>(null);
	// Buffer decodificado (una sola vez).
	const bufferRef = useRef<AudioBuffer | null>(null);
	// Límites de bucle (índices de muestra) que recortan el silencio de los bordes,
	// aplicados al `AudioBufferSourceNode` vía `loopStart`/`loopEnd`. `null` = bucle
	// del buffer entero (sin silencio que recortar).
	const loopBoundsRef = useRef<{ start: number; end: number } | null>(null);
	// Nodo fuente activo (se recrea en cada play; solo arranca una vez).
	const sourceRef = useRef<AudioBufferSourceNode | null>(null);
	// <audio> de respaldo si falla la Web Audio API.
	const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
	// Ya arrancó alguna vez (evita reintentos tras gesto si ya está sonando).
	const startedRef = useRef(false);
	// El usuario quiere música pero no se ha llamado a autoplay/play (autoplay policy).
	const desiredPlayingRef = useRef(true);
	// El usuario pulsó "Entrar" ANTES de que el opus terminara de decodificarse:
	// se recordó el intento y se arranca al acabar el decode. El `ctx.resume()` (lo
	// que exige la autoplay policy) ya se disparó DENTRO del gesto del clic.
	const autoplayPendingRef = useRef(false);

	// Reloj del AudioContext (para programar los fades con precisión de muestra).
	const now = useCallback(() => ctxRef.current?.currentTime ?? 0, []);

	// Detener el source en curso (sin fade, para limpieza urgente). Declarado antes
	// del effect de montaje porque su cleanup lo invoca.
	const stopSourceNow = useCallback(() => {
		const s = sourceRef.current;
		if (!s) return;
		try {
			s.onended = null;
			s.stop();
		} catch {
			// Ya detenido: ignorar.
		}
		try {
			s.disconnect();
		} catch {
			// noop
		}
		sourceRef.current = null;
	}, []);

	// Arrancar reproducción con Web Audio (bucle sin cortes + fade in).
	const startPlayback = useCallback(() => {
		const ctx = ctxRef.current;
		const gain = gainRef.current;
		const buffer = bufferRef.current;
		if (!ctx || !gain || !buffer) return;

		startedRef.current = true;

		stopSourceNow();
		void ctx.resume().then(
			() => {
				if (!ctxRef.current || !gainRef.current || !bufferRef.current) return;
				const source = ctx.createBufferSource();
				source.buffer = buffer;
				source.loop = true;
				// Recorte del silencio de los bordes → costura del bucle limpia.
				const bounds = loopBoundsRef.current;
				if (bounds) {
					source.loopStart = bounds.start / buffer.sampleRate;
					source.loopEnd = bounds.end / buffer.sampleRate;
				}
				source.connect(gain);

				const t = now();
				gain.gain.cancelScheduledValues(t);
				gain.gain.setValueAtTime(0.0001, t);
				gain.gain.linearRampToValueAtTime(TARGET_GAIN, t + FADE_SECONDS);

				source.start(0);
				sourceRef.current = source;
				setStatus("playing");
			},
			() => {
				// Context suspendido (autoplay bloqueado): queda a la espera.
				setStatus("paused");
			},
		);
	}, [stopSourceNow, now]);

	// Arrancar el <audio> de respaldo.
	const startFallback = useCallback(() => {
		startedRef.current = true;
		const a = fallbackAudioRef.current;
		if (!a) return;
		const p = a.play();
		if (p && typeof p.then === "function") {
			p.then(() => setStatus("playing"), () => setStatus("paused"));
		} else {
			setStatus("playing");
		}
	}, []);

	// Inicialización una sola vez: crear contexto, decodificar, recortar. NO arranca
	// la reproducción por sí mismo: el padre dispara `autoplay()` al cerrar la
	// pantalla de carga (ese gesto desbloquea el audio). Declarado DESPUÉS de
	// `startPlayback`/`startFallback` porque `load()` los invoca si quedó un
	// "Entrar" pendiente (el effect corre tras el render, cuando ya existen).
	useEffect(() => {
		if (typeof window === "undefined") return;
		let cancelled = false;

		const wantPlaying = readStoredPreference();
		desiredPlayingRef.current = wantPlaying;

		const Ctor: typeof AudioContext | undefined =
			window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) {
			// Detección de API del navegador (un solo setState de feature-check): no
			// es sincronización con estado React, sino reporte de capacidad del runtime.
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setStatus("unsupported");
			return;
		}

		const ctx = new Ctor();
		const gain = ctx.createGain();
		gain.gain.value = 0;
		gain.connect(ctx.destination);
		ctxRef.current = ctx;
		gainRef.current = gain;

		async function load() {
			try {
				const res = await fetch(MUSIC_URL);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data = await res.arrayBuffer();
				const audioBuffer = await ctx.decodeAudioData(data);
				if (cancelled) return;
				bufferRef.current = audioBuffer;
				loopBoundsRef.current = computeLoopBounds(audioBuffer);
				setStatus("paused");
				// Si "Entrar" llegó antes de que el opus estuviera listo, el intento
				// quedó pendiente: ahora arrancamos la reproducción (el gesto del clic
				// ya hizo ctx.resume() dentro de autoplay()).
				if (autoplayPendingRef.current) {
					autoplayPendingRef.current = false;
					startPlayback();
				}
			} catch {
				if (cancelled) return;
				// Sin Web Audio utilizable: degradar a <audio loop> clásico.
				bufferRef.current = null;
				const a = new Audio(MUSIC_URL);
				a.loop = true;
				a.volume = TARGET_GAIN;
				fallbackAudioRef.current = a;
				setStatus("paused");
				// Igual que en la rama de éxito: si "Entrar" llegó antes, arrancar ya.
				if (autoplayPendingRef.current) {
					autoplayPendingRef.current = false;
					startFallback();
				}
			}
		}

		void load();

		return () => {
			cancelled = true;
			stopSourceNow();
			if (fallbackAudioRef.current) {
				fallbackAudioRef.current.pause();
				fallbackAudioRef.current.src = "";
			}
			void ctx.close();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [startPlayback, startFallback]);

	// Pausar con fade out (Web Audio) o pausa directa (respaldo).
	const pausePlayback = useCallback(() => {
		startedRef.current = false;
		const ctx = ctxRef.current;
		const gain = gainRef.current;
		const source = sourceRef.current;

		if (ctx && gain && source) {
			const t = now();
			gain.gain.cancelScheduledValues(t);
			gain.gain.setValueAtTime(gain.gain.value, t);
			gain.gain.linearRampToValueAtTime(0.0001, t + FADE_SECONDS);
			source.onended = () => stopSourceNow();
			try {
				source.stop(t + FADE_SECONDS + 0.05);
			} catch {
				stopSourceNow();
			}
		} else if (fallbackAudioRef.current) {
			fallbackAudioRef.current.pause();
		}
		setStatus("paused");
	}, [stopSourceNow, now]);

	// Arranca la música al pulsar "Entrar" (gesto que desbloquea el audio).
	//
	//   - NO respeta la preferencia guardada: el "Entrar" SIEMPRE suena. Así se evita
	//     el conflicto con el botón pausar/reproducir: si el usuario pausó en una
	//     sesión anterior quedó "0" en localStorage y este autoplay se quedaba mudo
	//     al recargar. El botón sigue funcionando después para pausar/reanudar.
	//   - Llama a `ctx.resume()` AQUÍ, dentro del clic, aunque el opus aún no esté
	//     decodificado: la autoplay policy exige el resume dentro del gesto. Si el
	//     buffer aún no está, marcamos pendiente y `load()` arranca al terminar.
	const autoplay = useCallback(() => {
		const ctx = ctxRef.current;
		if (ctx) void ctx.resume(); // gesto válido → desbloquea el AudioContext ya
		if (bufferRef.current) {
			autoplayPendingRef.current = false;
			startPlayback();
		} else if (fallbackAudioRef.current) {
			autoplayPendingRef.current = false;
			startFallback();
		} else {
			// Decode (o armado del <audio> de respaldo) en curso: arrancará al acabar.
			autoplayPendingRef.current = true;
		}
	}, [startPlayback, startFallback]);

	// API imperativa para el padre (pantalla de carga).
	useImperativeHandle(
		ref,
		() => ({
			autoplay,
			play: () => {
				desiredPlayingRef.current = true;
				writeStoredPreference(true);
				if (bufferRef.current) startPlayback();
				else if (fallbackAudioRef.current) startFallback();
			},
			pause: () => {
				desiredPlayingRef.current = false;
				writeStoredPreference(false);
				pausePlayback();
			},
		}),
		[autoplay, startPlayback, startFallback, pausePlayback],
	);

	// Alternar play/pausa desde el botón (el clic es gesto válido → resume el context).
	const toggle = useCallback(() => {
		if (status === "playing") {
			desiredPlayingRef.current = false;
			writeStoredPreference(false);
			pausePlayback();
		} else {
			desiredPlayingRef.current = true;
			writeStoredPreference(true);
			if (bufferRef.current) startPlayback();
			else if (fallbackAudioRef.current) startFallback();
		}
	}, [status, pausePlayback, startPlayback, startFallback]);

	if (status === "unsupported") return null;

	const playing = status === "playing";

	return (
		<div className="pointer-events-auto absolute right-4 top-4 z-30 sm:right-6 sm:top-6">
			<button
				type="button"
				onClick={toggle}
				aria-pressed={playing}
				aria-label={playing ? "Pausar música de ambiente" : "Reproducir música de ambiente"}
				title={playing ? "Pausar música de ambiente" : "Reproducir música de ambiente"}
				className="group relative flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/50 text-amber-100 shadow-lg shadow-black/40 backdrop-blur-md transition-colors duration-300 hover:border-amber-200/40 hover:bg-black/70 hover:text-white motion-reduce:transition-none"
			>
				{/* Halo pulsante solo cuando suena */}
				{playing && (
					<span
						aria-hidden
						className="ms-pulse-ring absolute h-11 w-11 rounded-full bg-amber-300/30"
					/>
				)}
				<SpeakerIcon playing={playing} />
			</button>
		</div>
	);
});

export default AmbientMusic;

/**
 * Altavoz (bocina) con barras de ecualizador animadas cuando `playing`. Apagado
 * (sin ondas + línea tachada) cuando está en pausa. SVG inline para heredar el
 * color del botón y escalar sin pixelar.
 */
function SpeakerIcon({ playing }: { playing: boolean }) {
	return (
		<svg
			viewBox="0 0 24 24"
			className="relative h-5 w-5"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
		>
			{/* Cuerpo del altavoz */}
			<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" />

			{playing ? (
				// Barras de ecualizador animadas (clase .ms-eq-bar en globals.css).
				<g className="relative ml-1 inline-flex items-end gap-[2px]" transform="translate(13.5 6.5)">
					<rect className="ms-eq-bar" x="0" y="0" height="11" width="2.2" rx="1" fill="currentColor" stroke="none" style={{ animationDelay: "0s" }} />
					<rect className="ms-eq-bar" x="4" y="0" height="11" width="2.2" rx="1" fill="currentColor" stroke="none" style={{ animationDelay: "0.22s" }} />
					<rect className="ms-eq-bar" x="8" y="0" height="11" width="2.2" rx="1" fill="currentColor" stroke="none" style={{ animationDelay: "0.45s" }} />
				</g>
			) : (
				// Altavoz apagado: ondas discretas + línea tachada.
				<>
					<path d="M15.5 8.5a5 5 0 0 1 0 7" />
					<path d="M18 6a8.5 8.5 0 0 1 0 12" opacity="0.5" />
					<path d="M16.5 4.5 21 19.5" />
				</>
			)}
		</svg>
	);
}
