-- ============================================================
-- 18-datos-prueba-historico.sql
-- DATOS DE PRUEBA, no datos reales de la institución. Solo para
-- desarrollo: NO correr en producción.
--
-- Para qué: hasta 17 solo existía el año 2026, así que el selector
-- de año de "Mi boletín" (estudiante) no tenía nada que elegir. Esto
-- siembra dos años cerrados completos para Andrés Yule:
--
--   2024 -- 6° A, Sede Principal
--   2025 -- 7° A, Sede Principal
--   2026 -- 8° A, Escuela La Laguna (ya existía: se trasladó de sede)
--
-- Sede Principal ya tiene 6-A y 7-A en `oferta_grados`, así que no
-- se toca la oferta de ninguna sede. Los profesores son los de esa
-- sede (Rubiela Ipia, Orlando Yatacué).
--
-- Los ocho períodos nuevos quedan cerrados (`activo = false`,
-- `notas_habilitadas = false`, plazo vencido): ningún profesor puede
-- insertar notas en ellos por la política
-- `notas_profesor_inserta_dentro_de_plazo`.
--
-- Casos que deja probar:
--   · 2024: SEK YAK (Matemáticas) termina en Bajo -> reprobado (✕).
--   · 2025: todo aprobado, con un nudo en Superior.
--   · Los dos años con las 4 épocas completas -> nota definitiva,
--     no "En progreso" (a diferencia de 2026).
--
-- Corré esto DESPUÉS de 17-datos-prueba-nudos.sql, como `postgres`.
-- Idempotente.
-- ============================================================

begin;

-- Períodos 2024 y 2025, cerrados.
insert into periodos_academicos
  (nombre, anio, numero, fecha_inicio, fecha_fin, fecha_limite_notas, notas_habilitadas, activo)
select d.nombre, d.anio, d.numero, d.inicio, d.fin, d.limite, false, false
from (values
  ('2024-1', 2024, 1, date '2024-02-05', date '2024-04-05', timestamptz '2024-04-15'),
  ('2024-2', 2024, 2, date '2024-04-22', date '2024-06-21', timestamptz '2024-07-01'),
  ('2024-3', 2024, 3, date '2024-07-15', date '2024-09-27', timestamptz '2024-10-07'),
  ('2024-4', 2024, 4, date '2024-10-07', date '2024-12-06', timestamptz '2024-12-13'),
  ('2025-1', 2025, 1, date '2025-02-03', date '2025-04-04', timestamptz '2025-04-14'),
  ('2025-2', 2025, 2, date '2025-04-21', date '2025-06-20', timestamptz '2025-06-30'),
  ('2025-3', 2025, 3, date '2025-07-14', date '2025-09-26', timestamptz '2025-10-06'),
  ('2025-4', 2025, 4, date '2025-10-06', date '2025-12-05', timestamptz '2025-12-12')
) as d(nombre, anio, numero, inicio, fin, limite)
where not exists (select 1 from periodos_academicos p where p.nombre = d.nombre);

-- Asignaciones de 6-A (2024) y 7-A (2025) en Sede Principal. Todas
-- las materias están en la malla de 6° y 7°.
insert into asignaciones (profesor_id, asignatura_id, sede_id, grado, grupo, anio)
select p.id, ast.id, 1, d.grado, 'A', d.anio
from (values
  (2024, 6, 'rubiela.ipia@sedeprincipal.edu.co',    'MAT'),
  (2024, 6, 'orlando.yatacue@sedeprincipal.edu.co', 'ESP'),
  (2024, 6, 'rubiela.ipia@sedeprincipal.edu.co',    'CNA'),
  (2024, 6, 'orlando.yatacue@sedeprincipal.edu.co', 'EFI'),
  (2024, 6, 'rubiela.ipia@sedeprincipal.edu.co',    'ART'),
  (2024, 6, 'orlando.yatacue@sedeprincipal.edu.co', 'GEO'),
  (2024, 6, 'orlando.yatacue@sedeprincipal.edu.co', 'HIS'),
  (2024, 6, 'rubiela.ipia@sedeprincipal.edu.co',    'ING'),
  (2025, 7, 'rubiela.ipia@sedeprincipal.edu.co',    'MAT'),
  (2025, 7, 'orlando.yatacue@sedeprincipal.edu.co', 'ESP'),
  (2025, 7, 'rubiela.ipia@sedeprincipal.edu.co',    'CNA'),
  (2025, 7, 'orlando.yatacue@sedeprincipal.edu.co', 'EFI'),
  (2025, 7, 'rubiela.ipia@sedeprincipal.edu.co',    'ART'),
  (2025, 7, 'orlando.yatacue@sedeprincipal.edu.co', 'GEO'),
  (2025, 7, 'orlando.yatacue@sedeprincipal.edu.co', 'HIS'),
  (2025, 7, 'rubiela.ipia@sedeprincipal.edu.co',    'ING')
) as d(anio, grado, email, codigo)
join usuarios u      on u.email = d.email
join profesores p    on p.usuario_id = u.id
join asignaturas ast on ast.codigo = d.codigo
on conflict (profesor_id, asignatura_id, sede_id, grado, grupo, anio) do nothing;

-- Matrícula de Andrés en cada período de 2024 (6-A) y 2025 (7-A).
insert into matriculas (estudiante_id, sede_id, periodo_id, grado, grupo)
select e.id, 1, per.id, case per.anio when 2024 then 6 else 7 end, 'A'
from usuarios u
join estudiantes e on e.usuario_id = u.id
join periodos_academicos per on per.anio in (2024, 2025)
where u.email = 'andres.yule@sedeprincipal.edu.co'
  and not exists (select 1 from matriculas m
                  where m.estudiante_id = e.id and m.periodo_id = per.id);

-- Notas de las cuatro épocas, registradas por el profesor de cada
-- asignación.
insert into notas (estudiante_id, asignacion_id, periodo_id, valor, registrado_por)
select e.id, a.id, per.id, n.valor, p.usuario_id
from (values
  (2024, 'MAT', 2.4, 2.8, 2.6, 3.0),
  (2024, 'ESP', 3.6, 3.9, 4.0, 3.8),
  (2024, 'CNA', 3.2, 3.5, 3.4, 3.7),
  (2024, 'EFI', 4.3, 4.5, 4.2, 4.6),
  (2024, 'ART', 4.0, 3.8, 4.1, 4.2),
  (2024, 'GEO', 3.3, 3.0, 3.5, 3.4),
  (2024, 'HIS', 3.1, 3.4, 3.2, 3.6),
  (2024, 'ING', 3.0, 3.2, 3.3, 3.1),
  (2025, 'MAT', 3.2, 3.5, 3.6, 3.8),
  (2025, 'ESP', 4.1, 4.0, 4.3, 4.4),
  (2025, 'CNA', 3.8, 4.0, 3.9, 4.2),
  (2025, 'EFI', 4.8, 4.7, 4.9, 4.8),
  (2025, 'ART', 4.6, 4.8, 4.7, 4.9),
  (2025, 'GEO', 3.7, 3.9, 4.0, 3.8),
  (2025, 'HIS', 3.9, 3.6, 4.1, 4.0),
  (2025, 'ING', 3.4, 3.6, 3.5, 3.9)
) as d(anio, codigo, n1, n2, n3, n4)
cross join lateral (values (1, d.n1), (2, d.n2), (3, d.n3), (4, d.n4)) as n(numero, valor)
join usuarios u      on u.email = 'andres.yule@sedeprincipal.edu.co'
join estudiantes e   on e.usuario_id = u.id
join asignaturas ast on ast.codigo = d.codigo
join asignaciones a  on a.asignatura_id = ast.id and a.sede_id = 1
                    and a.grado = case d.anio when 2024 then 6 else 7 end
                    and a.grupo = 'A' and a.anio = d.anio
join profesores p    on p.id = a.profesor_id
join periodos_academicos per on per.anio = d.anio and per.numero = n.numero
on conflict (estudiante_id, asignacion_id, periodo_id) do nothing;

commit;
