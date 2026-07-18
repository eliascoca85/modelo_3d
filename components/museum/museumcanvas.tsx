"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, ThreeEvent, useThree } from "@react-three/fiber";
import {
	Html,
	OrbitControls,
	useGLTF,
	useTexture,
} from "@react-three/drei";
import {
	Box3,
	Color,
	Material,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	SRGBColorSpace,
	Texture,
	Vector3,
} from "three";

import { cuadroDisplayName, CUADRO_NAME_PATTERN, type Cuadro } from "@/types/cuadros";

const MODEL_URL = "/models/museo-compresion.glb";

type SelectedArtifact = {
	name: string;
	label: string;
	description: string;
	isMonolith: boolean;
	isChachapuma: boolean;
	isFuente: boolean;
	isInteractive: boolean;
	isCuadro: boolean;
	position?: Vector3;
	lookDirection?: Vector3;
	/** Altura de cámara sobre el target (esculturas); 0 = usar solo lookDirection */
	eyeHeight?: number;
};

type MuseumSceneProps = {
	cuadros: Cuadro[];
	onSelectArtifact: (artifact: SelectedArtifact) => void;
	onTargetsDetected: (targets: string[]) => void;
};

function resolveObjectLabel(object: Object3D | null): string {
	let current: Object3D | null = object;

	while (current) {
		const name = current.name.trim();

		if (name && name.toLowerCase() !== "scene") {
			return name;
		}

		current = current.parent;
	}

	return "pieza sin nombre";
}

function findNamedObject(object: Object3D | null): Object3D | null {
	let current: Object3D | null = object;

	while (current) {
		const name = current.name.trim();
		if (name && name.toLowerCase() !== "scene") {
			return current;
		}
		current = current.parent;
	}
	return null;
}

function computeViewParams(
	clickedObject: Object3D,
	namedObject: Object3D,
	name: string,
	faceNormal?: Vector3,
): { position: Vector3; lookDirection: Vector3; eyeHeight: number } {
	const nameLower = name.toLowerCase();
	const isCuadro = CUADRO_NAME_PATTERN.test(nameLower);
	const isMonolith = /monolito/i.test(nameLower);
	const isChachapuma = /chachapuma/i.test(nameLower);
	const isFuente = /fuente/i.test(nameLower);
	const isPintura = /pintura/i.test(nameLower);
	const isPresentacion = /^presentacion_\d+$/i.test(nameLower);
	const isNode = /^node_\d+_\d+$/i.test(nameLower);

	const center = new Vector3();
	let lookDirection: Vector3;
	let eyeHeight = 0;

	if (isCuadro || isPintura || isPresentacion || isNode) {
		// Posición = centro del mesh clickeado (preciso para planos)
		new Box3().setFromObject(clickedObject).getCenter(center);

		// Objetos planos: usar la NORMAL DE LA CARA CLICKEADA (la más precisa)
		if (faceNormal) {
			lookDirection = faceNormal.clone().normalize();
		} else {
			const localForward = new Vector3(0, 0, -1);
			lookDirection = localForward.clone().transformDirection(namedObject.matrixWorld).normalize();
		}
		const toCamera = new Vector3(-7, 1.3, 7.5).sub(center).normalize();
		if (lookDirection.dot(toCamera) < 0) {
			lookDirection.negate();
		}
		if (nameLower === "cuadro_14") lookDirection.negate();
	} else if (isMonolith || isChachapuma || isFuente) {
		// Centro del objeto completo para un encuadre estable
		const namedBox = new Box3().setFromObject(namedObject);
		namedBox.getCenter(center);
		const size = new Vector3();
		namedBox.getSize(size);

		// Tras export Blender→glTF: local ±Z = vertical.
		// Cada mesh tiene un eje frontal distinto en local XY.
		let localForward: Vector3;
		if (isChachapuma) {
			localForward = new Vector3(1, 0, 0); // +X confirmado
		} else {
			// monolito / fuente: +X es lateral; +Y es la cara frontal
			localForward = new Vector3(0, 1, 0);
		}
		lookDirection = localForward.clone().transformDirection(namedObject.matrixWorld);
		// Mantener dirección horizontal: la altura de cámara va aparte (evita tirón de OrbitControls)
		lookDirection.y = 0;
		if (lookDirection.lengthSq() < 1e-8) {
			lookDirection.set(0, 0, 1);
		} else {
			lookDirection.normalize();
		}

		// Mirar un poco por encima del centro geométrico + cámara ligeramente elevada
		if (isMonolith) {
			center.y += size.y * 0.12;
			eyeHeight = Math.max(size.y * 0.18, 0.35);
		} else if (isFuente) {
			center.y += size.y * 0.08;
			eyeHeight = Math.max(size.y * 0.22, 0.28);
		} else {
			center.y += size.y * 0.1;
			eyeHeight = Math.max(size.y * 0.2, 0.3);
		}
	} else {
		new Box3().setFromObject(clickedObject).getCenter(center);
		lookDirection = new Vector3(-7, 1.3, 7.5).sub(center).normalize();
	}

	return { position: center, lookDirection, eyeHeight };
}

function buildArtifactDetails(
	name: string,
	cuadrosMap: Map<string, Cuadro>,
	clickedObject: Object3D,
	namedObject: Object3D,
	faceNormal?: Vector3,
): SelectedArtifact {
	const normalizedName = name.trim() || "pieza sin nombre";
	const isMonolith = /monolito/i.test(normalizedName);
	const isChachapuma = /chachapuma/i.test(normalizedName);
	const isFuente = /fuente/i.test(normalizedName);
	const isPintura = /pintura/i.test(normalizedName);
	const isPresentacion = /^presentacion_\d+$/i.test(normalizedName);
	const isNode = /^node_\d+_\d+$/i.test(normalizedName);
	const isCuadro = CUADRO_NAME_PATTERN.test(normalizedName);
	const isInteractive = isMonolith || isChachapuma || isFuente || isPintura || isPresentacion || isNode || isCuadro;

	let label = normalizedName;
	let description = "Pieza interactiva detectada en la escena exportada desde Blender.";

	if (isCuadro || isPintura || isPresentacion) {
		const record = cuadrosMap.get(normalizedName.toLowerCase());
		label = cuadroDisplayName(normalizedName);
		description =
			record?.description?.trim() ||
			"Esta pieza aún no tiene una descripción cargada desde la administración.";
	} else if (isMonolith) {
		label = "Monolito";
		description = "Elemento principal del museo. Se detecta por nombre desde Blender y está listo para interacción.";
	} else if (isChachapuma) {
		label = "Chachapuma";
		description = "Escultura prehispánica zoomorfa tallada en piedra que representa al hombre-puma, un símbolo sagrado de poder y fuerza.";
	} else if (isFuente) {
		label = "Fuente";
		description = "Fuente de piedra tallada, utilizada en rituales y ceremonias del museo inmersivo.";
	} else if (isNode) {
		label = "Nodo";
		description = "Elemento interactivo del museo.";
	}

	// Calcular posición y dirección de vista correctas según el tipo de objeto
	const { position, lookDirection, eyeHeight } = computeViewParams(
		clickedObject,
		namedObject,
		normalizedName,
		faceNormal,
	);

	return {
		name: normalizedName,
		label,
		description,
		isMonolith,
		isChachapuma,
		isFuente,
		isInteractive,
		isCuadro,
		position,
		lookDirection,
		eyeHeight,
	};
}

function applyTextureTo(material: Material | Material[], texture: Texture) {
	const list = Array.isArray(material) ? material : [material];
	for (const mat of list) {
		const standard = mat as MeshStandardMaterial;
		if ("map" in standard) {
			standard.map = texture;
			standard.color = new Color(0xffffff);
			standard.needsUpdate = true;
		}
	}
}

/**
 * `useTexture` (drei) lanza dentro del Suspense al fallar la carga de una
 * textura (p. ej. 404). Sin este boundary, ese error derribaba toda la escena
 * 3D. Atrapa el fallo y degrada esa pieza a "sin textura" en su lugar.
 */
class CuadroTextureErrorBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state: { failed: boolean } = { failed: false };

	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true };
	}

	componentDidCatch(error: unknown) {
		console.warn("CuadroTexture: no se pudo cargar la textura, se omite.", error);
	}

	render() {
		return this.state.failed ? null : this.props.children;
	}
}

function CuadroTexture({
	name,
	url,
	scene,
}: {
	name: string;
	url: string;
	scene: Object3D;
}) {
	const texture = useTexture(url);

	useEffect(() => {
		texture.colorSpace = SRGBColorSpace;
		texture.flipY = false;
		texture.needsUpdate = true;

		const target = scene.getObjectByName(name);
		if (!target) return;

		const meshes: Mesh[] = [];
		target.traverse((obj) => {
			const mesh = obj as Mesh;
			if (mesh.isMesh) meshes.push(mesh);
		});

		// Material compartido: el GLB usa una MISMA instancia de material para
		// varios cuadros (material[55] lo comparten cuadro_3, cuadro_4,
		// cuadro_15..20 y cuadro_21). Mutar `.map` en ese material contagia la
		// textura a todos los que la referencian. Clonamos el material por
		// mesh para aislar la textura a este cuadro, y restauramos el original
		// (descartando el clon) al desmontar.
		const originalMaterials = meshes.map((m) => m.material);
		for (const m of meshes) {
			m.material = Array.isArray(m.material)
				? m.material.map((mat) => mat.clone())
				: m.material.clone();
		}
		for (const m of meshes) applyTextureTo(m.material, texture);

		return () => {
			meshes.forEach((m, i) => {
				const cloned = m.material;
				m.material = originalMaterials[i];
				const list = Array.isArray(cloned) ? cloned : [cloned];
				for (const mat of list) mat.dispose();
			});
		};
	}, [texture, scene, name]);

	return null;
}

function MuseumScene({
	cuadros,
	onSelectArtifact,
	onTargetsDetected,
}: MuseumSceneProps) {
	const { scene } = useGLTF(MODEL_URL, true, true);

	const cuadrosMap = useMemo(() => {
		const map = new Map<string, Cuadro>();
		for (const c of cuadros) map.set(c.name.toLowerCase(), c);
		return map;
	}, [cuadros]);

	const texturedCuadros = useMemo(
		() => cuadros.filter((c) => Boolean(c.imageUrl)),
		[cuadros],
	);

	const frame = useMemo(() => {
		const box = new Box3().setFromObject(scene);
		const size = new Vector3();
		const center = new Vector3();

		box.getSize(size);
		box.getCenter(center);

		const maxDimension = Math.max(size.x, size.y, size.z) || 1;
		const scale = Math.min(8.8 / maxDimension, 6.4);

		return {
			center,
			scale,
			maxDimension,
		};
	}, [scene]);

	const detectedTargets = useMemo(() => {
		const targets = new Set<string>();

		scene.traverse((child) => {
			if ((child as Mesh).isMesh) {
				const mesh = child as Mesh;

				mesh.castShadow = true;
				mesh.receiveShadow = true;

				const resolvedLabel = resolveObjectLabel(mesh);

				if (resolvedLabel && resolvedLabel !== "pieza sin nombre") {
					targets.add(resolvedLabel);
				}
			}
		});

		return Array.from(targets);
	}, [scene]);

	useEffect(() => {
		onTargetsDetected(detectedTargets);
	}, [detectedTargets, onTargetsDetected]);

	useEffect(() => {
		if (typeof document === "undefined") {
			return;
		}

		document.body.style.cursor = "default";

		return () => {
			document.body.style.cursor = "default";
		};
	}, []);

	const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
		event.stopPropagation();
		document.body.style.cursor = "pointer";
	};

	const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
		event.stopPropagation();
		document.body.style.cursor = "default";
	};

	const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
		event.stopPropagation();

		// Objeto clickeado (mesh exacto) para posición precisa
		const clickedObject = event.object;
		// Objeto con nombre significativo para orientación
		const namedObject = findNamedObject(event.object) || clickedObject;

		// Obtener la normal de la cara clickeada (en espacio mundo) para objetos planos
		const mesh = event.object as Mesh;
		let faceNormal: Vector3 | undefined;
		if (event.face?.normal) {
			faceNormal = event.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();
		}

		onSelectArtifact(
			buildArtifactDetails(
				resolveObjectLabel(event.object),
				cuadrosMap,
				clickedObject,
				namedObject,
				faceNormal,
			),
		);
	};

	return (
		<group
			position={[-frame.center.x * frame.scale, -frame.center.y * frame.scale, -frame.center.z * frame.scale]}
			scale={frame.scale}
			onPointerOver={handlePointerOver}
			onPointerOut={handlePointerOut}
			onPointerDown={handlePointerDown}
		>
			<primitive object={scene} dispose={null} />
			{texturedCuadros.map((c) => (
				// key por URL (no por name): si esta textura falló y luego se
				// re-sube la imagen desde el admin (la URL cambia su ?v=), el
				// boundary se reinicia y reintenta la carga nueva en lugar de
				// quedar pegado en "fallado".
				<CuadroTextureErrorBoundary key={c.imageUrl}>
					<CuadroTexture
						name={c.name}
						url={c.imageUrl as string}
						scene={scene}
					/>
				</CuadroTextureErrorBoundary>
			))}
		</group>
	);
}

function LoadingOverlay() {
	return (
		<Html center>
			<div className="rounded-full border border-white/15 bg-black/60 px-4 py-2 text-sm text-white/80 backdrop-blur-md">
				Cargando museo...
			</div>
		</Html>
	);
}

function CameraLight() {
	const { camera } = useThree();

	return (
		<pointLight
			position={camera.position}
			intensity={3}
			color="#ffffff"
			distance={30}
			decay={1.2}
		/>
	);
}

function MuseumView({ cuadros }: { cuadros: Cuadro[] }) {
	const [selectedArtifact, setSelectedArtifact] = useState<SelectedArtifact | null>(null);
	const [availableTargets, setAvailableTargets] = useState<string[]>([]);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const controlsRef = useRef<any>(null);
	const animationFrameIdRef = useRef<number | null>(null);

	const monolithTarget = useMemo(
		() => availableTargets.find((target) => /monolito/i.test(target)) ?? null,
		[availableTargets],
	);

	// Animar cámara y target suavemente cuando se abre o se cierra la tarjeta
	useEffect(() => {
		if (!controlsRef.current) return;

		const controls = controlsRef.current;

		// Cancelar la animación anterior si está en curso
		if (animationFrameIdRef.current !== null) {
			cancelAnimationFrame(animationFrameIdRef.current);
			animationFrameIdRef.current = null;
		}

		const startPosition = controls.object.position.clone();
		const startTarget = controls.target.clone();

		let finalPosition: Vector3;
		let finalTarget: Vector3;

		if (selectedArtifact?.isInteractive && selectedArtifact.position && selectedArtifact.lookDirection) {
			finalTarget = selectedArtifact.position.clone();

			const name = selectedArtifact.name.toLowerCase();
			const isCuadro = selectedArtifact.isCuadro;
			const isMonolith = selectedArtifact.isMonolith;
			const isChachapuma = selectedArtifact.isChachapuma;
			const isFuente = selectedArtifact.isFuente;
			const isPintura = /pintura/i.test(name);
			const isPresentacion = /^presentacion_\d+$/i.test(name);
			const isNode = /^node_\d+_\d+$/i.test(name);
			const isSculpture = isMonolith || isChachapuma || isFuente;

			// Distancias de zoom por tipo de objeto
			let zoomDist: number;

			if (isCuadro) {
				zoomDist = name === "cuadro_12" ? 1.5 : name === "cuadro_14" ? 1.7 : 1.4;
			} else if (isPintura) {
				zoomDist = 2.2;
			} else if (isPresentacion) {
				zoomDist = 2.0;
			} else if (isNode) {
				zoomDist = 2.5;
			} else if (isMonolith) {
				zoomDist = 3.6;
			} else if (isChachapuma) {
				zoomDist = 3.2;
			} else if (isFuente) {
				zoomDist = 2.8;
			} else {
				zoomDist = 3.5;
			}

			let finalLookDir = selectedArtifact.lookDirection.clone();
			if (isSculpture) {
				// Frente horizontal + altura aparte → encuadre frontal sin ángulo raro
				finalLookDir.y = 0;
				finalLookDir.normalize();
				finalPosition = finalTarget.clone().add(finalLookDir.multiplyScalar(zoomDist));
				finalPosition.y = finalTarget.y + (selectedArtifact.eyeHeight ?? 0.3);
			} else {
				if (isNode) {
					finalLookDir = new Vector3(finalLookDir.x, finalLookDir.y + 0.7, finalLookDir.z).normalize();
				} else if (isCuadro || isPintura || isPresentacion) {
					finalLookDir = new Vector3(finalLookDir.x, finalLookDir.y + 0.12, finalLookDir.z).normalize();
				}
				finalPosition = selectedArtifact.position.clone().add(
					finalLookDir.multiplyScalar(zoomDist),
				);
			}
		} else {
			// Valores originales
			finalTarget = new Vector3(0, -0.5, 0);
			finalPosition = new Vector3(-7, 1.3, 7.5);
		}

		// Si ya está prácticamente en el destino, no es necesario animar
		if (startPosition.distanceTo(finalPosition) < 0.001 && startTarget.distanceTo(finalTarget) < 0.001) {
			return;
		}

		// Evitar que OrbitControls recorte el ángulo a mitad/final de la animación
		const prevEnabled = controls.enabled;
		const prevMaxPolar = controls.maxPolarAngle;
		controls.enabled = false;
		controls.maxPolarAngle = Math.PI;

		const duration = 2000;
		const startTime = performance.now();

		function animateCamera(currentTime: number) {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);

			// Ease-in-out suave (sin frenazo brusco al final)
			const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);

			controls.object.position.lerpVectors(startPosition, finalPosition, eased);
			controls.target.lerpVectors(startTarget, finalTarget, eased);
			controls.update();

			if (progress < 1) {
				animationFrameIdRef.current = requestAnimationFrame(animateCamera);
			} else {
				controls.object.position.copy(finalPosition);
				controls.target.copy(finalTarget);
				controls.maxPolarAngle = prevMaxPolar;
				controls.enabled = prevEnabled;
				controls.update();
				animationFrameIdRef.current = null;
			}
		}

		animationFrameIdRef.current = requestAnimationFrame(animateCamera);

		return () => {
			if (animationFrameIdRef.current !== null) {
				cancelAnimationFrame(animationFrameIdRef.current);
			}
			controls.maxPolarAngle = prevMaxPolar;
			controls.enabled = prevEnabled;
		};
	}, [selectedArtifact]);

	return (
		<section
			className="relative h-screen w-screen overflow-hidden bg-[#050816] text-white"
		>
			<div className="museum-backdrop absolute inset-0" />
			<div className="absolute inset-0">
				<Canvas
					shadows
					dpr={[1, 1.75]}
					camera={{ position: [-7, 1.3, 7.5], fov: 31 }}
					gl={{
						alpha: true,
						antialias: true,
						powerPreference: "high-performance"
					}}
					className="h-full w-full"
				>
					<color attach="background" args={['#050816']} />
					<fog attach="fog" args={['#050816', 10, 30]} />

					{/* Luz direccional principal para sombras limpias */}
					<directionalLight
						position={[5, 8, 5]}
						intensity={10}
						color="#ffffff"
						castShadow
						shadow-mapSize={[1024, 1024]}
						shadow-camera-left={-10}
						shadow-camera-right={10}
						shadow-camera-top={10}
						shadow-camera-bottom={-10}
						shadow-camera-near={0.1}
						shadow-camera-far={30}
					/>

					{/* Relleno ambiental mejorado */}
					<ambientLight intensity={1.0} color="#f0e6d8" />

					{/* Pared izquierda — cuadros y esculturas (intensidad aumentada) */}
					<pointLight position={[-3.5, 4, 1.5]} intensity={4.0} color="#fff5e6" distance={20} decay={1} />

					{/* Pared del fondo — galería de cuadros (más focalizado) */}
					<pointLight position={[0.5, 4.5, -3]} intensity={3.5} color="#fff8dc" distance={20} decay={1} />

					{/* Vitrina central — pieza destacada (iluminación más fuerte) */}
					<pointLight position={[2, 4, 2]} intensity={6.0} color="#ffffff" distance={20} decay={0.7} />

					{/* Pared derecha — escultura y cuadro grande */}
					<pointLight position={[4, 4.5, -0.5]} intensity={4.0} color="#fff5e6" distance={20} decay={1} />

					{/* Cenital suave — iluminación general desde arriba */}
					<pointLight position={[0, 6.5, 0]} intensity={2.5} color="#f0e6ff" distance={30} decay={0.8} />

					{/* Relleno lateral izquierdo para suavizar sombras */}
					<pointLight position={[-2.5, 2.5, 3.5]} intensity={1.5} color="#e8e0d0" distance={18} decay={1.2} />

					{/* Relleno lateral derecho para suavizar sombras */}
					<pointLight position={[2.5, 2.5, 3.5]} intensity={1.5} color="#e8e0d0" distance={18} decay={1.2} />

					{/* Luz de relleno desde abajo para reducir contrastes extremos */}
					<pointLight position={[0, -1, 2]} intensity={1.0} color="#d8d0c0" distance={15} decay={1.5} />

					{/* Contraluz fuerte desde atrás para crear siluetas y sombras dramáticas */}
					<pointLight position={[0, 3, -5]} intensity={6.0} color="#ffffff" distance={25} decay={0.8} />

					{/* Luz que sigue la cámara */}
					<CameraLight />

					<Suspense fallback={<LoadingOverlay />}>
						<MuseumScene
							cuadros={cuadros}
							onSelectArtifact={setSelectedArtifact}
							onTargetsDetected={setAvailableTargets}
						/>
					</Suspense>

					<OrbitControls
						ref={controlsRef}
						enablePan={false}
						minDistance={0.3}
						maxDistance={13}
						maxPolarAngle={Math.PI * 0.56}
						target={[0, -0.5, 0]}
						autoRotate={false}
					/>
				</Canvas>
			</div>

			{selectedArtifact ? (
				<div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-end p-4 sm:p-6 lg:p-8">
					<div className="pointer-events-auto w-full max-w-md rounded-3xl border border-white/10 bg-black/80 p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
						<div className="flex items-start justify-between gap-4">
							<div>
								<p className="text-xs uppercase tracking-[0.3em] text-amber-100/75">Objeto detectado</p>
								<h2 className="mt-2 text-2xl font-semibold text-white">{selectedArtifact.label}</h2>
							</div>
							<button
								type="button"
								onClick={() => setSelectedArtifact(null)}
								className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80 transition hover:bg-white/10"
							>
								Cerrar
							</button>
						</div>
						<p className="mt-4 text-sm leading-6 text-slate-200/90">{selectedArtifact.description}</p>
						<div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300/80">
							<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{selectedArtifact.name}</span>
							{selectedArtifact.isMonolith && (
								<span className="rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-1 text-amber-50">Monolito</span>
							)}
							{selectedArtifact.isChachapuma && (
								<span className="rounded-full border border-emerald-200/20 bg-emerald-200/10 px-3 py-1 text-emerald-50">Chachapuma</span>
							)}
							{selectedArtifact.isFuente && (
								<span className="rounded-full border border-blue-200/20 bg-blue-200/10 px-3 py-1 text-blue-50">Fuente</span>
							)}
							{monolithTarget ? (
								<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Monolito disponible</span>
							) : null}
						</div>
					</div>
				</div>
			) : null}
		</section>
	);
}

useGLTF.preload(MODEL_URL, true, true);

export default function MuseumCanvas({ cuadros }: { cuadros: Cuadro[] }) {
	return <MuseumView cuadros={cuadros} />;
}
