"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import {
	ContactShadows,
	Environment,
	Html,
	OrbitControls,
	useGLTF,
} from "@react-three/drei";
import { Box3, Mesh, Object3D, Vector3 } from "three";

const MODEL_URL = "/models/museo-compresion.glb";

type SelectedArtifact = {
	name: string;
	label: string;
	description: string;
	isMonolith: boolean;
};

type MuseumSceneProps = {
	onSelectArtifact: (artifact: SelectedArtifact) => void;
	onTargetsDetected: (targets: string[]) => void;
};

function resolveObjectLabel(object: Object3D | null) {
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

function buildArtifactDetails(name: string): SelectedArtifact {
	const normalizedName = name.trim() || "pieza sin nombre";
	const isMonolith = /monolito/i.test(normalizedName);

	return {
		name: normalizedName,
		label: isMonolith ? "Monolito" : normalizedName,
		description: isMonolith
			? "Elemento principal del museo. Se detecta por nombre desde Blender y está listo para interacción."
			: "Pieza interactiva detectada en la escena exportada desde Blender.",
		isMonolith,
	};
}

function MuseumScene({
	onSelectArtifact,
	onTargetsDetected,
}: MuseumSceneProps) {
	const { scene } = useGLTF(MODEL_URL, true, true);
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
		onSelectArtifact(buildArtifactDetails(resolveObjectLabel(event.object)));
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

function MuseumView() {
	const [selectedArtifact, setSelectedArtifact] = useState<SelectedArtifact | null>(null);
	const [availableTargets, setAvailableTargets] = useState<string[]>([]);

	const monolithTarget = useMemo(
		() => availableTargets.find((target) => /monolito/i.test(target)) ?? null,
		[availableTargets],
	);

	return (
		<section
			className="relative h-screen w-screen overflow-hidden bg-[#050816] text-white"
			onPointerDown={() => {
				if (selectedArtifact) {
					setSelectedArtifact(null);
				}
			}}
		>
			<div className="museum-backdrop absolute inset-0" />
			<div className="absolute inset-0">
				<Canvas
					shadows
					dpr={[1, 1.75]}
					camera={{ position: [4.5, 5.9, 7.2], fov: 31 }}
					gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
					className="h-full w-full"
				>
					<color attach="background" args={['#050816']} />
					<fog attach="fog" args={['#050816', 10, 30]} />
					<ambientLight intensity={1.25} />
					<hemisphereLight intensity={0.8} color="#ffe9b2" groundColor="#10172f" />
					<directionalLight position={[7, 11, 7]} intensity={2.6} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />

					<Suspense fallback={<LoadingOverlay />}>
						<MuseumScene
							onSelectArtifact={setSelectedArtifact}
							onTargetsDetected={setAvailableTargets}
						/>
						<Environment preset="studio" />
						<ContactShadows position={[0, -1.1, 0]} opacity={0.42} scale={24} blur={2.8} far={10} />
					</Suspense>

					<OrbitControls
						enablePan={false}
						minDistance={2.5}
						maxDistance={13}
						maxPolarAngle={Math.PI * 0.56}
						target={[0.45, 2.1, 0]}
					/>
				</Canvas>
			</div>

			{selectedArtifact ? (
				<div className="pointer-events-none absolute inset-0 flex items-end justify-start p-4 sm:p-6 lg:p-8">
					<div className="pointer-events-auto w-full max-w-md rounded-3xl border border-white/10 bg-black/60 p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
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
							{selectedArtifact.isMonolith ? (
								<span className="rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-1 text-amber-50">Monolito</span>
							) : null}
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

export default function MuseumCanvas() {
	return <MuseumView />;
}
