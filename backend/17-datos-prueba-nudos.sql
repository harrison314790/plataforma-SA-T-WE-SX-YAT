-- ============================================================
-- 17-datos-prueba-nudos.sql
-- DATOS DE PRUEBA, no datos reales de la institución. Solo para
-- desarrollo: NO correr en producción.
--
-- Para qué: con lo sembrado hasta 15, ningún grado tenía DOS
-- materias del mismo nudo, así que la pantalla de Porcentajes por
-- grado no tenía nada que configurar y el boletín no mostraba
-- ningún promedio de nudo de verdad. Casos elegidos:
--
--   6-A (Sede Principal) -- secundaria, se configura con porcentajes
--   · EW NẼESNXI: Educación Física y Ética (Orlando Yatacué, profesor
--     nuevo) + Artística (Rubiela Ipia) -> un nudo con TRES materias
--     de DOS profesores distintos.
--   · SEK YAK: Matemáticas (Rubiela, ya existía) + Estadística
--     (Orlando).
--   · Sandra Pito NO tiene nota de Ética en 2026-3 -> el boletín
--     tiene que marcar el nudo como incompleto, sin hundirle la nota.
--
--   1-UNICO (Escuela Guaitalá) -- primaria, siempre promedio simple
--   · Nelly Quiguanás con nota en Matemáticas y Ciencias Naturales.
--
-- Los porcentajes NO se siembran: configurarlos es justo lo que hay
-- que probar desde la pantalla, como admin.
--
-- Corré esto DESPUÉS de 16-pesos-nudo-por-grado.sql. Idempotente.
-- ============================================================

begin;

-- Un segundo profesor en Sede Principal. Misma contraseña de prueba
-- que el resto (Prueba123!): se copia el hash de Rubiela.
insert into usuarios (email, password_hash, rol_id, sede_id, nombres, apellidos, documento)
select 'orlando.yatacue@sedeprincipal.edu.co', u.password_hash,
       (select id from roles where nombre = 'profesor'), 1,
       'Orlando', 'Yatacué', '10000015'
from usuarios u
where u.email = 'rubiela.ipia@sedeprincipal.edu.co'
on conflict (email) do nothing;

insert into profesores (usuario_id)
select id from usuarios where email = 'orlando.yatacue@sedeprincipal.edu.co'
on conflict (usuario_id) do nothing;

-- Asignaciones nuevas de 6-A, 2026.
insert into asignaciones (profesor_id, asignatura_id, sede_id, grado, grupo, anio)
select p.id, ast.id, 1, 6, 'A', 2026
from (values
  ('orlando.yatacue@sedeprincipal.edu.co', 'EFI'),
  ('orlando.yatacue@sedeprincipal.edu.co', 'ETI'),
  ('orlando.yatacue@sedeprincipal.edu.co', 'EST'),
  ('rubiela.ipia@sedeprincipal.edu.co',    'ART')
) as d(email, codigo)
join usuarios u    on u.email = d.email
join profesores p  on p.usuario_id = u.id
join asignaturas ast on ast.codigo = d.codigo
on conflict do nothing;

-- Notas del período 2026-3.
insert into notas (estudiante_id, asignacion_id, periodo_id, valor, registrado_por)
select e.id, a.id, per.id, d.valor, prof_u.id
from (values
  ('esteban.dagua@sedeprincipal.edu.co', 6, 'A',     'EFI', 3.5),
  ('esteban.dagua@sedeprincipal.edu.co', 6, 'A',     'ART', 2.8),
  ('esteban.dagua@sedeprincipal.edu.co', 6, 'A',     'ETI', 3.0),
  ('esteban.dagua@sedeprincipal.edu.co', 6, 'A',     'EST', 2.5),
  ('sandra.pito@sedeprincipal.edu.co',   6, 'A',     'EFI', 4.5),
  ('sandra.pito@sedeprincipal.edu.co',   6, 'A',     'ART', 4.0),
  -- sin ETI a propósito
  ('sandra.pito@sedeprincipal.edu.co',   6, 'A',     'EST', 3.8),
  ('nelly.quiguanas@sedeprincipal.edu.co', 1, 'UNICO', 'MAT', 4.0),
  ('nelly.quiguanas@sedeprincipal.edu.co', 1, 'UNICO', 'CNA', 3.5)
) as d(email, grado, grupo, codigo, valor)
join usuarios est_u  on est_u.email = d.email
join estudiantes e   on e.usuario_id = est_u.id
join asignaturas ast on ast.codigo = d.codigo
join asignaciones a  on a.asignatura_id = ast.id and a.grado = d.grado
                    and a.grupo = d.grupo and a.anio = 2026
join profesores p    on p.id = a.profesor_id
join usuarios prof_u on prof_u.id = p.usuario_id
join periodos_academicos per on per.nombre = '2026-3'
on conflict (estudiante_id, asignacion_id, periodo_id) do nothing;

-- ----------------------------------------------------------------
-- Carga completa de 6-A (las 16 materias de secundaria del boletín
-- de 6°) y tres materias en 6-B: así la pantalla de Porcentajes
-- muestra que A y B comparten UNA configuración, y Nudos muestra
-- profesores y cursos reales por materia.
-- ----------------------------------------------------------------
insert into asignaciones (profesor_id, asignatura_id, sede_id, grado, grupo, anio)
select p.id, ast.id, 1, 6, d.grupo, 2026
from (values
  ('A', 'orlando.yatacue@sedeprincipal.edu.co', 'GEO'),
  ('A', 'orlando.yatacue@sedeprincipal.edu.co', 'HIS'),
  ('A', 'orlando.yatacue@sedeprincipal.edu.co', 'DEM'),
  ('A', 'rubiela.ipia@sedeprincipal.edu.co',    'ING'),
  ('A', 'rubiela.ipia@sedeprincipal.edu.co',    'KWE'),
  ('A', 'orlando.yatacue@sedeprincipal.edu.co', 'TEC'),
  ('A', 'rubiela.ipia@sedeprincipal.edu.co',    'ARI'),
  ('A', 'orlando.yatacue@sedeprincipal.edu.co', 'PAG'),
  ('A', 'orlando.yatacue@sedeprincipal.edu.co', 'PPE'),
  ('A', 'rubiela.ipia@sedeprincipal.edu.co',    'BIO'),
  ('A', 'rubiela.ipia@sedeprincipal.edu.co',    'TUL'),
  ('B', 'rubiela.ipia@sedeprincipal.edu.co',    'EFI'),
  ('B', 'orlando.yatacue@sedeprincipal.edu.co', 'ART'),
  ('B', 'orlando.yatacue@sedeprincipal.edu.co', 'ETI')
) as d(grupo, email, codigo)
join usuarios u    on u.email = d.email
join profesores p  on p.usuario_id = u.id
join asignaturas ast on ast.codigo = d.codigo
where exists (select 1 from oferta_grados o where o.sede_id = 1 and o.grado = 6 and o.grupo = d.grupo)
on conflict do nothing;

insert into notas (estudiante_id, asignacion_id, periodo_id, valor, registrado_por)
select e.id, a.id, per.id, d.valor, prof_u.id
from (values
  ('esteban.dagua@sedeprincipal.edu.co', 'GEO', 3.1), ('esteban.dagua@sedeprincipal.edu.co', 'HIS', 3.4),
  ('esteban.dagua@sedeprincipal.edu.co', 'DEM', 3.0), ('esteban.dagua@sedeprincipal.edu.co', 'ING', 2.6),
  ('esteban.dagua@sedeprincipal.edu.co', 'KWE', 3.8), ('esteban.dagua@sedeprincipal.edu.co', 'TEC', 3.2),
  ('esteban.dagua@sedeprincipal.edu.co', 'ARI', 2.2), ('esteban.dagua@sedeprincipal.edu.co', 'PAG', 3.9),
  ('esteban.dagua@sedeprincipal.edu.co', 'PPE', 3.7), ('esteban.dagua@sedeprincipal.edu.co', 'BIO', 3.5),
  ('esteban.dagua@sedeprincipal.edu.co', 'TUL', 4.0), ('esteban.dagua@sedeprincipal.edu.co', 'ESP', 3.3),
  ('sandra.pito@sedeprincipal.edu.co', 'GEO', 4.4), ('sandra.pito@sedeprincipal.edu.co', 'HIS', 4.1),
  ('sandra.pito@sedeprincipal.edu.co', 'DEM', 4.6), ('sandra.pito@sedeprincipal.edu.co', 'ING', 3.9),
  ('sandra.pito@sedeprincipal.edu.co', 'KWE', 4.8), ('sandra.pito@sedeprincipal.edu.co', 'TEC', 4.2),
  ('sandra.pito@sedeprincipal.edu.co', 'ARI', 4.0), ('sandra.pito@sedeprincipal.edu.co', 'PAG', 4.7),
  ('sandra.pito@sedeprincipal.edu.co', 'PPE', 4.5), ('sandra.pito@sedeprincipal.edu.co', 'BIO', 4.3),
  ('sandra.pito@sedeprincipal.edu.co', 'TUL', 4.9), ('sandra.pito@sedeprincipal.edu.co', 'ESP', 4.0)
) as d(email, codigo, valor)
join usuarios est_u  on est_u.email = d.email
join estudiantes e   on e.usuario_id = est_u.id
join asignaturas ast on ast.codigo = d.codigo
join asignaciones a  on a.asignatura_id = ast.id and a.grado = 6 and a.grupo = 'A' and a.anio = 2026
join profesores p    on p.id = a.profesor_id
join usuarios prof_u on prof_u.id = p.usuario_id
join periodos_academicos per on per.nombre = '2026-3'
on conflict (estudiante_id, asignacion_id, periodo_id) do nothing;

-- Una materia SIN asignaciones, para probar "Eliminar materia" en
-- Nudos pedagógicos: todas las demás se dictan en algún curso y su
-- papelera sale apagada. Sin malla, a propósito.
insert into asignaturas (nombre, codigo, nudo_pedagogico_id)
select 'Danza Tradicional', 'DAN', n.id
from nudos_pedagogicos n
where n.orden = 10
on conflict (codigo) do nothing;

commit;
