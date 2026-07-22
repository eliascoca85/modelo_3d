"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
	Raycaster,
	SRGBColorSpace,
	Texture,
	Vector3,
} from "three";

import { cuadroDisplayName, CUADRO_NAME_PATTERN, type Cuadro } from "@/types/cuadros";
import FloatingMenu from "@/components/museum/floating-menu";
import { FiPlay, FiPause, FiX } from "react-icons/fi";

const MODEL_URL = "/models/museo-compresion.glb";

type SelectedArtifact = {
	name: string;
	label: string;
	title: string | null;
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
	/**
	 * Muestra la tarjeta de "Objeto detectado" (objetos clickeados en la escena).
	 * `false` para navegar la cámara desde el menú sin abrir la tarjeta.
	 */
	showPanel?: boolean;
	/**
	 * Posición explícita de cámara (p. ej. paredes desde el menú). Si está, ignora
	 * las heurísticas por tipo y vuela directo aquí.
	 */
	cameraPosition?: Vector3;
	/** Target explícito al que mira la cámara; va junto a `cameraPosition`. */
	cameraTarget?: Vector3;
};

type MuseumSceneProps = {
	cuadros: Cuadro[];
	onSelectArtifact: (artifact: SelectedArtifact) => void;
	/** Se dispara cuando el modelo 3D está listo en memoria (para navegar paredes por nombre). */
	onSceneReady?: (scene: Object3D) => void;
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
	let title: string | null = null;
	let description = "Pieza interactiva detectada en la escena exportada desde Blender.";

	if (isCuadro || isPintura || isPresentacion) {
		const record = cuadrosMap.get(normalizedName.toLowerCase());
		label = cuadroDisplayName(normalizedName);
		title = record?.title?.trim() || null;
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
		title,
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

/**
 * Construye un `SelectedArtifact` para navegar a una pared del museo (desde el
 * menú de secciones). Encuentra el objeto por nombre en la escena cargada y,
 * por ahora, encuadra solo la PRIMERA MITAD del muro (a lo ancho): el target se
 * desplaza al centro de esa mitad y la distancia se ajusta para que entre
 * completa en el FOV. La cámara se acerca en un leve 3/4 (girada + algo más
 * alta) pero siempre mira al centro de esa mitad.
 *
 * HALF_SIGN controla qué mitad se considera "primera":
 *   +1 → mitad en dirección +wallTangent
 *   -1 → la otra mitad. Si la que se ve no es la querida, basta con cambiarlo.
 */
function buildWallArtifact(scene: Object3D, wallName: string, cameraFov: number): SelectedArtifact | null {
	const wallObj = scene.getObjectByName(wallName);
	if (!wallObj) return null;

	const wallBox = new Box3().setFromObject(wallObj);
	const wallCenter = new Vector3();
	wallBox.getCenter(wallCenter);

	// Centro del museo → dirección "hacia dentro de la sala" desde la pared
	const roomCenter = new Vector3();
	new Box3().setFromObject(scene).getCenter(roomCenter);

	const intoRoom = roomCenter.sub(wallCenter);
	intoRoom.y = 0;
	if (intoRoom.lengthSq() < 1e-6) {
		intoRoom.set(0, 0, 1);
	} else {
		intoRoom.normalize();
	}

	// Eje "a lo ancho" de la pared en el suelo: perpendicular a la normal hacia
	// la sala. Sobre él medimos el ancho real (robusto aunque la pared no esté
	// alineada a un eje del mundo) y partimos el muro en dos mitades.
	const up = new Vector3(0, 1, 0);
	const wallTangent = new Vector3().crossVectors(intoRoom, up);
	if (wallTangent.lengthSq() < 1e-8) {
		wallTangent.set(1, 0, 0);
	} else {
		wallTangent.normalize();
	}

	let minT = Infinity;
	let maxT = -Infinity;
	const corners: Vector3[] = [
		new Vector3(wallBox.min.x, wallBox.min.y, wallBox.min.z),
		new Vector3(wallBox.min.x, wallBox.min.y, wallBox.max.z),
		new Vector3(wallBox.min.x, wallBox.max.y, wallBox.min.z),
		new Vector3(wallBox.min.x, wallBox.max.y, wallBox.max.z),
		new Vector3(wallBox.max.x, wallBox.min.y, wallBox.min.z),
		new Vector3(wallBox.max.x, wallBox.min.y, wallBox.max.z),
		new Vector3(wallBox.max.x, wallBox.max.y, wallBox.min.z),
		new Vector3(wallBox.max.x, wallBox.max.y, wallBox.max.z),
	];
	for (const c of corners) {
		const t = c.dot(wallTangent);
		if (t < minT) minT = t;
		if (t > maxT) maxT = t;
	}
	const wallWidth = maxT - minT;
	const wallHeight = wallBox.max.y - wallBox.min.y;

	// Centro de la primera mitad (desplazado un cuarto del ancho desde el centro).
	const HALF_SIGN = 1;
	const halfWidth = wallWidth / 2;
	const firstHalfCenter = wallCenter.clone().add(
		wallTangent.clone().multiplyScalar((HALF_SIGN * wallWidth) / 4),
	);

	// Distancia para que entre completa esa mitad (mayor entre ancho y alto),
	// ligeramente más cerca (0.85) que el ajuste exacto para un encuadre cercano.
	// Piso por encima del minDistance (0.3) de OrbitControls; techo generoso para
	// paredes grandes.
	const halfFov = ((cameraFov || 31) * Math.PI) / 180 / 2;
	const fitMaxFace = Math.max(halfWidth, wallHeight);
	const fitDistance = fitMaxFace / (2 * Math.tan(halfFov));
	const distance = Math.max(Math.min(fitDistance * 0.57, 5), 0.45);

	// --- Punto de enfoque: centro de la mitad, subido una fracción del muro ---
	// Subir el target hacia la parte alta de la pared hace que la cámara (que
	// se construye relativa al target) enfoque más arriba sin cambiar el ángulo
	// de mirada. 0 = centro vertical; >0 = hacia el borde superior.
	const VERTICAL_BIAS = 0.2;
	const focusPoint = firstHalfCenter.clone();
	focusPoint.y = wallCenter.y + wallHeight * VERTICAL_BIAS;

	// --- Pose de la cámara: leve 3/4 (girada) y un poco más alta que el target ---
	// Yaw y pitch son ÁNGULOS (radianes) aplicados sobre un arco de radio =
	// `distance`: la distancia Euclídea cámara↔target se conserva y la
	// inclinación es estable sin importar la distancia de la pared. pitch se
	// mantiene dentro del maxPolarAngle (~100.8°) de OrbitControls para que no
	// autocorrige el ángulo al final del vuelo.
	//   YAW_RAD        : giro en planta (3/4); cambiar de signo para el otro lado.
	//   LOOK_DOWN_RAD  : cuánto sube la cámara sobre el target (mira hacia abajo).
	const YAW_RAD = -0.17;        // ~10°
	const LOOK_DOWN_RAD = 0.16;   // ~9°

	const yawedForward = new Vector3()
		.copy(wallTangent)
		.multiplyScalar(Math.sin(YAW_RAD))
		.add(intoRoom.clone().multiplyScalar(Math.cos(YAW_RAD)));
	yawedForward.y = 0;
	yawedForward.normalize();

	const horizDist = distance * Math.cos(LOOK_DOWN_RAD);
	const cameraPosition = yawedForward.clone().multiplyScalar(horizDist).add(focusPoint);
	cameraPosition.y = focusPoint.y + distance * Math.sin(LOOK_DOWN_RAD);

	return {
		name: wallName,
		label: `Sección · Lugares`,
		title: "Galería de Lugares",
		description: "Recorra la pared dedicada a los pintorescos y personajes de cada región.",
		isMonolith: false,
		isChachapuma: false,
		isFuente: false,
		isInteractive: true,
		isCuadro: false,
		position: focusPoint.clone(),
		lookDirection: intoRoom.clone(),
		showPanel: false,
		cameraPosition,
		cameraTarget: focusPoint.clone(),
	};
}

/**
 * Normal REAL del muro (eje perpendicular a su cara) calculada desde la
 * geometría, en lugar de la heurística "centro de la pared → centro de la sala".
 * Suma las normales de los triángulos ponderadas por área, las proyecta al plano
 * horizontal y colapsa las dos caras opuestas del muro a un mismo eje (frontal y
 * trasera tienen normales opuestas y se anularían si no se colapsan). El
 * resultado es el eje del GROSOR del muro, normalizado; o vector nulo si no hay
 * geometría aprovechable (el caller recurre entonces al fallback).
 *
 * Se introdujo porque la heurística anterior no era la perpendicular verdadera
 * para pared_6 y dejaba la cámara tomada "desde una esquina" en vez de de frente.
 */
function computeWallNormalAxis(wallObj: Object3D): Vector3 {
	const acc = new Vector3(0, 0, 0);
	let totalArea = 0;
	let hasRef = false;
	const refDir = new Vector3(1, 0, 0);

	const v0 = new Vector3();
	const v1 = new Vector3();
	const v2 = new Vector3();
	const e1 = new Vector3();
	const e2 = new Vector3();
	const n = new Vector3();

	wallObj.updateWorldMatrix(true, false);
	wallObj.traverse((child) => {
		const mesh = child as Mesh;
		if (!mesh.isMesh) return;
		const geom = mesh.geometry;
		if (!geom) return;
		const pos = geom.attributes.position;
		if (!pos) return;
		mesh.updateWorldMatrix(true, false);
		const matrix = mesh.matrixWorld;
		const index = geom.index;
		const triCount = index ? index.count / 3 : pos.count / 3;

		for (let t = 0; t < triCount; t++) {
			const a = index ? index.getX(t * 3) : t * 3;
			const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
			const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;

			v0.set(pos.getX(a), pos.getY(a), pos.getZ(a)).applyMatrix4(matrix);
			v1.set(pos.getX(b), pos.getY(b), pos.getZ(b)).applyMatrix4(matrix);
			v2.set(pos.getX(c), pos.getY(c), pos.getZ(c)).applyMatrix4(matrix);

			e1.subVectors(v1, v0);
			e2.subVectors(v2, v0);
			n.crossVectors(e1, e2);
			const area = n.length() * 0.5;
			if (area < 1e-10) continue;
			n.divideScalar(area); // normal unitaria del triángulo

			// El "frente" del muro es una dirección horizontal: descartar la componente Y.
			n.y = 0;
			if (n.lengthSq() < 1e-10) continue;
			n.normalize();

			// Colapsar las dos caras opuestas (normales opuestas) a un mismo sentido.
			if (!hasRef) {
				refDir.copy(n);
				hasRef = true;
			}
			if (n.dot(refDir) < 0) n.negate();

			acc.addScaledVector(n, area);
			totalArea += area;
		}
	});

	if (totalArea === 0 || acc.lengthSq() < 1e-10) {
		return new Vector3(); // sin geometría útil → el caller usa el fallback
	}
	return acc.normalize();
}

/**
 * Ancestro nombrado más alto de `obj` (sube hasta la raíz de la escena omitiendo
 * el nodo "scene"). Recorre la jerarquía como `resolveObjectLabel`/`findNamedObject`
 * pero devuelve el Object3D en lugar del nombre.
 */
function findRootNamedObject(obj: Object3D | null): Object3D | null {
	let last: Object3D | null = null;
	let current: Object3D | null = obj;
	while (current) {
		if (current.name && current.name.trim().toLowerCase() !== "scene") {
			last = current;
		}
		current = current.parent;
	}
	return last;
}

/**
 * Distancia (en mundo, desde `origin`) al primer muro-partición que se interpone
 * entre el punto de enfoque de la pared y donde se plantaría la cámara, mirando a
 * lo largo de `direction` (apunta DESDE la pared hacia afuera, donde va la cámara).
 * Solo cuenta otros `pared_*` como ocludores: los cuadros y esculturas cuelgan de
 * la propia cara y son contenido, no estorban. Devuelve `null` si el camino está
 * despejado (espacio abierto). `maxDist` acota la prueba del rayo.
 *
 * Evita plantar la cámara DETRÁS de un muro intermedio (p. ej. pared_2 frente a la
 * cara INTERIOR de pared_6 en "Independencia"): ahí el ocluder llena el encuadre y
 * absorbe todos los clics, así que cualquier objeto resolvía a esa pared en lugar
 * de a la galería que se quería ver.
 */
function nearestWallOccluder(
	scene: Object3D,
	wallObj: Object3D,
	origin: Vector3,
	direction: Vector3,
	maxDist: number,
): number | null {
	scene.updateWorldMatrix(true, true);
	const ray = new Raycaster(origin.clone(), direction.clone().normalize(), 0, maxDist + 1);
	const hits = ray.intersectObject(scene, true);
	for (const hit of hits) {
		const root = findRootNamedObject(hit.object);
		if (!root || root === wallObj) continue;
		if (!/^pared/i.test(root.name)) continue;
		return hit.distance;
	}
	return null;
}

/**
 * Movimiento INDEPENDIENTE para la sección "Fiestas" (pared_6). A diferencia de
 * `buildWallArtifact` —que encuadra la pared en un leve 3/4 (con yaw y mirada
 * picada)— éste planta la cámara DE FRENTE a la cara frontal del muro:
 * perpendicular a su superficie, sin yaw ni pitch, mirándolo de cara. Conserva
 * el encuadre de la primera mitad del muro y la misma distancia ceñida a los
 * límites de `buildWallArtifact`, para no atravesar la pared opuesta ni entrar
 * en la niebla de la escena.
 */
function buildFrontalWallArtifact(
	scene: Object3D,
	wallName: string,
	cameraFov: number,
	sectionId: string,
): SelectedArtifact | null {
	const wallObj = scene.getObjectByName(wallName);
	if (!wallObj) return null;

	const wallBox = new Box3().setFromObject(wallObj);
	const wallCenter = new Vector3();
	wallBox.getCenter(wallCenter);

	// Centro de la escena: solo para ORIENTAR la normal hacia la cara correcta.
	const roomCenter = new Vector3();
	new Box3().setFromObject(scene).getCenter(roomCenter);
	const towardRoom = roomCenter.sub(wallCenter);
	towardRoom.y = 0;
	if (towardRoom.lengthSq() < 1e-6) {
		towardRoom.set(0, 0, 1);
	} else {
		towardRoom.normalize();
	}

	// Normal REAL del muro (eje perpendicular a su cara) calculada desde la
	// geometría de sus triángulos. La heurística "centro de la pared → centro de
	// la sala" NO es la perpendicular verdadera para pared_6 y dejaba la cámara
	// tomada "desde una esquina"; la normal geométrica sí coloca la mirada de
	// frente, perpendicular a la cara.
	const geometricNormal = computeWallNormalAxis(wallObj);
	let intoRoom: Vector3;
	if (geometricNormal.lengthSq() < 1e-6) {
		// Sin geometría aprovechable → fallback a la heurística.
		intoRoom = towardRoom.clone();
	} else {
		intoRoom = geometricNormal.clone();
	}

	// pared_6 es el muro compartido por dos secciones, una por cada cara:
	//   - "fiestas"       → cara OPUESTA al centro de la escena (donde están
	//                       estos cuadros): normal en sentido contrario a
	//                       `towardRoom` → se niega para plantar la cámara de
	//                       ese lado.
	//   - "independencia"  → la OTRA cara (la que miraba hacia el centro, la que
	//                        no usábamos hasta ahora): normal en sentido igual a
	//                        `towardRoom` → NO se niega.
	if (sectionId === "fiestas" && intoRoom.dot(towardRoom) > 0) {
		intoRoom.negate();
	}
	if (sectionId === "independencia" && intoRoom.dot(towardRoom) < 0) {
		intoRoom.negate();
	}

	// Eje tangencial del muro (a lo ancho, en el suelo) para medir su ancho real,
	// robusto aunque la pared no esté alineada a un eje del mundo.
	const up = new Vector3(0, 1, 0);
	const wallTangent = new Vector3().crossVectors(intoRoom, up);
	if (wallTangent.lengthSq() < 1e-8) {
		wallTangent.set(1, 0, 0);
	} else {
		wallTangent.normalize();
	}

	let minT = Infinity;
	let maxT = -Infinity;
	const corners: Vector3[] = [
		new Vector3(wallBox.min.x, wallBox.min.y, wallBox.min.z),
		new Vector3(wallBox.min.x, wallBox.min.y, wallBox.max.z),
		new Vector3(wallBox.min.x, wallBox.max.y, wallBox.min.z),
		new Vector3(wallBox.min.x, wallBox.max.y, wallBox.max.z),
		new Vector3(wallBox.max.x, wallBox.min.y, wallBox.min.z),
		new Vector3(wallBox.max.x, wallBox.min.y, wallBox.max.z),
		new Vector3(wallBox.max.x, wallBox.max.y, wallBox.min.z),
		new Vector3(wallBox.max.x, wallBox.max.y, wallBox.max.z),
	];
	for (const c of corners) {
		const t = c.dot(wallTangent);
		if (t < minT) minT = t;
		if (t > maxT) maxT = t;
	}
	const wallWidth = maxT - minT;
	const wallHeight = wallBox.max.y - wallBox.min.y;

	// Primera mitad del muro (misma convención que `buildWallArtifact`).
	const HALF_SIGN = 1;
	const halfWidth = wallWidth / 2;
	const firstHalfCenter = wallCenter.clone().add(
		wallTangent.clone().multiplyScalar((HALF_SIGN * wallWidth) / 4),
	);

	// Target algo por encima del centro vertical de la mitad: subirlo levanta el
	// punto de enfoque (y, por tanto, la cámara), mirando el muro un poco desde
	// arriba sin dejar de incidir perpendicular sobre su cara.
	const VERTICAL_BIAS = 0.18;
	const focusPoint = firstHalfCenter.clone();
	focusPoint.y = wallCenter.y + wallHeight * VERTICAL_BIAS;

	// Distancia para que entre COMPLETA esa mitad, más ceñida (factor 0.6) que el
	// encuadre de ajuste exacto → más ZOOM sobre la pared. Piso por encima del
	// minDistance (0.3) y techo en 5: por encima la cámara atravesaría la pared
	// opuesta y entraría en niebla.
	const halfFov = ((cameraFov || 31) * Math.PI) / 180 / 2;
	const fitMaxFace = Math.max(halfWidth, wallHeight);
	const fitDistance = fitMaxFace / (2 * Math.tan(halfFov));
	let distance = Math.max(Math.min(fitDistance * 0.6, 5), 0.45);

	// Desplazamiento lateral a la DERECHA del espectador a lo largo del eje
	// tangencial del muro, PRESERVANDO la frontalidad y el alto: arrastramos
	// target y cámara el mismo vector lateralOffset, de manera que la dirección
	// cámara→target sigue siendo -intoRoom (mirada perpendicular a la cara, sin
	// 3/4) y la altura de cámara (CAMERA_LIFT sobre el target) no cambia.
	// LATERAL_SHIFT es fracción del ancho de la mitad → "un poco" a la derecha.
	const LATERAL_SHIFT = 0.22;
	// wallTangent (cross intoRoom×up) apunta a la IZQUIERDA del espectador →
	// negamos para mover la cámara hacia su derecha.
	const lateralOffset = wallTangent.clone().multiplyScalar(-LATERAL_SHIFT * halfWidth);
	const focusPointShifted = focusPoint.clone().add(lateralOffset);

	// Si entre el punto de enfoque y donde iría la cámara hay otro muro (p. ej.
	// pared_2 frente a la cara INTERIOR de pared_6 en "Independencia"), ese
	// ocluder llena el encuadre y absorbe todos los clics → cualquier objeto
	// resolvía a esa pared en vez de a la galería. Acercamos la cámara para que
	// quede ANTES del ocluder (entre la cara y el muro intermedio), manteniendo
	// la galería como lo primero clickable. Solo cuentan otros `pared_*`:
	// cuadros y esculturas cuelgan de la cara y son contenido, no estorban.
	// Fiestas (cara EXTERIOR, espacio abierto) sin ocluder → distancia intacta.
	const occluder = nearestWallOccluder(scene, wallObj, focusPointShifted, intoRoom, distance);
	if (occluder != null) {
		distance = Math.max(Math.min(distance, occluder * 0.85), 0.45);
	}

	// Cámara perpendicular a la pared (sin yaw → vista FRONTAL pura) y algo MÁS
	// ALTA que el target (CAMERA_LIFT) → leve mirada picada que encuadra el muro
	// desde arriba sin dejar de ser de frente. Permanece escochada igual con el
	// desplazamiento lateral ya aplicado. El polar queda dentro del
	// maxPolarAngle (~100.8°) de OrbitControls para que no autocorrige al final.
	const CAMERA_LIFT = 0.12;
	const cameraPosition = focusPointShifted.clone().add(intoRoom.clone().multiplyScalar(distance));
	cameraPosition.y = focusPoint.y + wallHeight * CAMERA_LIFT;

	const isFiestas = sectionId === "fiestas";

	return {
		name: wallName,
		label: isFiestas ? "Sección · Fiestas" : "Sección · Independencia",
		title: isFiestas ? "Galería de Fiestas" : "Galería de Independencia",
		description: isFiestas
			? "Recorra la pared dedicada a las festividades y celebraciones tradicionales de cada región."
			: "Recorra la pared dedicada a los hitos de independencia y la historia emancipadora de cada región.",
		isMonolith: false,
		isChachapuma: false,
		isFuente: false,
		isInteractive: true,
		isCuadro: false,
		position: focusPointShifted.clone(),
		lookDirection: intoRoom.clone(),
		showPanel: false,
		cameraPosition,
		cameraTarget: focusPointShifted.clone(),
	};
}

/**
 * Movimiento INDEPENDIENTE para la sección "Historia" (pedestal_presentacion).
 * A diferencia de los constructores de pared —que encuadran un muro de frente
 * o en 3/4— éste planta la cámara ARRIBA del pedestal y mira HACIA ABAJO con
 * una leve inclinación (no 100% vertical), para apreciar la pieza en planta
 * cenital. Es el único target del menú con vista top-down.
 *
 * El `cameraTarget` se posiciona en el centro de la cara superior del pedestal
 * (la "superficie de presentación"). La distancia se ajusta al lado menor de
 * la planta (X/Z) para que esa cara entre completa en el FOV. La cámara queda
 * casi encima (predomina el offset en Z, apenas en X) con un ligero ángulo
 * desde la vertical para que la escena se lea en perspectiva y se mantenga
 * dentro del maxPolarAngle (~100.8°) de OrbitControls.
 */
function buildPedestalPresentacionArtifact(
	scene: Object3D,
	cameraFov: number,
): SelectedArtifact | null {
	const pedestalObj = scene.getObjectByName("pedestal_presentacion");
	if (!pedestalObj) return null;

	const pedestalBox = new Box3().setFromObject(pedestalObj);
	const pedestalCenter = new Vector3();
	pedestalBox.getCenter(pedestalCenter);
	const size = new Vector3();
	pedestalBox.getSize(size);

	// Punto de enfoque: centro de la cara superior del pedestal (un pelo por
	// debajo del borde max para asentarse sobre la superficie de presentación).
	const targetPoint = new Vector3(
		pedestalCenter.x,
		pedestalBox.max.y - 0.02,
		pedestalCenter.z,
	);

	// Distancia para encuadrar la cara superior (la más chica de X/Z) y dejar
	// margen para no rebotar contra el techo (maxDistance 13) ni el piso
	// (minDistance 0.3) de OrbitControls.
	const halfFov = ((cameraFov || 31) * Math.PI) / 180 / 2;
	const topFace = Math.min(size.x, size.z) || Math.max(size.x, size.z) || 1;
	const fitDistance = topFace / (2 * Math.tan(halfFov));
	const distance = Math.max(Math.min(fitDistance * 1.05, 6), 1.2);

	// Cámara ARRIBA del pedestal con una leve inclinación hacia adelante para
	// que la escena se lea en perspectiva (no totalmente vertical).
	// TOP_DOWN_PITCH_RAD es el ángulo DESDE la vertical (0 = cenital puro).
	// El polar resultante queda dentro del maxPolarAngle de OrbitControls
	// (~100.8°) para que no se autocorra al final del vuelo.
	const TOP_DOWN_PITCH_RAD = 0.3; // ~17° desde la vertical → polar ~73°

	const horizOffset = distance * Math.sin(TOP_DOWN_PITCH_RAD);
	const verticalOffset = distance * Math.cos(TOP_DOWN_PITCH_RAD);

	// Reparto: 0% lateral (X) + 95% adelante/atrás (Z). Sin offset lateral la
	// cámara queda alineada con el eje vertical del pedestal — no se va ni a
	// la izquierda ni a la derecha del target. Se conserva el pequeño offset
	// en Z para que la escena se lea en perspectiva y no sea un picado
	// totalmente vertical (que perdería profundidad).
	const cameraPosition = new Vector3(
		targetPoint.x,
		targetPoint.y + verticalOffset,
		targetPoint.z + horizOffset * 0.95,
	);

	return {
		name: "pedestal_presentacion",
		label: "Sección · Historia",
		title: "Galería de Historia",
		description:
			"Vista cenital del pedestal de presentación. Observa la pieza desde arriba para apreciar la disposición y los detalles de su superficie.",
		isMonolith: false,
		isChachapuma: false,
		isFuente: false,
		isInteractive: true,
		isCuadro: false,
		position: targetPoint.clone(),
		lookDirection: targetPoint.clone().sub(cameraPosition).normalize(),
		showPanel: false,
		cameraPosition,
		cameraTarget: targetPoint.clone(),
	};
}

/**
 * Movimiento INDEPENDIENTE para la sección "Comidas" — encuadra la
 * INTERSECCIÓN de `pared_1` y `pared_3`, es decir, la esquina donde ambas
 * paredes se encuentran. A diferencia de las paredes individuales (vista
 * frontal o 3/4 sobre UNA pared) o del pedestal (vista cenital sobre UN
 * objeto), aquí el target se posa en el centro de la región COMPARTIDA entre
 * las dos cajas y la cámara se planta DENTRO de la sala mirando al vértice
 * desde la diagonal interior: se ven las dos paredes abriéndose en ángulo
 * desde sus planos convergentes.
 *
 * El "centro de la intersección" se calcula como el centro de la región
 * solapada de las dos BoundingBox. Funciona cuando las paredes se solapan
 * por su grosor (lo habitual al exportar muros con espesor desde Blender),
 * y colapsa al punto medio de la arista compartida si solo se tocan en el
 * límite. En ambos casos queda sobre la línea de encuentro.
 */
function buildComidasIntersectionArtifact(scene: Object3D, cameraFov: number): SelectedArtifact | null {
	const wall1 = scene.getObjectByName("pared_1");
	const wall3 = scene.getObjectByName("pared_3");
	if (!wall1 || !wall3) return null;

	const box1 = new Box3().setFromObject(wall1);
	const box3 = new Box3().setFromObject(wall3);

	const roomCenter = new Vector3();
	new Box3().setFromObject(scene).getCenter(roomCenter);

	// Centro de la región compartida entre las dos cajas → centro de la
	// intersección (mitad de la arista compartida o mitad del solape de grosor).
	const intersectionCenter = new Vector3(
		(Math.max(box1.min.x, box3.min.x) + Math.min(box1.max.x, box3.max.x)) / 2,
		(Math.max(box1.min.y, box3.min.y) + Math.min(box1.max.y, box3.max.y)) / 2,
		(Math.max(box1.min.z, box3.min.z) + Math.min(box1.max.z, box3.max.z)) / 2,
	);

	// Dirección desde la esquina hacia el INTERIOR de la sala (en planta).
	// Si el vector quedara casi nulo (corner exactamente en el centro geométrico
	// escenario), fallback a +X para no degenerar.
	const intoRoom = roomCenter.clone().sub(intersectionCenter);
	intoRoom.y = 0;
	if (intoRoom.lengthSq() < 1e-6) intoRoom.set(1, 0, 0);
	else intoRoom.normalize();

	// Distancia para encuadrar la pared más larga al borde del FOV. Factor bajo
	// (0.28) ⇒ encuadre MUY ceñido: la cámara se planta cerca de la esquina y
	// solo ella y un tramo corto de cada pared entran en cuadro. Mismo techo que
	// los otros constructores para no atravesar paredes ni entrar en la niebla.
	const wallLen1 = Math.max(box1.max.x - box1.min.x, box1.max.z - box1.min.z);
	const wallLen3 = Math.max(box3.max.x - box3.min.x, box3.max.z - box3.min.z);
	const fitSpan = Math.max(wallLen1, wallLen3);
	const halfFov = ((cameraFov || 31) * Math.PI) / 180 / 2;
	const fitDistance = fitSpan / (2 * Math.tan(halfFov));
	const distance = Math.max(Math.min(fitDistance * 0.39, 5), 0.55);

	// Cámara DENTRO de la sala, mirando a la esquina, elevada sobre el target
	// para una vista MÁS ALTA y desplazada levemente a la IZQUIERDA del
	// espectador. La dirección "izquierda" se calcula perpendicular a `intoRoom`
	// en la planta (cross con up) — es el eje local-izquierda de la cámara:
	// shiftar la cámara en ese eje mueve al observador a su propia izquierda
	// mientras el enfoque sigue siendo la esquina (cameraTarget sin tocar).
	// Se escala con `distance` para que el desplazamiento lateral guarde la
	// misma proporción visual al cambiar el zoom.
	const cameraLeft = intoRoom.clone().cross(new Vector3(0, 1, 0));
	if (cameraLeft.lengthSq() < 1e-8) cameraLeft.set(-1, 0, 0);
	else cameraLeft.normalize();
	// HEIGHT_LIFT  : altura del ojo sobre el target (subido desde 0.4 → más alto).
	// LEFT_SHIFT   : fracción de distance a mover hacia la izquierda del espectador.
	const HEIGHT_LIFT = 0.85;
	const LEFT_SHIFT = 0.03;

	const cameraPosition = intersectionCenter
		.clone()
		.add(intoRoom.clone().multiplyScalar(distance))
		.add(cameraLeft.clone().multiplyScalar(LEFT_SHIFT * distance));
	cameraPosition.y = intersectionCenter.y + HEIGHT_LIFT;

	return {
		name: "pared_1-pared_3",
		label: "Sección · Comidas",
		title: "Galería de Comidas",
		description:
			"Encuentro de las paredes 1 y 3: la esquina del museo dedicada a las tradiciones gastronómicas de cada región. Las dos paredes se abren en ángulo desde sus planos convergentes.",
		isMonolith: false,
		isChachapuma: false,
		isFuente: false,
		isInteractive: true,
		isCuadro: false,
		position: intersectionCenter.clone(),
		lookDirection: intersectionCenter.clone().sub(cameraPosition).normalize(),
		showPanel: false,
		cameraPosition,
		cameraTarget: intersectionCenter.clone(),
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
	onSceneReady,
}: MuseumSceneProps) {
	const { scene } = useGLTF(MODEL_URL, true, true);

	const cuadrosMap = useMemo(() => {
		const map = new Map<string, Cuadro>();
		for (const c of cuadros) map.set(c.name.toLowerCase(), c);
		return map;
	}, [cuadros]);

	// Avisar a MuseumView que el modelo ya está cargado, para que pueda buscar
	// paredes por nombre al navegar desde el menú de secciones.
	useEffect(() => {
		onSceneReady?.(scene);
	}, [scene, onSceneReady]);

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

	// Activar sombras en todas las mallas de la escena exportada desde Blender.
	useMemo(() => {
		scene.traverse((child) => {
			if ((child as Mesh).isMesh) {
				const mesh = child as Mesh;
				mesh.castShadow = true;
				mesh.receiveShadow = true;
			}
		});
	}, [scene]);

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

/**
 * Tarjeta lateral de "Objeto detectado". Incluye un botón dinámico de lectura
 * por voz usando la Web Speech API (SpeechSynthesis): el mismo botón alterna
 * entre ESCUCHAR / PAUSAR / REANUDAR según el estado de la locución.
 *
 * Estados posibles de la locución:
 *   "idle"    → no se ha hablado nada o ya terminó (botón: "Escuchar")
 *   "playing" → utterance sonando en este momento (botón: "Pausar")
 *   "paused"  → utterance pausado por el usuario (botón: "Reanudar")
 *
 * El texto leído es SOLO el título (o label como fallback) y la descripción
 * del artefacto, en una sola utterance. Si el navegador no soporta la API,
 * el botón aparece deshabilitado con la marca "Sin audio".
 *
 * Al cambiar de artefacto o al desmontar la tarjeta, se cancela cualquier
 * locución en curso y se resetea el estado local — así abrir un objeto nuevo
 * nunca hereda la reproducción del anterior.
 */
type SpeechStatus = "idle" | "playing" | "paused";

function ObjectCard({
	artifact,
	onClose,
}: {
	artifact: SelectedArtifact;
	onClose: () => void;
}) {
	const [speechStatus, setSpeechStatus] = useState<SpeechStatus>("idle");

	// Detección de soporte solo en cliente (useMemo: no se recalcula cada render).
	const speechSupported = useMemo(
		() =>
			typeof window !== "undefined" &&
			"speechSynthesis" in window &&
			"SpeechSynthesisUtterance" in window,
		[],
	);

	// Reset al cambiar de artefacto + cancela en curso. Cleanup adicional por
	// si la tarjeta se desmonta sin cambio de prop (p. ej. el padre la cierra).
	useEffect(() => {
		setSpeechStatus("idle");
		if (speechSupported) window.speechSynthesis.cancel();
		return () => {
			if (speechSupported) window.speechSynthesis.cancel();
		};
	}, [artifact.name, speechSupported]);

	const handlePlay = () => {
		if (!speechSupported) return;

		const synth = window.speechSynthesis;
		// Cancela cualquier utterance previa antes de empezar una nueva → evita
		// lecturas superpuestas cuando el usuario pulsa rápido o cambia de objeto.
		synth.cancel();

		const title = (artifact.title ?? artifact.label).trim();
		const description = artifact.description.trim();
		const text = [title, description].filter(Boolean).join(". ");

		const utter = new SpeechSynthesisUtterance(text);
		// Idioma por defecto: español. Si no hay voces es-ES instaladas el
		// navegador cae a su default — `voice` podría seleccionarse después si
		// el usuario lo pide. Se mantiene simple por ahora.
		utter.lang = "es-ES";
		utter.rate = 1.0;
		utter.pitch = 1.0;

		// Handlers: mantienen `speechStatus` sincronizado con el utterance.
		// onend/onerror también cubren el caso "cancel()" para regresar a idle.
		utter.onstart = () => setSpeechStatus("playing");
		utter.onpause = () => setSpeechStatus("paused");
		utter.onresume = () => setSpeechStatus("playing");
		utter.onend = () => setSpeechStatus("idle");
		utter.onerror = () => setSpeechStatus("idle");

		synth.speak(utter);
	};

	const handlePause = () => {
		if (!speechSupported) return;
		// `pause()` es un hold-en-cola en algunos navegadores; forzamos el estado
		// a "paused" para que el botón reaccione aunque el evento onpause llegue
		// tarde (o no llegue).
		window.speechSynthesis.pause();
		setSpeechStatus("paused");
	};

	const handleResume = () => {
		if (!speechSupported) return;
		window.speechSynthesis.resume();
		setSpeechStatus("playing");
	};

	const handleToggle = () => {
		if (speechStatus === "idle") handlePlay();
		else if (speechStatus === "playing") handlePause();
		else handleResume();
	};

	const buttonText = !speechSupported
		? "Sin audio"
		: speechStatus === "idle"
			? "Escuchar"
			: speechStatus === "playing"
				? "Pausar"
				: "Reanudar";

	return (
		<div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-end p-4 sm:p-6 lg:p-8">
			<div className="pointer-events-auto w-full max-w-md rounded-3xl border border-white/10 bg-black/80 p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-amber-100/75">Objeto detectado</p>
						<h2 className="mt-2 text-2xl font-semibold text-white">{artifact.title ?? artifact.label}</h2>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<button
							type="button"
							onClick={handleToggle}
							disabled={!speechSupported}
							aria-label={`TTS · ${buttonText}`}
							title={buttonText}
							aria-pressed={speechStatus === "playing"}
							className="rounded-full border border-white/10 bg-white/5 inline-flex h-8 w-8 items-center justify-center text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
						>
						{!speechSupported ? <FiPlay className="h-4 w-4 opacity-50" /> : speechStatus === "playing" ? <FiPause className="h-4 w-4" /> : <FiPlay className="h-4 w-4" />	}
						</button>
						<button
							type="button"
							onClick={onClose}
							className="rounded-full border border-white/10 bg-white/5 inline-flex h-8 w-8 items-center justify-center text-white/80 transition hover:bg-white/10"
						>
							X
						</button>
					</div>
				</div>
				<p className="mt-4 text-sm leading-6 text-slate-200/90">{artifact.description}</p>
				<div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300/80">
					<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{artifact.name}</span>
					{artifact.isMonolith && (
						<span className="rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-1 text-amber-50">Monolito</span>
					)}
					{artifact.isChachapuma && (
						<span className="rounded-full border border-emerald-200/20 bg-emerald-200/10 px-3 py-1 text-emerald-50">Chachapuma</span>
					)}
					{artifact.isFuente && (
						<span className="rounded-full border border-blue-200/20 bg-blue-200/10 px-3 py-1 text-blue-50">Fuente</span>
					)}
				</div>
			</div>
		</div>
	);
}

function MuseumView({ cuadros }: { cuadros: Cuadro[] }) {
	const [selectedArtifact, setSelectedArtifact] = useState<SelectedArtifact | null>(null);
	const [activeSection, setActiveSection] = useState<string | null>(null);
	// Referencia a la escena 3D cargada: MuseoScene la llena cuando el GLB está
	// listo, para poder buscar paredes por nombre desde el menú de secciones.
	const sceneRef = useRef<Object3D | null>(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const controlsRef = useRef<any>(null);
	const animationFrameIdRef = useRef<number | null>(null);

	const handleSceneReady = useCallback((scene: Object3D) => {
		sceneRef.current = scene;
	}, []);

	// Sección elegida desde el menú (p. ej. "Lugares" → pared_1): vuela la
	// cámara frente a esa pared, sin abrir la tarjeta de "Objeto detectado".
	const handleSelectSection = useCallback((sectionId: string, wallName: string) => {
		const scene = sceneRef.current;
		if (!scene) {
			// Sin escena aún: igual dejamos el resaltado como feedback visual.
			setActiveSection(sectionId);
			return;
		}

		// FOV de la cámara activa, con fallback al de la Canvas.
		const fov = (controlsRef.current?.object?.fov as number | undefined) ?? 31;

		// Cada sección con `wall` usa su movimiento propio:
		//   - "historia"                 → vista CENITAL del pedestal_presentacion.
		//   - "comidas"                  → esquina interior donde se encuentran pared_1 y pared_3.
		//   - "fiestas"/"independencia"  → vista frontal de una cara de pared_6.
		//   - las demás (p. ej. "lugares") → encuadre en 3/4 de la pared (buildWallArtifact).
		let artifact: SelectedArtifact | null;
		if (sectionId === "historia") {
			artifact = buildPedestalPresentacionArtifact(scene, fov);
		} else if (sectionId === "comidas") {
			artifact = buildComidasIntersectionArtifact(scene, fov);
		} else if (sectionId === "fiestas" || sectionId === "independencia") {
			artifact = buildFrontalWallArtifact(scene, wallName, fov, sectionId);
		} else {
			artifact = buildWallArtifact(scene, wallName, fov);
		}
		if (!artifact) {
			// El objeto destino no existe en la escena: dejamos el feedback
			// visual sin disparar la animación de cámara.
			setActiveSection(sectionId);
			return;
		}

		setActiveSection(sectionId);
		setSelectedArtifact(artifact);
	}, []);

	// Click sobre una pieza 3D: quita el resaltado de sección porque abrimos su
	// propia tarjeta.
	const handleSelectArtifact = useCallback((artifact: SelectedArtifact) => {
		setActiveSection(null);
		setSelectedArtifact(artifact);
	}, []);

	const closeSelection = useCallback(() => {
		setActiveSection(null);
		setSelectedArtifact(null);
	}, []);

	// Esc cierra cualquier selección (tarjeta o navegación de sección) y regresa
	// la cámara al punto de inicio.
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			if (selectedArtifact || activeSection) {
				event.preventDefault();
				closeSelection();
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [selectedArtifact, activeSection, closeSelection]);

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

		// Navegación explícita (p. ej. una pared elegida desde el menú): vamos
		// directo al encuadre calculado, saltándonos las heurísticas por tipo.
		if (
			selectedArtifact?.isInteractive &&
			selectedArtifact.cameraPosition &&
			selectedArtifact.cameraTarget
		) {
			finalPosition = selectedArtifact.cameraPosition.clone();
			finalTarget = selectedArtifact.cameraTarget.clone();
		} else if (selectedArtifact?.isInteractive && selectedArtifact.position && selectedArtifact.lookDirection) {
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

		// Animar cámara (posición + target) hasta su pose final con un ease-in-out
		// cosenoidal suave a lo largo de `duration`.
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

			// Ease-in-out cosenoidal suave (sin frenazo brusco al final)
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
							onSelectArtifact={handleSelectArtifact}
							onSceneReady={handleSceneReady}
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

			<FloatingMenu onSelectSection={handleSelectSection} activeSection={activeSection} />

				{selectedArtifact && selectedArtifact.showPanel !== false ? (
					<ObjectCard artifact={selectedArtifact} onClose={closeSelection} />
				) : null}
		</section>
	);
}

useGLTF.preload(MODEL_URL, true, true);

export default function MuseumCanvas({ cuadros }: { cuadros: Cuadro[] }) {
	return <MuseumView cuadros={cuadros} />;
}
