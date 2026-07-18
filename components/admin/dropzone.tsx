"use client";

import { useEffect, useId, useRef, useState } from "react";

// Dropzone de imágenes WebP para el modal de cuadros.
//
// Renderiza un <input type="file" name="file"> oculto DENTRO del <form> del
// modal, así el Server Action lo recibe en el FormData normalmente. La zona
// visual maneja drag & drop y click-to-pick, e inyecta el archivo elegido en
// el input oculto (vía DataTransfer) para que el submit lo incluya.
//
// Validación client-side (tipo + tamaño) sólo para feedback inmediato: el
// Server Action vuelve a validar antes de subir a Cloudinary.

const MAX_BYTES = 6 * 1024 * 1024;

type Props = {
  currentUrl?: string | null;
  alt: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CuadroDropzone({ currentUrl, alt }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            : "border-white/15 hover:border-amber-300/40 hover:bg-white/[0.04]"
        }`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={alt}
            className="h-full w-full object-contain"
          />
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

      {file && (
        <div className="mt-2 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
          <span className="truncate text-white/70">
            {file.name} · {formatBytes(file.size)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFile(null);
              setError(null);
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
