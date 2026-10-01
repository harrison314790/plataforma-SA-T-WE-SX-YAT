-- ============================================================
-- 13-datos-prueba-multisede.sql
-- DATOS DE PRUEBA, no datos reales de la institución.
--
-- Hasta acá, `03-datos-prueba.sql` sembró TODO en Escuela La
-- Laguna: los dos profesores, los cinco estudiantes y las cuatro
-- asignaciones. Sede Principal y Escuela Guaitalá existían como
-- filas en `sedes` y nada más -- así que no había forma de probar
-- nada que dependiera de tener varias sedes con datos: el filtro
-- por sede siempre devolvía lo mismo, y todas las combinaciones de
-- `oferta_grados` estaban en uso, con lo cual el botón "Eliminar"
-- de la pantalla de grados y grupos no se podía ver nunca.
--
-- Este archivo llena ese hueco con casos ELEGIDOS, no con datos al
-- azar. La matriz de abajo es el punto del archivo: cada
-- combinación existe para que un camino distinto de la interfaz se
-- pueda ver de verdad.
--
--   SEDE PRINCIPAL (1)
--   · 6-A   asignación + matrículas + NOTAS  -> no se puede eliminar
--           ni la asignación ni el grado; solo desactivar
--   · 7-A   asignación SIN notas             -> la asignación SÍ se
--           puede eliminar; el grado no (queda en uso)
--   · 6-B   sin ningún uso                   -> el grado SE ELIMINA
--   · 11-A  sin ningún uso                   -> el grado SE ELIMINA
--           (este es el caso "lo escribí mal y lo quiero borrar")
--
--   ESCUELA GUAITALÁ (3) -- escuela pequeña, un aula por grado
--   · 1-UNICO  asignación + matrícula, sin notas -> desactivar
--   · 2-UNICO  sin uso                           -> se elimina
--   · 3-UNICO  sin uso                           -> se elimina
--
-- SOBRE EL GRUPO 'UNICO', QUE ES UNA PREGUNTA REAL DEL PROYECTO:
-- `08-oferta-grados-por-sede.sql` dejó `grupo` como `not null`
-- porque una llave foránea compuesta con un NULL adentro
-- simplemente no se valida en Postgres -- el control se anularía.
-- La consecuencia es que un colegio sin grupos reales (todo el
-- grado en una sola aula, que es el caso de las escuelas de
-- vereda) igual necesita escribir algo ahí. La convención es
-- 'UNICO': MAYÚSCULA y SIN TILDE.
--
--   · Mayúscula, porque Postgres distingue 'a' de 'A' y la unicidad
--     es (sede_id, grado, grupo): sin normalizar, la misma aula se
--     podría dar de alta dos veces y media institución quedaría
--     matriculada en '9-A' y la otra media en '9-a', sin que
--     ninguna consulta las junte.
--   · Sin tilde, por lo mismo pero peor: 'ÚNICO' y 'UNICO' son dos
--     cadenas distintas, y la diferencia entre ellas es invisible
--     en una tabla. Quien escriba el acento y quien no, crearían
--     dos aulas sin darse cuenta.
--
-- Las dos reglas las aplica el backend solo, en
-- CrearOfertaGradoRequest -- este archivo sigue la misma
-- convención para no sembrar datos que la aplicación no habría
-- podido crear.
--
-- Corré esto DESPUÉS de 12-gestion-oferta-grados.sql.
-- Es idempotente: se puede correr dos veces sin duplicar nada.
-- ============================================================

begin;

-- ----------------------------------------------------------------
-- 1. Dos profesores, uno por sede que estaba vacía
--
-- El `password_hash` se COPIA de un usuario que ya existe en vez de
-- escribirlo literal, y no es pereza: tiene que ser un hash que
-- `Hash::check()` de Laravel acepte (prefijo `$2y$`). Generarlo acá
-- con `crypt()` de pgcrypto produce `$2a$`, que PHP no reconoce como
-- bcrypt -- es el bug que documenta references/laravel-postgres.md y
-- que ya costó una sesión de depuración. Copiando el de Marta, la
-- contraseña de estos dos es la misma del resto de la semilla:
-- Prueba123!
-- ----------------------------------------------------------------
insert into usuarios (email, password_hash, rol_id, sede_id, nombres, apellidos, documento)
select datos.email,
       (select password_hash from usuarios where email = 'marta.rios@sedeprincipal.edu.co'),
       (select id from roles where nombre = 'profesor'),
       datos.sede_id, datos.nombres, datos.apellidos, datos.documento
from (values
  ('rubiela.ipia@sedeprincipal.edu.co',  1, 'Rubiela', 'Ipia',  '10000010'),
  ('aldemar.ulcue@sedeprincipal.edu.co', 3, 'Aldemar', 'Ulcué', '10000011')
) as datos(email, sede_id, nombres, apellidos, documento)
on conflict (email) do nothing;

insert into profesores (usuario_id, activo)
select u.id, true
from usuarios u
where u.email in ('rubiela.ipia@sedeprincipal.edu.co', 'aldemar.ulcue@sedeprincipal.edu.co')
  and not exists (select 1 from profesores p where p.usuario_id = u.id);

-- ----------------------------------------------------------------
-- 2. Dos estudiantes en Sede Principal
--
-- Hacen falta para el caso más importante de la matriz: un grado con
-- MATRÍCULAS Y NOTAS, que es el único que bloquea todo. Sin
-- estudiantes fuera de La Laguna, ese caso solo se podía ver en una
-- sede.
-- ----------------------------------------------------------------
insert into usuarios (email, password_hash, rol_id, sede_id, nombres, apellidos, documento)
select datos.email,
       (select password_hash from usuarios where email = 'marta.rios@sedeprincipal.edu.co'),
       (select id from roles where nombre = 'estudiante'),
       datos.sede_id, datos.nombres, datos.apellidos, datos.documento
from (values
  ('sandra.pito@sedeprincipal.edu.co',  1, 'Sandra',  'Pito',   '10000012'),
  ('esteban.dagua@sedeprincipal.edu.co', 1, 'Esteban', 'Dagua', '10000013'),
  ('nelly.quiguanas@sedeprincipal.edu.co', 3, 'Nelly', 'Quiguanás', '10000014')
) as datos(email, sede_id, nombres, apellidos, documento)
on conflict (email) do nothing;

insert into estudiantes (usuario_id, activo)
select u.id, true
from usuarios u
where u.email in (
    'sandra.pito@sedeprincipal.edu.co',
    'esteban.dagua@sedeprincipal.edu.co',
    'nelly.quiguanas@sedeprincipal.edu.co'
  )
  and not exists (select 1 from estudiantes e where e.usuario_id = u.id);

-- ----------------------------------------------------------------
-- 3. La oferta de grados de las dos sedes
--
-- Va PRIMERO que las asignaciones y matrículas, obligatoriamente: la
-- llave foránea compuesta (sede_id, grado, grupo) de 08 las rechaza
-- si la combinación no está dada de alta antes.
--
-- Las cuatro filas sin uso (6-B, 11-A, 2-UNICO, 3-UNICO) están acá a
-- propósito: son las que permiten ver el botón "Eliminar" de verdad,
-- que hasta hoy no aparecía nunca porque las tres combinaciones de
-- La Laguna están todas en uso.
-- ----------------------------------------------------------------
insert into oferta_grados (sede_id, grado, grupo) values
  (1,  6, 'A'),
  (1,  6, 'B'),
  (1,  7, 'A'),
  (1, 11, 'A'),
  (3,  1, 'UNICO'),
  (3,  2, 'UNICO'),
  (3,  3, 'UNICO')
on conflict (sede_id, grado, grupo) do nothing;

-- ----------------------------------------------------------------
-- 4. Malla curricular de los grados nuevos
--
-- Sin esto, el formulario de asignaciones no ofrece NINGUNA materia
-- para estos grados y no se puede crear nada -- el mismo hueco que
-- 11-asignaciones-modulo.sql tuvo que reparar para los grados de La
-- Laguna.
--
-- Se siembran las tres asignaturas que existen en la semilla para
-- cada grado nuevo. NO es la malla real de la institución (esa la
-- carga el colegio desde su propia pantalla, que todavía no
-- existe): es el mínimo para que estos datos de prueba sean
-- coherentes y la pantalla se pueda usar.
-- ----------------------------------------------------------------
insert into malla_curricular (grado, asignatura_id)
select g.grado, a.id
from (values (1), (2), (3), (6), (7), (11)) as g(grado)
cross join asignaturas a
on conflict (grado, asignatura_id) do nothing;

-- ----------------------------------------------------------------
-- 5. Asignaciones de las dos sedes
--
-- `creado_por` queda en NULL como el resto de la semilla: estas
-- filas no las creó nadie desde la aplicación, y ponerle un autor
-- inventado a un dato histórico es peor que admitir que no se sabe
-- (ver el comentario de la columna en 11-asignaciones-modulo.sql).
-- ----------------------------------------------------------------
insert into asignaciones (profesor_id, asignatura_id, sede_id, grado, grupo, anio)
select p.id, datos.asignatura_id, datos.sede_id, datos.grado, datos.grupo, 2026
from (values
  -- Sede Principal, Rubiela Ipia
  ('rubiela.ipia@sedeprincipal.edu.co',  1, 1, 6, 'A'),      -- 6-A Matemáticas (va a tener notas)
  ('rubiela.ipia@sedeprincipal.edu.co',  2, 1, 6, 'A'),      -- 6-A Español
  ('rubiela.ipia@sedeprincipal.edu.co',  1, 1, 7, 'A'),      -- 7-A Matemáticas (sin notas: se puede eliminar)
  -- Escuela Guaitalá, Aldemar Ulcué
  ('aldemar.ulcue@sedeprincipal.edu.co', 1, 3, 1, 'UNICO'),  -- 1-UNICO Matemáticas
  ('aldemar.ulcue@sedeprincipal.edu.co', 3, 3, 1, 'UNICO')   -- 1-UNICO Ciencias Naturales
) as datos(email, asignatura_id, sede_id, grado, grupo)
join usuarios u on u.email = datos.email
join profesores p on p.usuario_id = u.id
on conflict (profesor_id, asignatura_id, sede_id, grado, grupo, anio) do nothing;

-- ----------------------------------------------------------------
-- 6. Matrículas del período activo (2026-3)
--
-- `matriculas` sigue teniendo una fila por período (no se tocó en
-- 09-asignaciones-por-anio.sql), así que se siembra solo el período
-- activo: alcanza para que la pantalla muestre el caso y no infla la
-- semilla con cuatro copias de lo mismo.
-- ----------------------------------------------------------------
insert into matriculas (estudiante_id, sede_id, grado, grupo, periodo_id, estado)
select e.id, datos.sede_id, datos.grado, datos.grupo,
       (select id from periodos_academicos where activo = true order by anio desc, numero desc limit 1),
       'activa'
from (values
  ('sandra.pito@sedeprincipal.edu.co',     1, 6, 'A'),
  ('esteban.dagua@sedeprincipal.edu.co',   1, 6, 'A'),
  ('nelly.quiguanas@sedeprincipal.edu.co', 3, 1, 'UNICO')
) as datos(email, sede_id, grado, grupo)
join usuarios u on u.email = datos.email
join estudiantes e on e.usuario_id = u.id
where not exists (
  select 1 from matriculas m
  where m.estudiante_id = e.id
    and m.periodo_id = (select id from periodos_academicos where activo = true order by anio desc, numero desc limit 1)
);

-- ----------------------------------------------------------------
-- 7. Notas SOLO en 6-A Matemáticas de Sede Principal
--
-- Es lo que hace de 6-A el caso "no se puede eliminar nada": la
-- asignación tiene notas (el DELETE lo bloquea la FK de `notas`) y
-- el grado tiene asignaciones y matrículas (el DELETE lo bloquea la
-- FK compuesta de `oferta_grados`). 7-A queda deliberadamente sin
-- notas para poder comparar: ahí la asignación SÍ se borra.
--
-- `registrado_por` es la profesora, que es quien las habría
-- registrado de verdad.
-- ----------------------------------------------------------------
insert into notas (estudiante_id, asignacion_id, periodo_id, valor, registrado_por)
select e.id, a.id,
       (select id from periodos_academicos where activo = true order by anio desc, numero desc limit 1),
       datos.valor, u_prof.id
from (values
  ('sandra.pito@sedeprincipal.edu.co',   4.2),
  ('esteban.dagua@sedeprincipal.edu.co', 3.1)
) as datos(email, valor)
join usuarios u on u.email = datos.email
join estudiantes e on e.usuario_id = u.id
join usuarios u_prof on u_prof.email = 'rubiela.ipia@sedeprincipal.edu.co'
join profesores p on p.usuario_id = u_prof.id
join asignaciones a on a.profesor_id = p.id
                   and a.sede_id = 1 and a.grado = 6 and a.grupo = 'A'
                   and a.asignatura_id = 1 and a.anio = 2026
on conflict (estudiante_id, asignacion_id, periodo_id) do nothing;

commit;

-- ============================================================
-- Verificación (opcional, correr aparte)
-- ============================================================
-- -- La matriz completa: qué se puede eliminar y qué solo desactivar.
-- select s.nombre as sede, og.grado, og.grupo, og.activo,
--   (select count(*) from asignaciones a
--     where a.sede_id=og.sede_id and a.grado=og.grado and a.grupo=og.grupo) as asignaciones,
--   (select count(*) from matriculas m
--     where m.sede_id=og.sede_id and m.grado=og.grado and m.grupo=og.grupo) as matriculas,
--   (select count(*) from notas n join asignaciones a2 on a2.id=n.asignacion_id
--     where a2.sede_id=og.sede_id and a2.grado=og.grado and a2.grupo=og.grupo) as notas
-- from oferta_grados og join sedes s on s.id=og.sede_id
-- order by s.nombre, og.grado, og.grupo;
--
-- -- Los dos profesores nuevos entran con Prueba123!, igual que el resto:
-- --   rubiela.ipia@sedeprincipal.edu.co   (Sede Principal)
-- --   aldemar.ulcue@sedeprincipal.edu.co  (Escuela Guaitalá)
