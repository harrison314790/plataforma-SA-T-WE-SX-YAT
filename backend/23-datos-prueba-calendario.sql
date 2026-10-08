-- ============================================================
-- 23-datos-prueba-calendario.sql  --  SOLO DESARROLLO
--
-- Desde 22-epocas-por-fecha.sql la época activa sale de las fechas. Las
-- de 2026 que sembró 03-datos-prueba.sql dejaban un hueco a principios
-- de octubre (2026-3 cerraba el 30 sep y 2026-4 abría el 10 oct): en
-- desarrollo, "hoy" caía en receso y nadie podía probar la carga.
--
-- Se ponen las fechas del mockup aprobado ("Notas - Módulo.html"), con
-- la Tercera Época cubriendo octubre-noviembre. NO correr en producción:
-- allá las escribe coordinación desde "Editar fechas".
-- ============================================================

begin;

update periodos_academicos p
   set fecha_inicio = d.ini::date,
       fecha_fin    = d.fin::date
  from (values
    ('2026-1', '2026-02-02', '2026-04-17'),
    ('2026-2', '2026-04-27', '2026-06-26'),
    ('2026-3', '2026-09-07', '2026-11-27'),
    ('2026-4', '2026-11-30', '2026-12-11')
  ) as d(nombre, ini, fin)
 where p.nombre = d.nombre;

commit;

-- select nombre, fecha_inicio, fecha_fin from periodos_academicos where anio = 2026 order by numero;
-- select fn_periodo_activo_id();   -- el id de 2026-3 mientras hoy esté entre 7 sep y 27 nov
