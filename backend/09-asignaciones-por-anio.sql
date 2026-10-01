-- ============================================================
-- 09-asignaciones-por-anio.sql
-- Corrige el grano de "asignaciones": pasa de "una fila por
-- período" (4 filas idénticas al año, una por cada uno de los
-- 4 períodos) a "una fila por año" -- porque asignar un profesor
-- a una materia/grado/grupo es un acto que se hace UNA vez al
-- año, no cuatro veces.
--
-- Las notas SÍ siguen siendo una por período (la definitiva de
-- cada período), así que `periodo_id` se muda de `asignaciones`
-- a `notas` directamente.
--
-- También corrige un bug que dejó pendiente 07-grado-grupo-malla.sql:
-- las políticas RLS que cruzan asignaciones<->matriculas comparaban
-- sede+grado+período pero nunca agregaron `grupo` a la comparación.
--
-- Corré esto DESPUÉS de 08-oferta-grados-por-sede.sql.
-- NOTA: matriculas NO se toca en este script -- sigue teniendo una
-- fila por período (mismo patrón "duplicado" que tenía asignaciones).
-- Es una inconsistencia real que vale la pena limpiar más adelante,
-- pero queda fuera del alcance de esta corrección puntual.
-- ============================================================

begin;

-- ----------------------------------------------------------------
-- 1. notas: agrega su propio periodo_id (antes lo heredaba
--    indirectamente de asignaciones.periodo_id, que está por
--    desaparecer). Se rellena ANTES de tocar asignaciones,
--    mientras asignaciones.periodo_id todavía existe.
-- ----------------------------------------------------------------
alter table notas add column periodo_id integer;

update notas n
set periodo_id = a.periodo_id
from asignaciones a
where a.id = n.asignacion_id;

alter table notas
  alter column periodo_id set not null,
  add constraint notas_periodo_id_fkey foreign key (periodo_id)
    references periodos_academicos (id);

create index idx_notas_periodo_id on notas (periodo_id);

-- ----------------------------------------------------------------
-- 2. asignaciones: agrega `anio`, relleno desde el período que
--    tenía cada fila
-- ----------------------------------------------------------------
alter table asignaciones add column anio integer;

update asignaciones a
set anio = p.anio
from periodos_academicos p
where p.id = a.periodo_id;

alter table asignaciones alter column anio set not null;

-- ----------------------------------------------------------------
-- 3. Deduplicar: hoy existen 4 filas idénticas (una por período)
--    para cada combinación profesor+materia+sede+grado+grupo+año.
--    Hay que quedarse con UNA por grupo y redirigir las notas y
--    excepciones que apuntaban a las filas que se van a borrar.
--
--    IMPORTANTE -- orden real, corregido al correr esto por primera
--    vez: la restricción vieja `notas_estudiante_asignacion_unico`
--    (estudiante_id, asignacion_id) tiene que soltarse ANTES de
--    redirigir `notas.asignacion_id` acá abajo. Un mismo estudiante ya
--    tenía hasta 4 notas (una por período) contra 4 asignaciones
--    "duplicadas" distintas; al redirigirlas todas a la misma
--    asignación canónica, la restricción vieja (que no sabe nada de
--    `periodo_id`) las ve como una violación de unicidad y aborta la
--    migración con `duplicate key value violates unique constraint`.
--    La restricción nueva, que sí incluye `periodo_id`, se agrega
--    DESPUÉS del redirect (ver el paso 5 más abajo).
-- ----------------------------------------------------------------
alter table notas drop constraint notas_estudiante_asignacion_unico;

create temporary table mapa_asignaciones_canonicas as
select
  id as id_original,
  first_value(id) over (
    partition by profesor_id, asignatura_id, sede_id, grado, grupo, anio
    order by id
  ) as id_canonico
from asignaciones;

update notas n
set asignacion_id = m.id_canonico
from mapa_asignaciones_canonicas m
where m.id_original = n.asignacion_id
  and m.id_original <> m.id_canonico;

update excepciones_plazo ex
set asignacion_id = m.id_canonico
from mapa_asignaciones_canonicas m
where m.id_original = ex.asignacion_id
  and m.id_original <> m.id_canonico;

delete from asignaciones a
using mapa_asignaciones_canonicas m
where a.id = m.id_original
  and m.id_original <> m.id_canonico;

drop table mapa_asignaciones_canonicas;

-- ----------------------------------------------------------------
-- 4. asignaciones: fuera periodo_id, entra la restricción de
--    unicidad por año (ya no puede haber dos asignaciones iguales
--    en el mismo año, sin importar período)
--
--    IMPORTANTE -- orden real, corregido al correr esto por primera
--    vez: hay que soltar las tres políticas que dependen de
--    `asignaciones.periodo_id` ANTES del `drop column`, no después
--    (mismo problema que ya había dado `07-grado-grupo-malla.sql` con
--    `grado`). Se recrean, ya corregidas, en el paso 6.
-- ----------------------------------------------------------------
drop policy "estudiantes_profesor_ve_los_suyos" on estudiantes;
drop policy "matriculas_profesor_ve_las_suyas" on matriculas;
drop policy "notas_profesor_inserta_dentro_de_plazo" on notas;

alter table asignaciones drop constraint asignaciones_periodo_id_fkey;
alter table asignaciones drop column periodo_id;

alter table asignaciones
  add constraint asignaciones_unicidad_anual
  unique (profesor_id, asignatura_id, sede_id, grado, grupo, anio);

create index idx_asignaciones_anio on asignaciones (anio);

-- ----------------------------------------------------------------
-- 5. notas: agregar la unicidad nueva, que sí incluye periodo_id --
--    la vieja (estudiante_id, asignacion_id) ya se soltó en el paso 3,
--    ANTES del redirect (ver la nota de ahí). Sin este paso, dos notas
--    del mismo estudiante en la misma asignación anual (una por
--    período) no tendrían ninguna restricción de unicidad -- se podría
--    cargar la misma nota dos veces para el mismo período por error.
-- ----------------------------------------------------------------
alter table notas
  add constraint notas_unicidad_por_periodo
  unique (estudiante_id, asignacion_id, periodo_id);

-- ----------------------------------------------------------------
-- 6. Políticas RLS a reescribir: las que comparaban vía
--    a.periodo_id ya no compilan (la columna no existe). De paso
--    se agrega `grupo` a la comparación, que faltaba desde el
--    split de 07-grado-grupo-malla.sql. (El `drop policy` de las tres
--    ya se hizo en el paso 4, antes de borrar la columna.)
-- ----------------------------------------------------------------

create policy "estudiantes_profesor_ve_los_suyos" on estudiantes for select
  to authenticated using (
    exists (
      select 1 from matriculas m
      join asignaciones a on a.sede_id = m.sede_id
                          and a.grado = m.grado
                          and a.grupo = m.grupo
      join periodos_academicos per on per.id = m.periodo_id
                                   and per.anio = a.anio
      where m.estudiante_id = estudiantes.id
        and a.profesor_id = fn_profesor_id_actual()
    )
  );

create policy "matriculas_profesor_ve_las_suyas" on matriculas for select
  to authenticated using (
    exists (
      select 1 from asignaciones a
      join periodos_academicos per on per.id = matriculas.periodo_id
                                   and per.anio = a.anio
      where a.profesor_id = fn_profesor_id_actual()
        and a.sede_id = matriculas.sede_id
        and a.grado = matriculas.grado
        and a.grupo = matriculas.grupo
    )
  );

-- notas_profesor_inserta_dentro_de_plazo: se reescribe completa.
-- Ahora usa notas.periodo_id directamente (ya no existe
-- asignaciones.periodo_id de dónde sacarlo), y la excepción de
-- plazo se valida también contra el período puntual de la nota
-- -- antes bastaba con que la excepción fuera de la misma
-- asignación, porque la asignación YA implicaba un solo período;
-- ahora que una asignación cubre los 4 períodos, hay que ser
-- explícitos en que la excepción aplica al período que se está
-- calificando, no a cualquiera de los 4.
create policy "notas_profesor_inserta_dentro_de_plazo" on notas for insert
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
      where a.id = asignacion_id
        and m.estudiante_id = notas.estudiante_id
        and m.periodo_id = notas.periodo_id
    )
    and (
      exists (
        select 1 from periodos_academicos p
        where p.id = notas.periodo_id
          and p.notas_habilitadas = true
          and now() <= p.fecha_limite_notas
      )
      or exists (
        select 1 from excepciones_plazo ex
        where ex.asignacion_id = notas.asignacion_id
          and ex.profesor_id = fn_profesor_id_actual()
          and ex.periodo_id = notas.periodo_id
          and now() <= ex.fecha_limite_extendida
      )
    )
  );

commit;

-- ============================================================
-- Verificación (opcional, correr aparte)
-- ============================================================
-- -- ya no debe haber duplicados por año:
-- select profesor_id, asignatura_id, sede_id, grado, grupo, anio, count(*)
-- from asignaciones group by 1,2,3,4,5,6 having count(*) > 1;
--
-- -- cada estudiante debe poder tener hasta 4 notas por asignación (una x período):
-- select estudiante_id, asignacion_id, count(*) from notas
-- group by 1,2 order by 3 desc limit 5;
