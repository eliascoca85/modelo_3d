-- Esquema del museo 3D en Supabase.
-- Correr una sola vez desde el SQL Editor del dashboard de Supabase.
-- Local y Vercel comparten esta misma DB, así que no hace falta repetirlo.

-- Cuadros / paneles: una fila por nombre canónico (cuadro_1..cuadro_21,
-- pintura, presentacion_1, presentacion_2). No hace falta sembrar las 24 filas:
-- lib/cuadros.ts mergea CANONICAL_CUADROS con lo que exista acá y completa las
-- que falten con valores vacíos. El admin hace upsert por `name`.
create table if not exists public.cuadros (
  name text primary key,
  title text,
  description text not null default '',
  image_url text,
  image_public_id text,
  updated_at timestamptz not null default now()
);

-- Migración: agregar `title` a una tabla `cuadros` ya existente.
-- Es idempotente, se puede correr cuantas veces se quiera. `title` es nullable:
-- si está vacío/null, la tarjeta del museo muestra el nombre derivado de la
-- pieza (cuadroDisplayName); si el admin le pone un título, ese aparece.
alter table public.cuadros
  add column if not exists title text;

-- Usuarios del admin. La contraseña se guarda hasheada (scrypt) en
-- password_hash; el servicio nunca devuelve el hash al cliente.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  created_at timestamptz not null default now()
);
