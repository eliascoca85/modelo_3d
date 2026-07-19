export type Cuadro = {
  name: string;
  title: string | null;
  imageUrl: string | null;
  description: string;
};

/** Paneles planos del GLB que también aceptan imagen desde admin */
export const CANONICAL_EXTRA_PANELS: string[] = [
  "pintura",
  "presentacion_1",
  "presentacion_2",
];

export const CANONICAL_CUADROS: string[] = [
  ...Array.from({ length: 21 }, (_, i) => `cuadro_${i + 1}`),
  ...CANONICAL_EXTRA_PANELS,
];

export const CUADRO_NAME_PATTERN = /^cuadro_\d+$/i;
export const PRESENTACION_NAME_PATTERN = /^presentacion_\d+$/i;
export const PINTURA_NAME_PATTERN = /^pintura$/i;

/** Nombres gestionables desde /admin/cuadros (cuadros + paneles extra) */
export const MANAGED_PANEL_PATTERN =
  /^(cuadro_\d+|pintura|presentacion_\d+)$/i;

export function isCuadroName(name: string): boolean {
  return CUADRO_NAME_PATTERN.test(name);
}

export function isManagedPanelName(name: string): boolean {
  return MANAGED_PANEL_PATTERN.test(name);
}

export function emptyCuadro(name: string): Cuadro {
  return { name: name.toLowerCase(), title: null, imageUrl: null, description: "" };
}

export function cuadroDisplayName(name: string): string {
  const cuadro = /^cuadro_(\d+)$/i.exec(name);
  if (cuadro) return `Cuadro ${cuadro[1]}`;

  const presentacion = /^presentacion_(\d+)$/i.exec(name);
  if (presentacion) return `Presentación ${presentacion[1]}`;

  if (PINTURA_NAME_PATTERN.test(name)) return "Pintura";

  return name;
}
