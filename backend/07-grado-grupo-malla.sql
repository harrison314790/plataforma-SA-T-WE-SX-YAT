-- ============================================================
-- 07-grado-grupo-malla.sql
-- Separa "grado" (texto libre, ej '9-B') en dos columnas:
--   grado  smallint  (1 a 11, nivel real)
--   grupo  text      (A/B/C..., opcional)
-- Agrega malla_curricular: qué asignaturas corresponden a cada grado.
-- Agrega vista de apoyo para el cambio de sede primaria -> secundaria.
--
-- Corré esto DESPUÉS de 01-04. Si ya tenés datos de prueba cargados
-- (03-datos-prueba.sql), este script migra esos datos automáticamente
-- separando el texto por el guion.
-- ============================================================

begin;

-- ----------------------------------------------------------------
-- 0. Soltar las políticas RLS que dependen de asignaciones.grado
--    ANTES de tocar la columna -- Postgres no deja hacer drop column
--    con una política viva que la usa (error real, encontrado al
--    correr esto: "cannot drop column grado ... policy X depends on
--    column grado"). Se recrean al final del archivo, YA CORREGIDAS:
--    las tres comparaban solo a.grado = m.grado, que con grado+grupo
--    separados deja de alcanzar (9°-A matchearía con 9°-B, porque
--    ambos son grado=9) -- se les agrega "and a.grupo = m.grupo" al
--    recrearlas, no se recrean idénticas.
-- ----------------------------------------------------------------
drop policy estudiantes_profesor_ve_los_suyos on estudiantes;
drop policy matriculas_profesor_ve_las_suyas on matriculas;
drop policy notas_profesor_inserta_dentro_de_plazo on notas;

-- ----------------------------------------------------------------
-- 1. asignaciones: separar grado/grupo
-- ----------------------------------------------------------------
alter table asignaciones
  add column grado_nuevo smallint,
  add column grupo text;

update asignaciones
set grado_nuevo = split_part(grado, '-', 1)::smallint,
    grupo       = nullif(split_part(grado, '-', 2), '');

alter table asignaciones drop column grado;
alter table asignaciones rename column grado_nuevo to grado;

alter table asignaciones
  alter column grado set not null,
  add constraint asignaciones_grado_check check (grado between 1 and 11);

-- ----------------------------------------------------------------
-- 2. matriculas: separar grado/grupo (mismo patrón)
-- ----------------------------------------------------------------
alter table matriculas
  add column grado_nuevo smallint,
  add column grupo text;

update matriculas
set grado_nuevo = split_part(grado, '-', 1)::smallint,
    grupo       = nullif(split_part(grado, '-', 2), '');

alter table matriculas drop column grado;
alter table matriculas rename column grado_nuevo to grado;

alter table matriculas
  alter column grado set not null,
  add constraint matriculas_grado_check check (grado between 1 and 11);

-- ----------------------------------------------------------------
-- 3. malla_curricular: qué asignaturas ve cada grado
--    (catálogo -> id integer, igual que roles/sedes/asignaturas)
-- ----------------------------------------------------------------
create table malla_curricular (
  id integer generated always as identity primary key,
  grado smallint not null check (grado between 1 and 11),
  asignatura_id integer not null references asignaturas(id),
  unique (grado, asignatura_id)
);

alter table malla_curricular enable row level security;

create policy malla_curricular_lectura_publica
  on malla_curricular for select
  using (true);

create policy malla_curricular_admin_gestiona
  on malla_curricular for all
  using (fn_es_admin())
  with check (fn_es_admin());

grant select, insert, update, delete on malla_curricular to authenticated;
grant usage, select on malla_curricular_id_seq to authenticated;

-- ----------------------------------------------------------------
-- 4. Vista de apoyo: estudiantes pendientes de promoción / cambio de sede
--
-- Lógica: para cada estudiante activo, busca su matrícula más reciente
-- (por período). Si esa matrícula es de grado 5 (última de primaria) y
-- todavía no existe una matrícula suya en el período académico actual,
-- lo lista como "pendiente" -- típicamente para que el admin lo
-- matricule en grado 6 en la Sede Principal.
--
-- No fuerza el traslado (el admin decide sede/grupo al matricular),
-- solo evita que alguien se quede sin matricular por olvido.
-- ----------------------------------------------------------------
create or replace view vista_estudiantes_pendientes_promocion as
with ultima_matricula as (
  select distinct on (m.estudiante_id)
    m.estudiante_id,
    m.grado,
    m.grupo,
    m.sede_id,
    m.periodo_id,
    pa.anio,
    pa.numero
  from matriculas m
  join periodos_academicos pa on pa.id = m.periodo_id
  order by m.estudiante_id, pa.anio desc, pa.numero desc
),
periodo_actual as (
  select id, anio, numero
  from periodos_academicos
  where activo = true
  order by anio desc, numero desc
  limit 1
)
select
  e.id as estudiante_id,
  u.nombres,
  u.apellidos,
  um.grado as grado_anterior,
  um.grupo as grupo_anterior,
  s_origen.nombre as sede_anterior,
  um.anio as anio_anterior,
  case
    when um.grado = 5 then 'primaria_a_secundaria'
    else 'mismo_nivel'
  end as tipo_transicion
from estudiantes e
join usuarios u on u.id = e.usuario_id
join ultima_matricula um on um.estudiante_id = e.id
join sedes s_origen on s_origen.id = um.sede_id
cross join periodo_actual pact
where e.activo = true
  and not exists (
    select 1 from matriculas m2
    where m2.estudiante_id = e.id
      and m2.periodo_id = pact.id
  );

-- La vista respeta RLS de las tablas base (matriculas, estudiantes,
-- usuarios, sedes) porque no es security definer -- así que un admin
-- la ve completa y un profesor no ve nada raro por ahí.

-- ----------------------------------------------------------------
-- 5. Recrear las tres políticas del paso 0, CORREGIDAS: se agrega
--    "and a.grupo = m.grupo" (o el equivalente) a la condición que
--    antes solo comparaba grado. Sin esto, un profesor con una
--    asignación en 9°-A vería/insertaría sobre estudiantes de 9°-B,
--    porque a.grado = m.grado sigue siendo cierto (9 = 9) aunque el
--    grupo no coincida -- contradice la regla de "grado+grupo exacto".
-- ----------------------------------------------------------------

create policy estudiantes_profesor_ve_los_suyos on estudiantes for select
  to authenticated using (
    exists (
      select 1 from matriculas m
      join asignaciones a on a.sede_id = m.sede_id
                          and a.grado = m.grado
                          and a.grupo = m.grupo
                          and a.periodo_id = m.periodo_id
      where m.estudiante_id = estudiantes.id
        and a.profesor_id = fn_profesor_id_actual()
    )
  );

create policy matriculas_profesor_ve_las_suyas on matriculas for select
  to authenticated using (
    exists (
      select 1 from asignaciones a
      where a.profesor_id = fn_profesor_id_actual()
        and a.sede_id = matriculas.sede_id
        and a.grado = matriculas.grado
        and a.grupo = matriculas.grupo
        and a.periodo_id = matriculas.periodo_id
    )
  );

create policy notas_profesor_inserta_dentro_de_plazo on notas for insert
  to authenticated with check (
    exists (
      select 1 from asignaciones a
      where a.id = asignacion_id
        and a.profesor_id = fn_profesor_id_actual()
    )
    and exists (
      select 1 from matriculas m
      join asignaciones a on a.sede_id = m.sede_id
                          and a.grado = m.grado
                          and a.grupo = m.grupo
                          and a.periodo_id = m.periodo_id
      where a.id = asignacion_id
        and m.estudiante_id = notas.estudiante_id
    )
    and (
      exists (
        select 1 from asignaciones a
        join periodos_academicos p on p.id = a.periodo_id
        where a.id = asignacion_id
          and p.notas_habilitadas = true
          and now() <= p.fecha_limite_notas
      )
      or exists (
        select 1 from excepciones_plazo ex
        where ex.asignacion_id = notas.asignacion_id
          and ex.profesor_id = fn_profesor_id_actual()
          and now() <= ex.fecha_limite_extendida
      )
    )
  );

commit;

-- ============================================================
-- Verificación (opcional, correr aparte)
-- ============================================================
-- select grado, grupo, count(*) from asignaciones group by grado, grupo order by 1,2;
-- select grado, grupo, count(*) from matriculas group by grado, grupo order by 1,2;
-- select * from vista_estudiantes_pendientes_promocion;
