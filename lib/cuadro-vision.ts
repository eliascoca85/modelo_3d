/**
 * Curaduría asistida por visión — análisis visual + NLG en español (client-safe).
 *
 * Cero dependencias nuevas: solo usa Canvas API + ImageData (estándar del navegador).
 * No añade peso al bundle de Vercel. Diseñado para correr en el navegador del
 * admin (Web Worker opcional en el futuro si se desea; hoy síncrono es instantáneo).
 *
 * DESCARGO DE RESPONSABILIDAD DE ALCANCE (honestidad técnica obligatoria):
 * NO es una red neuronal. NO "reconoce" temática ni autoría. Lo que hace es:
 *   1) Medir estadísticas observables de la imagen (paleta, brillo, contraste,
 *      saturación, calidez, relación de aspecto).
 *   2) Clasificar por REGLAS DETERMINISTAS esos rasgos en: tipo de obra
 *      ("paisaje", "retrato", "escena festiva", "escultura de piedra",
 *      "textil/tejido", "documento/mapa", "detalle/abstracto") y sección
 *      sugerida del museo ("lugares", "fiestas", "comidas", "historia",
 *      "independencia").
 *   3) Componer una ficha curatorial en español con plantillas, usando SOLO
 *      los datos medidos. Es una "ayuda técnica" para vencer la página en blanco;
 *      el curador SIEMPRE revisa/edita antes de guardar.
 */

// Tipos públicos
export type VisionStats = {
  /** Hex del color dominante (#RRGGBB) */
  dominantHex: string;
  /** Paleta reducida (máx. 5 colores hex) ordenada por prevalencia */
  palette: string[];
  /** Brillo medio 0–1 (luminancia relativa) */
  brightness: number;
  /** Contraste RMS 0–1 (desviación estándar de luminancia) */
  contrast: number;
  /** Saturación media 0–1 (croma / luminancia) */
  saturation: number;
  /** Calidez -1..+1 (sesgo rojo/ámbar vs azul/cian) */
  warmth: number;
  /** Relación ancho/alto */
  aspectRatio: number;
  /** Ancho original */
  width: number;
  /** Alto original */
  height: number;
};

export type VisionClassification = {
  /** Categoría visual observada */
  type:
    | "paisaje"
    | "retrato"
    | "escena festiva"
    | "escultura de piedra"
    | "textil/tejido"
    | "documento/mapa"
    | "detalle/abstracto";
  /** Sección temática del museo sugerida (punto de partida) */
  suggestedSection: "lugares" | "fiestas" | "comidas" | "historia" | "independencia";
  /** Confianza heurística 0–1 (no probabilidad, solo consistencia interna) */
  confidence: number;
};

export type CuratorialCard = {
  /** Título sugerido (máx. 80 chars, listo para el input `title`) */
  title: string;
  /** Descripción en tono museográfico, español neutro */
  description: string;
  /** Sección sugerida (chip informativo, no vinculante) */
  suggestedSection: VisionClassification["suggestedSection"];
  /** Tipo de obra clasificado */
  type: VisionClassification["type"];
  /** Stats crudos para debugging / posibles extensiones */
  stats: VisionStats;
};

/**
 * Analiza un `File` (debe ser image/webp validado antes) y devuelve
 * stats + clasificación + ficha curatorial lista para pre-rellenar el form.
 *
 * Corre 100% en el hilo principal; con 224x224 px toma ~15–30 ms en escritorio.
 * Si se desea, se puede mover a Web Worker después sin cambiar la firma.
 */
export async function analyzeCuadroImage(file: File): Promise<CuratorialCard> {
  // 1) Decode a bitmap (OffscreenCanvas si existe, fallback a canvas normal)
  const bitmap = await createImageBitmap(file, { colorSpaceConversion: "none" });

  // 2) Escalar a análisis fijo (224 px lado mayor) — balance velocidad/calidad
  const MAX_DIM = 224;
  const scale = Math.min(MAX_DIM / bitmap.width, MAX_DIM / bitmap.height, 1);
  const dw = Math.round(bitmap.width * scale);
  const dh = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(dw, dh);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, dw, dh);
  bitmap.close();

  const { data } = ctx.getImageData(0, 0, dw, dh);

  // 3) Estadísticas en un solo pase (8-bit sRGB → luminancia aproximada)
  let rSum = 0, gSum = 0, bSum = 0;
  let lumSum = 0, lumSqSum = 0;
  let satSum = 0;
  let warmSum = 0; // (R - B) ponderado por luminancia
  const pixelCount = data.length / 4;

  // Cuantización simple para paleta (buckets 32^3 = 32768 bins -> Map)
  const bucketCounts = new Map<number, number>();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Alfa ignorado (WebP opaco usual); si hubiera transparencia se trataría.

    // Luminancia (Rec. 709 aprox)
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumSum += y;
    lumSqSum += y * y;

    // Saturación simple: croma / (y + eps)
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const chroma = maxC - minC;
    satSum += y > 1 ? chroma / y : 0;

    // Calidez: (R - B) * y  → positivo = cálido, negativo = frío
    warmSum += (r - b) * (y / 255);

    // Acumuladores para color medio
    rSum += r; gSum += g; bSum += b;

    // Bucket para paleta (5 bits por canal = 32 niveles)
    const br = r >> 3;
    const bg = g >> 3;
    const bb = b >> 3;
    const key = (br << 10) | (bg << 5) | bb;
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
  }

  const n = pixelCount;
  const meanY = lumSum / n / 255;                    // 0–1
  const varY = lumSqSum / n / (255 * 255) - meanY * meanY;
  const brightness = Math.max(0, Math.min(1, meanY));
  const contrast = Math.max(0, Math.min(1, Math.sqrt(Math.max(0, varY)) * 4)); // escalado heurístico
  const saturation = Math.max(0, Math.min(1, (satSum / n) * 2)); // es heurístico
  const warmth = Math.max(-1, Math.min(1, warmSum / n / 255));  // -1..+1

  const avgR = rSum / n;
  const avgG = gSum / n;
  const avgB = bSum / n;

  // Color dominante (promedio simple — estable y rápido)
  const dominantHex = rgbToHex(Math.round(avgR), Math.round(avgG), Math.round(avgB));

  // Paleta: top 5 buckets
  const palette = Array.from(bucketCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => bucketKeyToHex(key));

  const aspectRatio = bitmap.width / bitmap.height;

  const stats: VisionStats = {
    dominantHex,
    palette,
    brightness,
    contrast,
    saturation,
    warmth,
    aspectRatio,
    width: bitmap.width,
    height: bitmap.height,
  };

  // 4) Clasificación por reglas (determinista, explicable, sin ML)
  const classification = classifyByHeuristics(stats);

  // 5) NLG por plantillas (español nativo, sin red)
  const card = composeCard(stats, classification);

  return card;
}

/** Helpers internos ---------------------------------------------------------*/

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

function bucketKeyToHex(key: number): string {
  const br = (key >> 10) & 0x1f;
  const bg = (key >> 5) & 0x1f;
  const bb = key & 0x1f;
  // Expandir 5 bits → 8 bits
  const r = (br << 3) | (br >> 2);
  const g = (bg << 3) | (bg >> 2);
  const b = (bb << 3) | (bb >> 2);
  return rgbToHex(r, g, b);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function hexToName(hex: string): string {
  // Nombres de color básicos para la redacción (no exhaustivo, solo ayuda)
  const rgb = hexToRgb(hex);
  if (!rgb) return "tono indefinido";
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  if (diff < 35) {
    if (max > 200) return "blanco/gris claro";
    if (max > 100) return "gris neutro";
    return "gris oscuro/negro";
  }
  // Hue aproximado
  let hue = 0;
  if (max === r) hue = (g - b) / diff;
  else if (max === g) hue = 2 + (b - r) / diff;
  else hue = 4 + (r - g) / diff;
  hue *= 60;
  if (hue < 0) hue += 360;

  if (hue < 15 || hue >= 345) return max > 180 ? "rojo vivo" : "rojo oscuro";
  if (hue < 45) return max > 180 ? "naranja/ámbar" : "marrón/terracota";
  if (hue < 75) return max > 180 ? "amarillo/ocre" : "ocre oscuro";
  if (hue < 165) return max > 180 ? "verde" : "verde oscuro";
  if (hue < 255) return max > 180 ? "celeste/azul claro" : "azul profundo";
  if (hue < 285) return max > 180 ? "violeta/lila" : "púrpura";
  return max > 180 ? "rosa/magenta" : "rosa oscuro";
}

function classifyByHeuristics(s: VisionStats): VisionClassification {
  const { brightness, contrast, saturation, warmth, aspectRatio } = s;

  // Heurísticas interpretables (umbrales elegidos por inspección visual típica)
  // 1) Escultura de piedra: baja saturación, contraste medio-alto, paleta gris/marrón
  const isStone = saturation < 0.25 && contrast > 0.25 && (warmth > -0.1 || brightness < 0.45);
  // 2) Textil/tejido: saturación media-alta, patrón repetitivo → contraste medio, aspecto ~1
  const isTextile = saturation > 0.35 && contrast > 0.2 && aspectRatio > 0.7 && aspectRatio < 1.4;
  // 3) Documento/mapa: alto contraste, aspecto > 1.3 (apaisado) o < 0.75 (vertical), brillo medio
  const isDoc = contrast > 0.35 && (aspectRatio > 1.35 || aspectRatio < 0.7);
  // 4) Escena festiva: alta saturación, calidez positiva, contraste medio
  const isFestive = saturation > 0.4 && warmth > 0.15 && contrast > 0.15;
  // 5) Retrato: aspecto ~0.75–1.1 (vertical), brillo medio, saturación media
  const isPortrait = aspectRatio < 1.1 && aspectRatio > 0.65 && brightness > 0.25 && brightness < 0.75;
  // 6) Paisaje: apaisado (>1.15), saturación variable, brillo medio
  const isLandscape = aspectRatio > 1.15;

  let type: VisionClassification["type"];
  if (isStone) type = "escultura de piedra";
  else if (isTextile) type = "textil/tejido";
  else if (isDoc) type = "documento/mapa";
  else if (isFestive) type = "escena festiva";
  else if (isPortrait) type = "retrato";
  else if (isLandscape) type = "paisaje";
  else type = "detalle/abstracto";

  // Sección sugerida (mapeo simple tipo→sección; el curador siempre manda)
  let suggestedSection: VisionClassification["suggestedSection"];
  if (type === "escena festiva") suggestedSection = "fiestas";
  else if (type === "paisaje") suggestedSection = "lugares";
  else if (type === "documento/mapa") suggestedSection = "historia";
  else if (type === "escultura de piedra") suggestedSection = "historia";
  else if (type === "textil/tejido") suggestedSection = "lugares";
  else if (type === "retrato") suggestedSection = "independencia";
  else suggestedSection = "lugares";

  // Confianza heurística interna (consistencia de las señales, 0–1)
  let confidence = 0.5;
  if (type === "escena festiva" && saturation > 0.5 && warmth > 0.2) confidence = 0.85;
  if (type === "paisaje" && aspectRatio > 1.3) confidence = 0.8;
  if (type === "documento/mapa" && contrast > 0.4) confidence = 0.8;
  if (type === "escultura de piedra" && saturation < 0.2) confidence = 0.75;
  if (type === "detalle/abstracto") confidence = 0.4;

  return { type, suggestedSection, confidence };
}

function composeCard(stats: VisionStats, cls: VisionClassification): CuratorialCard {
  const { type, suggestedSection, confidence } = cls;
  const { brightness, contrast, saturation, warmth, aspectRatio, palette, dominantHex } = stats;

  const isLight = brightness > 0.55;
  const isHighContrast = contrast > 0.35;
  const isVivid = saturation > 0.4;
  const isWarm = warmth > 0.1;
  const isCool = warmth < -0.1;
  const orient = aspectRatio > 1.15 ? "apaisada" : aspectRatio < 0.85 ? "vertical" : "cuadrada";

  // Nombres amigables para la redacción
  const domColorName = hexToName(dominantHex);
  const paletteNames = palette.slice(1, 4).map(hexToName).filter((v, i, arr) => arr.indexOf(v) === i);
  const paletteStr = paletteNames.length ? ` con acentos de ${paletteNames.join(", ")}` : "";

  // Plantillas por tipo (español neutro, tono museográfico)
  let title = "";
  let description = "";

  switch (type) {
    case "paisaje": {
      const regionHint = isWarm ? "andina" : isCool ? "de altura" : "regional";
      title = `Paisaje ${regionHint}`;
      const lightStr = isLight ? "de tonalidad clara" : "de tonalidad media";
      const contrastStr = isHighContrast ? ", con marcado contraste lumínico" : "";
      description =
        `Vista ${lightStr} de composición ${orient}, dominada por ${domColorName}${paletteStr}${contrastStr}. ` +
        `La obra sugiere un entorno ${regionHint} y fue clasificada automáticamente como paisaje a partir de su relación de aspecto y paleta. ` +
        `Sugerencia de sección: ${suggestedSection}. Confianza interna: ${Math.round(confidence * 100)}%.`;
      break;
    }
    case "retrato": {
      title = "Retrato";
      description =
        `Composición ${orient} con foco en figura humana, paleta centrada en ${domColorName}${paletteStr}. ` +
        `Contraste ${isHighContrast ? "alto" : "moderado"} y saturación ${isVivid ? "viva" : "moderada"}. ` +
        `Clasificación automática por proporción vertical y distribución de luminancia. ` +
        `Sugerencia de sección: ${suggestedSection}. Confianza interna: ${Math.round(confidence * 100)}%.`;
      break;
    }
    case "escena festiva": {
      title = "Escena festiva";
      description =
        `Composición ${orient} de alta saturación y calidez (dominancia de ${domColorName}${paletteStr}), ` +
        `típica de representaciones ceremoniales o celebraciones. Contraste ${isHighContrast ? "marcado" : "moderado"}. ` +
        `Clasificación automática por firma cromática festiva. ` +
        `Sugerencia de sección: ${suggestedSection}. Confianza interna: ${Math.round(confidence * 100)}%.`;
      break;
    }
    case "escultura de piedra": {
      title = "Escultura de piedra";
      description =
        `Obra tridimensional representada en plano, paleta neutra ${isWarm ? "cálida (terracota/ocre)" : isCool ? "fría (gris/azul)" : "neutra"} ` +
        `centrada en ${domColorName}. Bajo cromatismo, contraste ${isHighContrast ? "alto" : "moderado"} por modelado de volúmenes. ` +
        `Clasificación automática por desaturación y firma de material pétreo. ` +
        `Sugerencia de sección: ${suggestedSection}. Confianza interna: ${Math.round(confidence * 100)}%.`;
      break;
    }
    case "textil/tejido": {
      title = "Textil o tejido";
      description =
        `Composición ${orient} con patrón repetitivo y gama cromática ${isWarm ? "cálida" : isCool ? "fría" : "equilibrada"} ` +
        `(${domColorName}${paletteStr}). Saturación ${isVivid ? "alta" : "media"},_texture visual sugerida. ` +
        `Clasificación automática por periodicidad espectral y relación de aspecto. ` +
        `Sugerencia de sección: ${suggestedSection}. Confianza interna: ${Math.round(confidence * 100)}%.`;
      break;
    }
    case "documento/mapa": {
      title = "Documento o mapa";
      description =
        `Imagen ${orient} de alto contraste y trazo definido, paleta restringida (${domColorName}${paletteStr}). ` +
        `Compatible con documento histórico, plano o cartografía. Clasificación automática por contraste y geometría. ` +
        `Sugerencia de sección: ${suggestedSection}. Confianza interna: ${Math.round(confidence * 100)}%.`;
      break;
    }
    default: { // "detalle/abstracto"
      title = "Detalle";
      description =
        `Fragmento ${orient} de paleta ${isWarm ? "cálida" : isCool ? "fría" : "neutra"} (${domColorName}${paletteStr}). ` +
        `Saturación ${isVivid ? "alta" : "media/baja"}, contraste ${isHighContrast ? "alto" : "moderado"}. ` +
        `Clasificación genérica (no encaja en categorías principales). ` +
        `Sugerencia de sección: ${suggestedSection}. Confianza interna: ${Math.round(confidence * 100)}%.`;
    }
  }

  // Recorte defensivo: title ≤ 80 (límite del input), description razonable
  if (title.length > 80) title = title.slice(0, 77) + "...";

  return { title, description, suggestedSection, type, stats };
}

/** Helpers de UI: formateo de stats para logging/debug opcional */
export function formatVisionStats(stats: VisionStats): string {
  return [
    `Dominante: ${stats.dominantHex}`,
    `Paleta: ${stats.palette.join(", ")}`,
    `Brillo: ${(stats.brightness * 100).toFixed(0)}%`,
    `Contraste: ${(stats.contrast * 100).toFixed(0)}%`,
    `Saturación: ${(stats.saturation * 100).toFixed(0)}%`,
    `Calidez: ${stats.warmth > 0 ? "+" : ""}${stats.warmth.toFixed(2)}`,
    `Aspecto: ${stats.aspectRatio.toFixed(2)} (${stats.width}×${stats.height})`,
  ].join(" | ");
}