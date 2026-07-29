"use client";

import { useEffect, useId, useRef, useState } from "react";
import { analyzeCuadroImage, type CuratorialCard } from "@/lib/cuadro-vision";

// Dropzone de imágenes WebP para el modal de cuadros.
//
// Renderiza un <input type="file" name="file"> oculto DENTRO del <form> del
// modal, así el Server Action lo recibe en el FormData normalmente. La zona
// visual maneja drag & drop y click-to-pick, e inyecta el archivo elegido en
// el input oculto (vía DataTransfer) para que el submit lo incluya.
//
// Validación client-side (tipo + tamaño) sólo para feedback inmediato: el
// Server Action vuelve a validar antes de subir a Cloudinary.
//
// NUEVO: botón "Sugerir ficha" que analiza la imagen en el navegador
// (Canvas API, sin dependencias, $0) y propone título + descripción
// curatorial + sección sugerida. El modal padre recibe la ficha vía callback
// y pre-rellena los campos (el curador revisa y edita antes de guardar).

const MAX_BYTES = 6 * 1024 * 1024;

type Props = {
  currentUrl?: string | null;
  alt: string;
  /** Callback cuando el análisis termina (éxito o error). */
  onSuggest?: (card: CuratorialCard | null, error?: string) => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CuadroDropzone({ currentUrl, alt, onSuggest }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggested, setSuggested] = useState(false);

  const previewUrl = file ? objectUrl : currentUrl ?? null;

  // Crea/revokea el object URL del archivo en staging para evitar leaks.
  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Analiza la imagen seleccionada y devuelve ficha curatorial.
  const handleSuggest = async () => {
    if (!file || !onSuggest) return;
    setAnalyzing(true);
    setSuggested(false);
    setError(null);
    try {
      const card = await analyzeCuadroImage(file);
      onSuggest(card);
      setSuggested(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al analizar la imagen";
      setError(msg);
      onSuggest(null, msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const applyFile = (incoming: File | null | undefined) => {
    if (!incoming) return;
    if (incoming.type !== "image/webp") {
      setError("La imagen tiene que ser formato WebP");
      return;
    }
    if (incoming.size > MAX_BYTES) {
      setError("La imagen supera los 6 MB");
      return;
    }
    setError(null);
    const dt = new DataTransfer();
    dt.items.add(incoming);
    if (inputRef.current) inputRef.current.files = dt.files;
    setFile(incoming);
    setSuggested(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    applyFile(e.dataTransfer.files?.[0]);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <div>
      <label className="mb-1.5 block text-[10px] uppercase tracking-[0.25em] text-slate-400">
        Imagen WebP
      </label>

      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        className={`group relative flex aspect-video w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-slate-900/60 text-center transition ${
          dragOver
            ? "border-amber-300/60 bg-amber-300/5"
            : "border-white/15 hover:border-amber-300/40 hover:bg-white/4"
        }`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={alt} className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-8">
            <svg
              className="h-8 w-8 text-white/25"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm font-medium text-white/60">
              Arrastrá una imagen WebP
            </p>
            <p className="text-xs text-white/30">o hacé clic para elegir un archivo</p>
          </div>
        )}

        {/* Overlay de análisis */}
        {analyzing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-xs text-amber-200">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analizando imagen…
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          name="file"
          accept="image/webp"
          className="sr-only"
          onChange={(e) => applyFile(e.currentTarget.files?.[0])}
        />
      </div>

      {/* Botón "Sugerir ficha" (solo si hay archivo y no se está analizando) */}
      {file && !analyzing && !suggested && onSuggest && (
        <button
          type="button"
          onClick={handleSuggest}
          className="mt-2 w-full rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-300/20 hover:text-amber-100"
        >
          Sugerir ficha (IA local)
        </button>
      )}

      {/* Info del archivo + estado de sugerencia */}
      {file && (
        <div className="mt-2 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 truncate">
            <span className="truncate text-white/70">
              {file.name} · {formatBytes(file.size)}
            </span>
            {suggested && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-300/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM4.343 4.343a.75.75 0 011.06 0l1.061 1.06a.75.75 0 01-1.06 1.061l-1.061-1.06a.75.75 0 010-1.061zM13.536 13.536a.75.75 0 011.06 0l1.061 1.06a.75.75 0 01-1.06 1.061l-1.061-1.06a.75.75 0 010-1.061zM2 10a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 012 10zM15 10a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 0115 10zM4.343 15.657a.75.75 0 010-1.06l1.061-1.061a.75.75 0 111.06 1.06l-1.06 1.061a.75.75 0 01-1.061 0zM13.536 6.464a.75.75 0 010-1.06l1.061-1.061a.75.75 0 111.06 1.06l-1.06 1.061a.75.75 0 01-1.061 0z" />
                </svg>
                Ficha sugerida
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFile(null);
              setError(null);
              setSuggested(false);
              if (inputRef.current) inputRef.current.files = null;
            }}
            className="ml-3 shrink-0 text-amber-200/70 transition hover:text-amber-200"
          >
            Quitar
          </button>
        </div>
      )}

      {error && (
        <p role="status" className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}