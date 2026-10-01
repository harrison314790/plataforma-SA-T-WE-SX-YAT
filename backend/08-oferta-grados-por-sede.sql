-- ============================================================
-- 08-oferta-grados-por-sede.sql
-- Catálogo administrable: qué grados y grupos existen en cada sede.
-- Es lo que responde "Escuela La Laguna solo tiene hasta grado 5,
-- un grupo por grado" vs "Sede Principal tiene 1-11, con A y B en
-- varios grados" -- y le da al admin una pantalla real de
-- crear/eliminar grado+grupo por sede, en vez de que esa regla
-- viva escondida en el código de Laravel.
--
-- Corré esto DESPUÉS de 07-grado-grupo-malla.sql.
-- ============================================================

begin;

-- ----------------------------------------------------------------
-- 0. Ajuste previo: grupo pasa a NOT NULL en asignaciones/matriculas.
--    Motivo: para poder validar con una llave foránea compuesta
--    (sede_id, grado, grupo) contra oferta_grados, grupo no puede
--    quedar en null -- una FK con NULL en la columna simplemente no
--    se valida (Postgres la deja pasar), lo que anularía el control.
--    Un colegio sin grupos reales (todo el grado en una sola aula)
--    simplemente usa un grupo fijo, ej. 'A' o 'Único'.
-- ----------------------------------------------------------------
update asignaciones set grupo = 'A' where grupo is null;
update matriculas   set grupo = 'A' where grupo is null;

alter table asignaciones alter column grupo set not null;
alter table matriculas   alter column grupo set not null;

-- ----------------------------------------------------------------
-- 1. oferta_grados: catálogo de qué grado+grupo existe en cada sede
-- ----------------------------------------------------------------
create table oferta_grados (
  id integer generated always as identity primary key,
  sede_id integer not null references sedes(id),
  grado smallint not null check (grado between 1 and 11),
  grupo text not null,
  activo boolean not null default true,
  unique (sede_id, grado, grupo)
);

alter table oferta_grados enable row level security;

create policy oferta_grados_lectura_publica
  on oferta_grados for select
  using (true);

create policy oferta_grados_admin_gestiona
  on oferta_grados for all
  using (fn_es_admin())
  with check (fn_es_admin());

grant select, insert, update, delete on oferta_grados to authenticated;
grant usage, select on oferta_grados_id_seq to authenticated;

-- ----------------------------------------------------------------
-- 2. Poblar con lo que ya existe en asignaciones/matriculas, para
--    que las llaves foráneas del paso 3 no rompan datos de prueba
-- ----------------------------------------------------------------
insert into oferta_grados (sede_id, grado, grupo)
select distinct sede_id, grado, grupo from asignaciones
union
select distinct sede_id, grado, grupo from matriculas
on conflict (sede_id, grado, grupo) do nothing;

-- ----------------------------------------------------------------
-- 3. Llaves foráneas: una asignación o matrícula solo puede usar
--    una combinación sede+grado+grupo que el admin haya dado de alta
-- ----------------------------------------------------------------
alter table asignaciones
  add constraint asignaciones_oferta_fkey
  foreign key (sede_id, grado, grupo)
  references oferta_grados (sede_id, grado, grupo);

alter table matriculas
  add constraint matriculas_oferta_fkey
  foreign key (sede_id, grado, grupo)
  references oferta_grados (sede_id, grado, grupo);

commit;

-- ============================================================
-- Cómo funciona "eliminar" un grado/grupo desde la pantalla admin
-- ============================================================
-- Eliminar de verdad (DELETE) solo funciona si esa combinación nunca
-- se usó en asignaciones/matriculas -- la FK del paso 3 lo bloquea
-- automáticamente (error de Postgres, sin necesidad de código extra).
--
-- Si ya se usó (hay historial), "eliminar" en la práctica debe ser
-- poner activo = false, no un DELETE real. Así:
--   - el histórico de asignaciones/matrículas de años anteriores
--     sigue siendo válido (la FK no exige activo = true, solo que
--     la fila exista)
--   - la pantalla de "crear asignación" o "matricular estudiante"
--     filtra por activo = true, así que ese grado+grupo deja de
--     aparecer como opción para año actuales en adelante
--
-- Sugerencia de UI: el botón "eliminar" intenta el DELETE primero;
-- si Postgres devuelve el error de FK (código 23503), la pantalla
-- lo interpreta como "está en uso" y ofrece "desactivar" en su lugar.

-- ============================================================
-- Verificación (opcional, correr aparte)
-- ============================================================
-- select s.nombre as sede, og.grado, og.grupo, og.activo
-- from oferta_grados og join sedes s on s.id = og.sede_id
-- order by s.nombre, og.grado, og.grupo;
