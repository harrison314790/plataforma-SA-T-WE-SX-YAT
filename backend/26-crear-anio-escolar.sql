-- ============================================================
-- 26-crear-anio-escolar.sql
-- Crea las 4 épocas de un año escolar nuevo, con fechas TENTATIVAS.
--
-- Todavía no hay pantalla para crear un año: el calendario de épocas
-- ("Editar fechas" en Seguimiento de notas) solo edita épocas que ya
-- existen. Cada enero, antes de empezar, se corre esto una vez y después
-- coordinación pone las fechas reales desde la pantalla.
--
-- Uso:
--   psql -U postgres -d sistema_academico -v anio=2027 -f 26-crear-anio-escolar.sql
--
-- Idempotente: si las épocas de ese año ya existen, no hace nada.
-- La carga de notas nace CERRADA (notas_habilitadas = false): coordinación
-- la abre con el interruptor cuando esté lista.
-- ============================================================

\set ON_ERROR_STOP on

begin;

insert into periodos_academicos
  (nombre, anio, numero, fecha_inicio, fecha_fin, fecha_limite_notas, notas_habilitadas)
select
  :anio || '-' || e.numero,
  :anio,
  e.numero,
  make_date(:anio, e.mes_ini, e.dia_ini),
  make_date(:anio, e.mes_fin, e.dia_fin),
  (make_date(:anio, e.mes_fin, e.dia_fin) + time '18:00') at time zone 'America/Bogota',
  false
from (values
  (1, 2,  2, 4, 17),   -- Primera: 2 feb – 17 abr
  (2, 4, 27, 6, 26),   -- Segunda: 27 abr – 26 jun
  (3, 7, 13, 9, 25),   -- Tercera: 13 jul – 25 sep
  (4, 10, 5, 11, 27)   -- Cuarta:  5 oct – 27 nov
) as e(numero, mes_ini, dia_ini, mes_fin, dia_fin)
where not exists (select 1 from periodos_academicos p where p.anio = :anio);

commit;

select nombre, fecha_inicio, fecha_fin, notas_habilitadas
from periodos_academicos where anio = :anio order by numero;
