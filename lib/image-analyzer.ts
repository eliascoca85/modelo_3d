// ---------------------------------------------------------------------------
// lib/image-analyzer.ts
//
// Motor de visión por computadora clásica — 100 % client-side, cero
// dependencias. Extrae paleta dominante, estadísticas visuales, clasifica la
// obra (tipo + sección del museo) y genera texto curatorial en español por
// plantillas.  Toda la lógica es determinista y explicable.
//
// Punto de entrada público:
//   suggestCuratorialCard(file: File): Promise<CuratorialSuggestion>
// ---------------------------------------------------------------------------

/* ========================================================================= */
/*  TIPOS PÚBLICOS                                                           */
/* ========================================================================= */

export type RGB = [number, number, number];

export type PaletteColor = {
  rgb: RGB;
  /** Nombre artístico en español (ej. "ocre", "terracota"). */
  name: string;
  /** Proporción 0-1 del total de píxeles. */
  percentage: number;
};

export type ImageAnalysis = {
  palette: PaletteColor[];
  /** Brillo medio 0-1 (luminancia relativa). */
  brightness: number;
  /** Contraste 0-1 (desviación estándar de luminancia). */
  contrast: number;
  /** Saturación media 0-1 (canal S en HSL). */
  saturation: number;
  /** Sesgo de calidez −1 (frío) a +1 (cálido). */
  warmth: number;
  aspectRatio: "landscape" | "portrait" | "square";
};

export type ArtworkClassification = {
  type: string;
  section: string;
  confidence: "alta" | "media" | "baja";
};

export type CuratorialSuggestion = {
  title: string;
  description: string;
  suggestedSection: string;
};

/* ========================================================================= */
/*  VOCABULARIO DE COLORES (ESPAÑOL)                                         */
/* ========================================================================= */

type NamedColor = { name: string; rgb: RGB };

const COLOR_VOCABULARY: NamedColor[] = [
  // Tierras y cálidos
  { name: "ocre", rgb: [204, 163, 56] },
  { name: "terracota", rgb: [204, 78, 42] },
  { name: "siena tostada", rgb: [150, 82, 45] },
  { name: "siena natural", rgb: [210, 145, 80] },
  { name: "bermellón", rgb: [227, 66, 52] },
  { name: "carmín", rgb: [175, 30, 45] },
  { name: "rojo óxido", rgb: [135, 37, 28] },
  { name: "anaranjado", rgb: [235, 137, 33] },
  { name: "ámbar", rgb: [255, 191, 0] },
  { name: "dorado", rgb: [218, 165, 32] },
  { name: "amarillo pálido", rgb: [250, 230, 140] },

  // Verdes
  { name: "verde esmeralda", rgb: [0, 155, 92] },
  { name: "verde oliva", rgb: [107, 124, 58] },
  { name: "verde musgo", rgb: [74, 93, 35] },
  { name: "verde claro", rgb: [144, 190, 109] },

  // Azules
  { name: "azul cobalto", rgb: [0, 71, 171] },
  { name: "azul ultramarino", rgb: [18, 10, 143] },
  { name: "azul cielo", rgb: [135, 206, 235] },
  { name: "azul cerúleo", rgb: [42, 82, 150] },
  { name: "turquesa", rgb: [0, 177, 169] },

  // Violetas
  { name: "púrpura", rgb: [128, 0, 128] },
  { name: "lila", rgb: [180, 130, 190] },
  { name: "malva", rgb: [153, 102, 153] },

  // Neutros
  { name: "blanco", rgb: [250, 250, 250] },
  { name: "marfil", rgb: [240, 233, 210] },
  { name: "gris perla", rgb: [196, 196, 196] },
  { name: "gris pizarra", rgb: [110, 110, 120] },
  { name: "negro", rgb: [25, 25, 30] },
  { name: "marrón oscuro", rgb: [65, 42, 25] },
  { name: "beige", rgb: [220, 205, 175] },
  { name: "crema", rgb: [255, 244, 220] },

  // Rosados
  { name: "rosa", rgb: [230, 150, 160] },
  { name: "salmón", rgb: [250, 128, 114] },
];

/* ========================================================================= */
/*  UTILIDADES DE COLOR                                                      */
/* ========================================================================= */

function rgbDistance(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function nameColor(rgb: RGB): string {
  let best = COLOR_VOCABULARY[0];
  let bestDist = Infinity;
  for (const entry of COLOR_VOCABULARY) {
    const d = rgbDistance(rgb, entry.rgb);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  return best.name;
}

/** Luminancia relativa (rec. 709). */
function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Saturación HSL de un píxel. */
function saturationHSL(r: number, g: number, b: number): number {
  const r01 = r / 255;
  const g01 = g / 255;
  const b01 = b / 255;
  const max = Math.max(r01, g01, b01);
  const min = Math.min(r01, g01, b01);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return l > 0.5
    ? (max - min) / (2 - max - min)
    : (max - min) / (max + min);
}

/* ========================================================================= */
/*  MEDIAN-CUT: CUANTIZACIÓN DE PALETA                                       */
/* ========================================================================= */

/**
 * Extrae los N colores dominantes de un array de píxeles RGBA plano (lo que
 * devuelve `ImageData.data`) mediante median-cut simplificado.
 */
function medianCut(pixels: Uint8ClampedArray, numColors: number): { rgb: RGB; count: number }[] {
  // Construir lista de colores únicos (down-sampled a 5 bits para agrupar)
  type Bucket = { r: number; g: number; b: number; count: number };
  const map = new Map<number, Bucket>();

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    // Ignorar píxeles muy transparentes
    if (a < 128) continue;
    // Cuantizar a 5 bits para reducir espacio
    const qr = r >> 3;
    const qg = g >> 3;
    const qb = b >> 3;
    const key = (qr << 10) | (qg << 5) | qb;
    const existing = map.get(key);
    if (existing) {
      existing.r += r;
      existing.g += g;
      existing.b += b;
      existing.count++;
    } else {
      map.set(key, { r, g, b, count: 1 });
    }
  }

  // Promediar cada bucket
  type ColorEntry = { r: number; g: number; b: number; count: number };
  const entries: ColorEntry[] = [];
  for (const v of map.values()) {
    entries.push({
      r: Math.round(v.r / v.count),
      g: Math.round(v.g / v.count),
      b: Math.round(v.b / v.count),
      count: v.count,
    });
  }

  if (entries.length === 0) {
    return [{ rgb: [128, 128, 128], count: 1 }];
  }

  // Median-cut iterativo
  type Box = ColorEntry[];
  const boxes: Box[] = [entries];

  while (boxes.length < numColors) {
    // Elegir el box más grande (por población)
    let maxIdx = 0;
    let maxCount = 0;
    for (let i = 0; i < boxes.length; i++) {
      const cnt = boxes[i].reduce((s, e) => s + e.count, 0);
      if (cnt > maxCount) {
        maxCount = cnt;
        maxIdx = i;
      }
    }

    const box = boxes[maxIdx];
    if (box.length <= 1) break;

    // Canal con mayor rango
    let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
    for (const e of box) {
      if (e.r < minR) minR = e.r;
      if (e.r > maxR) maxR = e.r;
      if (e.g < minG) minG = e.g;
      if (e.g > maxG) maxG = e.g;
      if (e.b < minB) minB = e.b;
      if (e.b > maxB) maxB = e.b;
    }
    const rangeR = maxR - minR;
    const rangeG = maxG - minG;
    const rangeB = maxB - minB;

    let channel: "r" | "g" | "b" = "r";
    if (rangeG >= rangeR && rangeG >= rangeB) channel = "g";
    else if (rangeB >= rangeR && rangeB >= rangeG) channel = "b";

    // Ordenar por el canal dominante y partir por la mediana
    box.sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(box.length / 2);
    boxes.splice(maxIdx, 1, box.slice(0, mid), box.slice(mid));
  }

  // Promediar cada box → color representativo
  const totalPixels = entries.reduce((s, e) => s + e.count, 0);
  return boxes.map((box) => {
    let rSum = 0, gSum = 0, bSum = 0, cnt = 0;
    for (const e of box) {
      rSum += e.r * e.count;
      gSum += e.g * e.count;
      bSum += e.b * e.count;
      cnt += e.count;
    }
    return {
      rgb: [
        Math.round(rSum / cnt),
        Math.round(gSum / cnt),
        Math.round(bSum / cnt),
      ] as RGB,
      count: cnt / totalPixels,
    };
  }).sort((a, b) => b.count - a.count);
}

/* ========================================================================= */
/*  ANÁLISIS DE IMAGEN                                                       */
/* ========================================================================= */

/**
 * Analiza una imagen WebP cargada desde un File usando un <canvas> offscreen.
 * Todo ocurre en el hilo principal del navegador; ~128px es rápido (<50ms).
 */
export async function analyzeImage(file: File): Promise<ImageAnalysis> {
  const bitmap = await createImageBitmap(file);

  // Reescalar a ~128px de lado mayor
  const scale = 128 / Math.max(bitmap.width, bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;

  // --- Paleta ---
  const rawPalette = medianCut(data, 5);
  const palette: PaletteColor[] = rawPalette.map((c) => ({
    rgb: c.rgb,
    name: nameColor(c.rgb),
    percentage: c.count,
  }));

  // --- Estadísticas de píxel ---
  let lumSum = 0;
  let lumSqSum = 0;
  let satSum = 0;
  let warmthSum = 0;
  let validPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue;

    validPixels++;
    const lum = luminance(r, g, b);
    lumSum += lum;
    lumSqSum += lum * lum;
    satSum += saturationHSL(r, g, b);
    // Calidez: sesgo R+G/2 (cálidos) vs B (fríos), normalizado
    warmthSum += (r / 255 - b / 255);
  }

  const n = validPixels || 1;
  const brightness = lumSum / n;
  const variance = lumSqSum / n - brightness * brightness;
  const contrast = Math.min(Math.sqrt(Math.max(variance, 0)) * 3, 1);
  const saturationAvg = satSum / n;
  const warmth = Math.max(-1, Math.min(1, warmthSum / n));

  // --- Relación de aspecto ---
  const ratio = bitmap.width / bitmap.height;
  let aspectRatio: "landscape" | "portrait" | "square";
  if (ratio > 1.15) aspectRatio = "landscape";
  else if (ratio < 0.87) aspectRatio = "portrait";
  else aspectRatio = "square";

  return {
    palette,
    brightness,
    contrast,
    saturation: saturationAvg,
    warmth,
    aspectRatio,
  };
}

/* ========================================================================= */
/*  CLASIFICACIÓN POR REGLAS                                                 */
/* ========================================================================= */

/** Proporción de paleta que corresponde a un conjunto de nombres. */
function paletteWeight(palette: PaletteColor[], names: string[]): number {
  return palette
    .filter((c) => names.includes(c.name))
    .reduce((s, c) => s + c.percentage, 0);
}

const WARM_COLORS = [
  "ocre", "terracota", "siena tostada", "siena natural", "bermellón",
  "carmín", "rojo óxido", "anaranjado", "ámbar", "dorado",
  "amarillo pálido", "salmón", "marrón oscuro",
];

const COOL_COLORS = [
  "azul cobalto", "azul ultramarino", "azul cielo", "azul cerúleo",
  "turquesa", "púrpura", "lila", "malva",
];

const GREEN_COLORS = ["verde esmeralda", "verde oliva", "verde musgo", "verde claro"];

const EARTH_COLORS = [
  "ocre", "terracota", "siena tostada", "siena natural",
  "marrón oscuro", "beige", "crema", "marfil",
];

const FESTIVE_COLORS = [
  "bermellón", "carmín", "anaranjado", "ámbar", "dorado",
  "amarillo pálido", "verde esmeralda", "azul cobalto", "púrpura", "rosa",
];

const PATRIOTIC_COLORS = [
  "bermellón", "carmín", "rojo óxido", "anaranjado",
  "amarillo pálido", "ámbar", "dorado", "verde esmeralda", "verde oliva",
];

export function classifyArtwork(analysis: ImageAnalysis): ArtworkClassification {
  const { palette, brightness, contrast, saturation, warmth, aspectRatio } = analysis;

  const warmWeight = paletteWeight(palette, WARM_COLORS);
  const coolWeight = paletteWeight(palette, COOL_COLORS);
  const greenWeight = paletteWeight(palette, GREEN_COLORS);
  const earthWeight = paletteWeight(palette, EARTH_COLORS);
  const festiveWeight = paletteWeight(palette, FESTIVE_COLORS);
  const patrioticWeight = paletteWeight(palette, PATRIOTIC_COLORS);

  // --- Tipo ---
  let type: string;
  let section: string;
  let confidence: "alta" | "media" | "baja" = "media";

  // Escultura: baja saturación + tonos tierra dominantes + contraste moderado
  if (saturation < 0.18 && earthWeight > 0.55 && brightness < 0.6) {
    type = "escultura de piedra";
    section = "Historia";
    confidence = saturation < 0.12 ? "alta" : "media";
  }
  // Documento/mapa: alta proporción de claros + bajo contraste + baja saturación
  else if (brightness > 0.65 && saturation < 0.2 && contrast < 0.3) {
    type = "documento o mapa";
    section = "Independencia";
    confidence = "media";
  }
  // Escena festiva: alta saturación + colores vivos diversos
  else if (saturation > 0.38 && festiveWeight > 0.35 && contrast > 0.25) {
    type = "escena festiva";
    section = "Fiestas";
    confidence = saturation > 0.5 ? "alta" : "media";
  }
  // Paisaje: landscape + greens/blues + saturación moderada a alta
  else if (
    aspectRatio === "landscape" &&
    (greenWeight + coolWeight) > 0.25 &&
    saturation > 0.2
  ) {
    type = "paisaje";
    section = "Lugares";
    confidence = (greenWeight + coolWeight) > 0.4 ? "alta" : "media";
  }
  // Retrato: portrait + tonos cálidos/piel
  else if (aspectRatio === "portrait" && warmWeight > 0.3 && saturation < 0.45) {
    type = "retrato";
    section = "Historia";
    confidence = warmWeight > 0.5 ? "alta" : "media";
  }
  // Naturaleza muerta / comidas: cálidos + tierra dominante
  else if (warmth > 0.1 && earthWeight > 0.3 && warmWeight > 0.4) {
    type = "naturaleza muerta";
    section = "Comidas";
    confidence = warmWeight > 0.55 ? "alta" : "media";
  }
  // Independencia: colores patrios + contraste notable
  else if (patrioticWeight > 0.4 && contrast > 0.2) {
    type = "escena histórica";
    section = "Independencia";
    confidence = patrioticWeight > 0.55 ? "alta" : "media";
  }
  // Paisaje genérico (fallback para landscape)
  else if (aspectRatio === "landscape") {
    type = "paisaje";
    section = "Lugares";
    confidence = "baja";
  }
  // Textil: saturación media-alta + colores variados + no encaja arriba
  else if (saturation > 0.3 && palette.length >= 4) {
    type = "textil o artesanía";
    section = "Fiestas";
    confidence = "baja";
  }
  // Fallback
  else {
    type = "obra artística";
    section = warmth > 0 ? "Lugares" : "Historia";
    confidence = "baja";
  }

  return { type, section, confidence };
}

/* ========================================================================= */
/*  NLG — GENERACIÓN DE TEXTO CURATORIAL (ESPAÑOL NATIVO)                    */
/* ========================================================================= */

function describePalette(palette: PaletteColor[]): string {
  const top = palette.slice(0, 3);
  if (top.length === 0) return "paleta indefinida";
  if (top.length === 1) return `tonos de ${top[0].name}`;
  const last = top.pop()!;
  return `${top.map((c) => c.name).join(", ")} y ${last.name}`;
}

function describeBrightness(b: number): string {
  if (b > 0.7) return "luminosa";
  if (b > 0.45) return "de tonos medios";
  if (b > 0.25) return "de tonos profundos";
  return "oscura y dramática";
}

function describeContrast(c: number): string {
  if (c > 0.6) return "de alto contraste";
  if (c > 0.3) return "de contraste moderado";
  return "de bajo contraste";
}

function describeWarmth(w: number): string {
  if (w > 0.25) return "paleta cálida";
  if (w > 0.05) return "paleta ligeramente cálida";
  if (w > -0.05) return "paleta neutra";
  if (w > -0.25) return "paleta ligeramente fría";
  return "paleta fría";
}

function describeAspect(a: "landscape" | "portrait" | "square"): string {
  if (a === "landscape") return "composición apaisada";
  if (a === "portrait") return "composición vertical";
  return "composición cuadrada";
}

/** Mapa sección → descriptor regional para el título. */
const SECTION_REGION: Record<string, string> = {
  Lugares: "de región andina",
  Fiestas: "de tradición festiva",
  Comidas: "de tradición culinaria",
  Historia: "de valor histórico",
  Independencia: "de época independentista",
};

export function generateCuratorialText(
  classification: ArtworkClassification,
  analysis: ImageAnalysis,
): CuratorialSuggestion {
  const { type, section } = classification;
  const { palette, brightness, contrast, warmth, aspectRatio } = analysis;

  const palDesc = describePalette(palette);
  const region = SECTION_REGION[section] ?? "de la colección";

  // --- Título ---
  const typeCapitalized = type.charAt(0).toUpperCase() + type.slice(1);
  const dominantColor = palette[0]?.name ?? "tonos neutros";
  const title = `${typeCapitalized} ${region} en ${dominantColor}`;

  // --- Descripción museográfica ---
  const fragments: string[] = [
    `${typeCapitalized} ${region}`,
    `de ${describeWarmth(warmth)} dominada por ${palDesc}`,
    describeBrightness(brightness),
    describeContrast(contrast),
    `y ${describeAspect(aspectRatio)}`,
  ];

  const body = fragments.join(", ");
  const suggestion = `sugerido para la sección ${section}`;
  const description = `${body}. ${suggestion.charAt(0).toUpperCase() + suggestion.slice(1)}.`;

  return {
    title,
    description,
    suggestedSection: section,
  };
}

/* ========================================================================= */
/*  PUNTO DE ENTRADA PÚBLICO                                                 */
/* ========================================================================= */

/**
 * Analiza una imagen WebP y devuelve la sugerencia curatorial completa.
 * Todo ocurre en el navegador del curador — sin red, sin modelo, sin API.
 */
export async function suggestCuratorialCard(
  file: File,
): Promise<CuratorialSuggestion> {
  const analysis = await analyzeImage(file);
  const classification = classifyArtwork(analysis);
  return generateCuratorialText(classification, analysis);
}
