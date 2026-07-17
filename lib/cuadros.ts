import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  CANONICAL_CUADROS,
  emptyCuadro,
  type Cuadro,
} from "@/types/cuadros";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "cuadros.json");
const UPLOADS_DIR = path.join(
  process.cwd(),
  "public",
  "uploads",
  "cuadros",
);

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

function mergeCanonical(saved: Cuadro[]): Cuadro[] {
  const map = new Map<string, Cuadro>(
    saved.map((c) => [c.name.toLowerCase(), c]),
  );
  return CANONICAL_CUADROS.map(
    (name) => map.get(name.toLowerCase()) ?? emptyCuadro(name),
  );
}

export async function ensureDataFile(): Promise<void> {
  await ensureDirs();
  try {
    await fs.access(DATA_FILE);
  } catch {
    const seed = CANONICAL_CUADROS.map(emptyCuadro);
    await fs.writeFile(DATA_FILE, JSON.stringify(seed, null, 2), "utf8");
  }
}

export async function readCuadros(): Promise<Cuadro[]> {
  await ensureDataFile();
  try {
    const txt = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(txt) as Cuadro[];
    if (!Array.isArray(parsed)) {
      return CANONICAL_CUADROS.map(emptyCuadro);
    }
    return mergeCanonical(parsed);
  } catch {
    return CANONICAL_CUADROS.map(emptyCuadro);
  }
}

export async function writeCuadros(records: Cuadro[]): Promise<void> {
  await ensureDirs();
  const merged = mergeCanonical(records);
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(merged, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
}

export async function getCuadrosMap(): Promise<Record<string, Cuadro>> {
  const records = await readCuadros();
  const out: Record<string, Cuadro> = {};
  for (const r of records) {
    out[r.name.toLowerCase()] = r;
  }
  return out;
}

function fileFromUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  const last = imageUrl.split("/").pop() ?? "";
  return last.split("?")[0] || null;
}

async function safeUnlink(filepath: string): Promise<void> {
  try {
    await fs.unlink(filepath);
  } catch {
    // file may not exist; ignore
  }
}

export async function saveCuadroImage(
  name: string,
  data: Uint8Array,
  mime: string,
): Promise<string> {
  if (mime !== "image/webp") {
    throw new Error("Tipo de archivo no soportado");
  }
  if (data.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("La imagen supera 6 MB");
  }
  await ensureDirs();
  const hash = crypto.randomBytes(6).toString("hex");
  const filename = `${name.toLowerCase()}-${hash}.webp`;
  const filepath = path.join(UPLOADS_DIR, filename);
  await fs.writeFile(filepath, data);

  // best-effort cleanup of the previously uploaded file
  const records = await readCuadros();
  const prev = records.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (prev?.imageUrl) {
    const prevName = fileFromUrl(prev.imageUrl);
    if (prevName && prevName !== filename) {
      await safeUnlink(path.join(UPLOADS_DIR, prevName));
    }
  }

  return `/uploads/cuadros/${filename}?v=${Date.now()}`;
}

export async function deleteCuadroImage(name: string): Promise<void> {
  const records = await readCuadros();
  const prev = records.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (prev?.imageUrl) {
    const prevName = fileFromUrl(prev.imageUrl);
    if (prevName) {
      await safeUnlink(path.join(UPLOADS_DIR, prevName));
    }
  }
}

export const CUADRO_LIMITS = { MAX_IMAGE_BYTES };
