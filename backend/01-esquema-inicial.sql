-- ═══════════════════════════════════════════════════════════
-- Sistema Académico — Esquema inicial (Postgres puro)
-- Correr PRIMERO, sobre una base vacía.
--
-- ─────────────────────────────────────────────
-- CAMBIO DE ESTA VERSIÓN: IDs enteros vs UUID
--
-- roles, sedes, asignaturas, periodos_academicos y recursos
-- pasan de UUID a enteros autoincrementales (1, 2, 3...). Son
-- tablas de catálogo, de lectura pública para cualquier usuario
-- autenticado (sus políticas RLS ya usan `using (true)`) — no
-- hay nada que esconder ahí, así que un ID adivinable no es un
-- riesgo real, y son mucho más fáciles de leer a simple vista.
--
-- usuarios, estudiantes, profesores, acudientes, asignaciones,
-- matriculas, excepciones_plazo, notas y documentos SIGUEN en
-- UUID. Son datos personales o académicos — un ID adivinable
-- ahí sí filtra información real (cuántos estudiantes hay, qué
-- tan activo está el sistema), así que se quedan sin poder
-- enumerarse.
-- ─────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- TABLAS DE CATÁLOGO — enteros autoincrementales
-- ─────────────────────────────────────────────

create table roles (
  id integer generated always as identity primary key,
  nombre text not null unique
);

create table sedes (
  id integer generated always as identity primary key,
  nombre text not null,
  tipo text not null check (tipo = any (array['principal'::text, 'vereda'::text])),
  vereda text,
  sede_padre_id integer,
  created_at timestamp with time zone not null default now(),
  constraint sedes_sede_padre_id_fkey foreign key (sede_padre_id) references sedes(id)
);

create table asignaturas (
  id integer generated always as identity primary key,
  nombre text not null,
  codigo text not null unique
);

create table periodos_academicos (
  id integer generated always as identity primary key,
  nombre text not null,
  anio integer not null,
  numero integer not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  fecha_limite_notas timestamp with time zone not null,
  notas_habilitadas boolean not null default true,
  activo boolean not null default true
);

create table recursos (
  id integer generated always as identity primary key,
  codigo text not null unique,
  tipo text not null check (tipo = any (array['boton'::text, 'vista'::text, 'accion'::text])),
  descripcion text,
  modulo text not null
);

-- ─────────────────────────────────────────────
-- TABLAS DE PERSONAS Y DATOS ACADÉMICOS — UUID
-- ─────────────────────────────────────────────

-- usuarios: sin auth_id (no existe auth.users en Postgres puro),
-- con email + password_hash propios. usuarios.id ES la identidad.
-- rol_id y sede_id ahora son integer, apuntando a las tablas de
-- catálogo de arriba.
create table usuarios (
  id uuid not null default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  rol_id integer not null,
  sede_id integer,
  nombres text not null,
  apellidos text not null,
  documento text not null unique,
  activo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  constraint usuarios_pkey primary key (id),
  constraint usuarios_rol_id_fkey foreign key (rol_id) references roles(id),
  constraint usuarios_sede_id_fkey foreign key (sede_id) references sedes(id)
);

create table estudiantes (
  id uuid not null default gen_random_uuid(),
  usuario_id uuid not null unique,
  activo boolean not null default true,
  constraint estudiantes_pkey primary key (id),
  constraint estudiantes_usuario_id_fkey foreign key (usuario_id) references usuarios(id)
);

create table profesores (
  id uuid not null default gen_random_uuid(),
  usuario_id uuid not null unique,
  activo boolean not null default true,
  constraint profesores_pkey primary key (id),
  constraint profesores_usuario_id_fkey foreign key (usuario_id) references usuarios(id)
);

create table acudientes (
  id uuid not null default gen_random_uuid(),
  nombres text not null,
  apellidos text not null,
  documento text unique,
  telefono text,
  email text,
  usuario_id uuid,
  constraint acudientes_pkey primary key (id),
  constraint acudientes_usuario_id_fkey foreign key (usuario_id) references usuarios(id)
);

create table estudiante_acudientes (
  estudiante_id uuid not null,
  acudiente_id uuid not null,
  parentesco text not null,
  es_principal boolean not null default false,
  constraint estudiante_acudientes_pkey primary key (estudiante_id, acudiente_id),
  constraint estudiante_acudientes_estudiante_id_fkey foreign key (estudiante_id) references estudiantes(id),
  constraint estudiante_acudientes_acudiente_id_fkey foreign key (acudiente_id) references acudientes(id)
);

-- asignaciones: sede_id, asignatura_id y periodo_id ahora integer
create table asignaciones (
  id uuid not null default gen_random_uuid(),
  profesor_id uuid not null,
  asignatura_id integer not null,
  sede_id integer not null,
  grado text not null,
  periodo_id integer not null,
  constraint asignaciones_pkey primary key (id),
  constraint asignaciones_profesor_id_fkey foreign key (profesor_id) references profesores(id),
  constraint asignaciones_asignatura_id_fkey foreign key (asignatura_id) references asignaturas(id),
  constraint asignaciones_sede_id_fkey foreign key (sede_id) references sedes(id),
  constraint asignaciones_periodo_id_fkey foreign key (periodo_id) references periodos_academicos(id)
);

-- matriculas: sede_id y periodo_id ahora integer
create table matriculas (
  id uuid not null default gen_random_uuid(),
  estudiante_id uuid not null,
  sede_id integer not null,
  grado text not null,
  periodo_id integer not null,
  estado text not null default 'activa'::text,
  constraint matriculas_pkey primary key (id),
  constraint matriculas_estudiante_id_fkey foreign key (estudiante_id) references estudiantes(id),
  constraint matriculas_sede_id_fkey foreign key (sede_id) references sedes(id),
  constraint matriculas_periodo_id_fkey foreign key (periodo_id) references periodos_academicos(id)
);

-- excepciones_plazo: periodo_id ahora integer
create table excepciones_plazo (
  id uuid not null default gen_random_uuid(),
  profesor_id uuid not null,
  asignacion_id uuid not null,
  periodo_id integer not null,
  fecha_limite_extendida timestamp with time zone not null,
  autorizado_por uuid not null,
  motivo text,
  created_at timestamp with time zone not null default now(),
  constraint excepciones_plazo_pkey primary key (id),
  constraint excepciones_plazo_profesor_id_fkey foreign key (profesor_id) references profesores(id),
  constraint excepciones_plazo_asignacion_id_fkey foreign key (asignacion_id) references asignaciones(id),
  constraint excepciones_plazo_periodo_id_fkey foreign key (periodo_id) references periodos_academicos(id),
  constraint excepciones_plazo_autorizado_por_fkey foreign key (autorizado_por) references usuarios(id)
);

create table notas (
  id uuid not null default gen_random_uuid(),
  estudiante_id uuid not null,
  asignacion_id uuid not null,
  valor numeric not null check (valor >= 1.0 and valor <= 5.0),
  en_revision boolean not null default false,
  registrado_por uuid not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint notas_pkey primary key (id),
  constraint notas_estudiante_asignacion_unico unique (estudiante_id, asignacion_id),
  constraint notas_estudiante_id_fkey foreign key (estudiante_id) references estudiantes(id),
  constraint notas_asignacion_id_fkey foreign key (asignacion_id) references asignaciones(id),
  constraint notas_registrado_por_fkey foreign key (registrado_por) references usuarios(id)
);

-- permisos: rol_id y recurso_id ahora integer
create table permisos (
  rol_id integer not null,
  recurso_id integer not null,
  habilitado boolean not null default true,
  constraint permisos_pkey primary key (rol_id, recurso_id),
  constraint permisos_rol_id_fkey foreign key (rol_id) references roles(id),
  constraint permisos_recurso_id_fkey foreign key (recurso_id) references recursos(id)
);

create table documentos (
  id uuid not null default gen_random_uuid(),
  estudiante_id uuid,
  tipo_documento text not null,
  storage_path text not null,
  subido_por uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint documentos_pkey primary key (id),
  constraint documentos_estudiante_id_fkey foreign key (estudiante_id) references estudiantes(id),
  constraint documentos_subido_por_fkey foreign key (subido_por) references usuarios(id)
);

-- ─────────────────────────────────────────────
-- TRIGGER — updated_at en notas
-- ─────────────────────────────────────────────

create or replace function fn_actualizar_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_notas_updated_at
  before update on notas
  for each row execute function fn_actualizar_updated_at();

-- ─────────────────────────────────────────────
-- ÍNDICES
-- ─────────────────────────────────────────────

create index idx_usuarios_rol_id on usuarios(rol_id);
create index idx_usuarios_sede_id on usuarios(sede_id);
create index idx_asignaciones_profesor_id on asignaciones(profesor_id);
create index idx_asignaciones_periodo_id on asignaciones(periodo_id);
create index idx_matriculas_estudiante_id on matriculas(estudiante_id);
create index idx_matriculas_periodo_id on matriculas(periodo_id);
create index idx_notas_asignacion_id on notas(asignacion_id);
create index idx_notas_estudiante_id on notas(estudiante_id);

-- ─────────────────────────────────────────────
-- EL ROL "authenticated" — no existe en Postgres puro,
-- en Supabase lo creaba la plataforma sola.
-- ─────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

-- ⚠️  CAMBIÁ 'AppUserLocalDev2026' antes de correr esto.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'AppUserLocalDev2026';
  end if;
end $$;

grant authenticated to app_user;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
