-- ============================================================
-- 10-vista-boletin-anual.sql
-- Promedio anual por estudiante+materia y si aprueba o no.
-- Se calcula al vuelo (vista, no tabla) sobre las 4 notas del
-- año -- si el admin corrige una nota después, el boletín ya
-- refleja el cambio sin recalcular nada a mano.
--
-- Nota mínima aprobatoria: 3.0 (escala 1.0 a 5.0).
--
-- Corré esto DESPUÉS de 09-asignaciones-por-anio.sql.
-- ============================================================

begin;

create or replace view vista_boletin_anual as
with total_periodos_por_anio as (
  select anio, count(*) as total
  from periodos_academicos
  group by anio
)
select
  n.estudiante_id,
  a.asignatura_id,
  a.anio,
  count(n.id) as periodos_calificados,
  tp.total as periodos_totales,
  round(avg(n.valor), 2) as promedio,
  case
    -- todavía no están las 4 notas del año: no se puede decidir
    -- aprobación en firme, el promedio mostrado es parcial
    when count(n.id) < tp.total then null
    when avg(n.valor) >= 3.0 then true
    else false
  end as aprobado,
  (count(n.id) < tp.total) as es_parcial
from notas n
join asignaciones a on a.id = n.asignacion_id
join total_periodos_por_anio tp on tp.anio = a.anio
group by n.estudiante_id, a.asignatura_id, a.anio, tp.total;

-- No es security definer: al consultarla, un estudiante solo ve
-- sus propias filas (porque notas_estudiante_lee_las_suyas ya
-- filtra `notas` por su fn_estudiante_id_actual()), un profesor
-- solo ve las de sus propias asignaciones, y admin ve todo --
-- exactamente el mismo comportamiento que si consultaran
-- `notas` directamente, la vista no abre ni cierra nada de RLS.

commit;

-- ============================================================
-- Verificación (opcional, correr aparte)
-- ============================================================
-- -- boletín completo de un estudiante para el año en curso:
-- select ast.nombre as asignatura, vb.periodos_calificados,
--        vb.periodos_totales, vb.promedio, vb.aprobado, vb.es_parcial
-- from vista_boletin_anual vb
-- join asignaturas ast on ast.id = vb.asignatura_id
-- where vb.estudiante_id = '<uuid del estudiante>'
--   and vb.anio = 2026
-- order by ast.nombre;
