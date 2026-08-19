-- ═══════════════════════════════════════════════════════════
-- Sistema Académico — Esquema inicial
-- Pegar en Supabase → SQL Editor → New query → Run
-- Orden respetado por dependencias de llaves foráneas.
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. IDENTIDAD Y ACCESO
-- ─────────────────────────────────────────────

create table roles (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique   -- 'admin' | 'profesor' | 'estudiante'
);

-- Sedes se crea antes que usuarios porque usuarios la referencia,
-- y es autorreferenciada para el árbol sede principal -> veredas.
create table sedes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  tipo           text not null check (tipo in ('principal','vereda')),
  vereda         text,
  sede_padre_id  uuid references sedes(id),
  created_at     timestamptz not null default now()
);

create table usuarios (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid not null unique references auth.users(id) on delete cascade,
  rol_id      uuid not null references roles(id),
  sede_id     uuid references sedes(id),
  nombres     text not null,
  apellidos   text not null,
  documento   text not null unique,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 2. ESTUDIANTES Y PROFESORES (extensión de usuarios)
-- ─────────────────────────────────────────────

create table estudiantes (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null unique references usuarios(id) on delete cascade,
  activo      boolean not null default true
);
-- La sede "actual" de un estudiante NO vive acá — se lee de su
-- matrícula del período activo. Un estudiante que pasa de una
-- vereda a la Sede Principal (primaria -> secundaria) es
-- simplemente una fila nueva en `matriculas`, sin sobrescribir
-- ni perder el historial de dónde estuvo antes.

create table profesores (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null unique references usuarios(id) on delete cascade,
  activo      boolean not null default true
);

-- ─────────────────────────────────────────────
-- 3. ACUDIENTES (relación N:N con estudiantes)
-- ─────────────────────────────────────────────

create table acudientes (
  id          uuid primary key default gen_random_uuid(),
  nombres     text not null,
  apellidos   text not null,
  documento   text unique,
  telefono    text,
  email       text,
  usuario_id  uuid references usuarios(id)   -- nullable: hoy es solo contacto
);

create table estudiante_acudientes (
  estudiante_id  uuid not null references estudiantes(id) on delete cascade,
  acudiente_id   uuid not null references acudientes(id) on delete cascade,
  parentesco     text not null,        -- 'madre' | 'padre' | 'tutor legal' ...
  es_principal   boolean not null default false,
  primary key (estudiante_id, acudiente_id)
);

-- ─────────────────────────────────────────────
-- 4. ESTRUCTURA ACADÉMICA
-- ─────────────────────────────────────────────

create table asignaturas (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null,
  codigo  text not null unique
);

create table periodos_academicos (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,          -- '2026-1'
  anio                  int not null,
  numero                int not null,           -- 1,2,3,4
  fecha_inicio          date not null,
  fecha_fin             date not null,
  fecha_limite_notas    timestamptz not null,
  notas_habilitadas     boolean not null default true,
  activo                boolean not null default true,
  unique (anio, numero)
);

create table asignaciones (
  id            uuid primary key default gen_random_uuid(),
  profesor_id   uuid not null references profesores(id),
  asignatura_id uuid not null references asignaturas(id),
  sede_id       uuid not null references sedes(id),
  grado         text not null,
  periodo_id    uuid not null references periodos_academicos(id),
  unique (profesor_id, asignatura_id, sede_id, grado, periodo_id)
);

create table matriculas (
  id             uuid primary key default gen_random_uuid(),
  estudiante_id  uuid not null references estudiantes(id),
  sede_id        uuid not null references sedes(id),
  grado          text not null,
  periodo_id     uuid not null references periodos_academicos(id),
  estado         text not null default 'activa',
  unique (estudiante_id, periodo_id)
);

-- ─────────────────────────────────────────────
-- 5. EXCEPCIONES DE PLAZO
-- ─────────────────────────────────────────────

create table excepciones_plazo (
  id                     uuid primary key default gen_random_uuid(),
  profesor_id            uuid not null references profesores(id),
  asignacion_id          uuid not null references asignaciones(id),
  periodo_id             uuid not null references periodos_academicos(id),
  fecha_limite_extendida timestamptz not null,
  autorizado_por         uuid not null references usuarios(id),
  motivo                 text,
  created_at             timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 6. NOTAS — una definitiva por período, no desglosada
-- ─────────────────────────────────────────────

create table notas (
  id              uuid primary key default gen_random_uuid(),
  estudiante_id   uuid not null references estudiantes(id),
  asignacion_id   uuid not null references asignaciones(id),
  valor           numeric(3,1) not null check (valor >= 1.0 and valor <= 5.0),
  en_revision     boolean not null default false,
  registrado_por  uuid not null references usuarios(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (estudiante_id, asignacion_id)
);

-- ─────────────────────────────────────────────
-- 7. PERMISOS DINÁMICOS
-- ─────────────────────────────────────────────

create table recursos (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null unique,   -- 'btn_registrar_nota', 'vista_admin_usuarios'
  tipo         text not null check (tipo in ('boton','vista','accion')),
  descripcion  text,
  modulo       text not null           -- 'notas', 'usuarios', 'documentos'
);

create table permisos (
  rol_id      uuid not null references roles(id) on delete cascade,
  recurso_id  uuid not null references recursos(id) on delete cascade,
  habilitado  boolean not null default true,
  primary key (rol_id, recurso_id)
);

-- ─────────────────────────────────────────────
-- 8. DOCUMENTOS (referencia a Supabase Storage)
-- ─────────────────────────────────────────────

create table documentos (
  id               uuid primary key default gen_random_uuid(),
  estudiante_id    uuid references estudiantes(id),   -- nullable: puede ser institucional
  tipo_documento   text not null,
  storage_path     text not null,      -- ruta dentro del bucket, nunca el binario
  subido_por       uuid not null references usuarios(id),
  created_at       timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- Trigger genérico: mantener updated_at al día en notas
-- ─────────────────────────────────────────────

create function fn_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_notas_updated_at
  before update on notas
  for each row execute function fn_set_updated_at();

-- ─────────────────────────────────────────────
-- Índices para las columnas que más se van a filtrar
-- ─────────────────────────────────────────────

create index idx_notas_estudiante        on notas(estudiante_id);
create index idx_notas_asignacion        on notas(asignacion_id);
create index idx_asignaciones_profesor   on asignaciones(profesor_id);
create index idx_asignaciones_periodo    on asignaciones(periodo_id);
create index idx_matriculas_estudiante   on matriculas(estudiante_id);
create index idx_usuarios_auth_id        on usuarios(auth_id);
create index idx_usuarios_sede           on usuarios(sede_id);
create index idx_estudiante_acudientes_e on estudiante_acudientes(estudiante_id);

-- ═══════════════════════════════════════════════════════════
-- Fin del esquema inicial.
-- Faltan las políticas RLS — sin ellas estas tablas están
-- abiertas para cualquier usuario autenticado. Ese es el
-- siguiente script, antes de cargar datos reales.
-- ═══════════════════════════════════════════════════════════
