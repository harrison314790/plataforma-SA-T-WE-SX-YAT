-- ═══════════════════════════════════════════════════════════
-- Sistema Académico — Datos de prueba (Postgres puro)
-- Correr DESPUÉS de 01-esquema-inicial.sql, 02-politicas-rls.sql
-- y 04-login-function.sql.
--
-- Corré esto conectado como el superusuario 'postgres' — salta
-- RLS, así que puede insertar directo sin pelear con políticas.
--
-- Contraseña de prueba para TODOS: Prueba123!
--
-- Novedades de esta versión:
--  - roles, sedes, asignaturas, periodos_academicos y recursos
--    ya no llevan id explícito: se generan solos (1, 2, 3...).
--  - Se agrega un usuario con rol 'admin' (antes solo existía
--    super_admin, faltaba probar el rol operativo).
--  - Ahora hay estudiantes y asignaciones en TRES grados
--    distintos (9-B, 8-A, 10-A), no solo uno, para probar que
--    el filtrado por grado funciona de verdad.
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. ROLES — sin id explícito, se autoasignan 1, 2, 3, 4
-- ─────────────────────────────────────────────
insert into roles (nombre) values
  ('super_admin'), ('admin'), ('profesor'), ('estudiante')
on conflict (nombre) do nothing;

-- ─────────────────────────────────────────────
-- 2. SEDES — principal + dos veredas, jerárquicas.
-- Sede Principal se inserta primero para poder referenciar su
-- id (ya no es un UUID fijo, es el entero que le tocó al nacer).
-- ─────────────────────────────────────────────
insert into sedes (nombre, tipo, vereda, sede_padre_id) values
  ('Sede Principal', 'principal', null, null);

insert into sedes (nombre, tipo, vereda, sede_padre_id)
select 'Escuela La Laguna', 'vereda', 'La Laguna', id from sedes where nombre = 'Sede Principal'
union all
select 'Escuela Guaitalá', 'vereda', 'Guaitalá', id from sedes where nombre = 'Sede Principal';

-- ─────────────────────────────────────────────
-- 3. USUARIOS — incluye el admin operativo que faltaba (Yolanda)
-- y dos estudiantes nuevos en grados distintos a 9-B.
-- ─────────────────────────────────────────────
-- El hash de abajo es 'Prueba123!' generado con el Hash::make() de
-- Laravel (bcrypt, prefijo $2y$), no con crypt()/gen_salt('bf') de
-- Postgres (prefijo $2a$). Se probó en carne propia: Hash::check()
-- de Laravel rechaza los hashes $2a$ de pgcrypto con el error
-- "This password does not use the Bcrypt algorithm" -- password_get_info()
-- de PHP no los reconoce como bcrypt aunque sean el mismo algoritmo.
-- Como el login lo valida Laravel (nunca SQL crudo), el hash tiene
-- que nacer con Hash::make(), no con crypt().
insert into usuarios (rol_id, sede_id, nombres, apellidos, documento, email, password_hash)
select (select id from roles where nombre = datos.rol),
       (select id from sedes where nombre = datos.sede),
       datos.nombres, datos.apellidos, datos.documento, datos.email,
       '$2y$12$UllOR/GlGRT9MaFtTC7m2O8c2TsRFirjOGNJOdHShdQalyouEYF0W'
from (values
  ('super_admin','Sede Principal',    'Harrison', 'Medina',   '10000001', 'admin@sedeprincipal.edu.co'),
  ('admin',      'Sede Principal',    'Yolanda',  'Guasaquillo','10000007', 'secretaria@sedeprincipal.edu.co'),
  ('profesor',   'Escuela La Laguna', 'Marta',    'Ríos',     '10000002', 'marta.rios@sedeprincipal.edu.co'),
  ('profesor',   'Escuela La Laguna', 'Carlos',   'Medina',   '10000003', 'carlos.medina@sedeprincipal.edu.co'),
  ('estudiante', 'Escuela La Laguna', 'Luis',     'Pérez',    '10000004', 'luis.perez@sedeprincipal.edu.co'),
  ('estudiante', 'Escuela La Laguna', 'Daniela',  'Chocué',   '10000005', 'daniela.chocue@sedeprincipal.edu.co'),
  ('estudiante', 'Escuela La Laguna', 'Valeria',  'Mestizo',  '10000006', 'valeria.mestizo@sedeprincipal.edu.co'),
  ('estudiante', 'Escuela La Laguna', 'Andrés',   'Yule',     '10000008', 'andres.yule@sedeprincipal.edu.co'),
  ('estudiante', 'Escuela La Laguna', 'Camila',   'Tumiña',   '10000009', 'camila.tumina@sedeprincipal.edu.co')
) as datos(rol, sede, nombres, apellidos, documento, email)
on conflict (documento) do nothing;

-- ─────────────────────────────────────────────
-- 4. ESTUDIANTES Y PROFESORES — extensión de usuarios
-- ─────────────────────────────────────────────
insert into profesores (usuario_id)
select id from usuarios where documento in ('10000002','10000003');

insert into estudiantes (usuario_id)
select id from usuarios
where documento in ('10000004','10000005','10000006','10000008','10000009');

-- ─────────────────────────────────────────────
-- 5. ACUDIENTES — uno para Luis, uno compartido por dos hermanas
-- ─────────────────────────────────────────────
insert into acudientes (id, nombres, apellidos, documento, telefono) values
  ('b0000000-0000-0000-0000-000000000001', 'Rosa',    'Pérez Yule',   '20000001', '3101234567'),
  ('b0000000-0000-0000-0000-000000000002', 'Antonio', 'Chocué Ipia',  '20000002', '3109876543');

insert into estudiante_acudientes (estudiante_id, acudiente_id, parentesco, es_principal)
select e.id, 'b0000000-0000-0000-0000-000000000001', 'madre', true
from estudiantes e join usuarios u on u.id = e.usuario_id
where u.documento = '10000004';   -- Luis

insert into estudiante_acudientes (estudiante_id, acudiente_id, parentesco, es_principal)
select e.id, 'b0000000-0000-0000-0000-000000000002', 'padre', true
from estudiantes e join usuarios u on u.id = e.usuario_id
where u.documento = '10000005';   -- Daniela

-- ─────────────────────────────────────────────
-- 6. ASIGNATURAS
-- ─────────────────────────────────────────────
insert into asignaturas (nombre, codigo) values
  ('Matemáticas', 'MAT'),
  ('Español',     'ESP'),
  ('Ciencias Naturales', 'CNA');

-- ─────────────────────────────────────────────
-- 7. PERÍODOS — dos cerrados, uno activo, uno futuro
-- ─────────────────────────────────────────────
insert into periodos_academicos
  (nombre, anio, numero, fecha_inicio, fecha_fin, fecha_limite_notas, notas_habilitadas, activo)
values
  ('2026-1', 2026, 1,
   current_date - interval '220 days', current_date - interval '160 days',
   current_date - interval '150 days', false, false),
  ('2026-2', 2026, 2,
   current_date - interval '140 days', current_date - interval '80 days',
   current_date - interval '70 days',  false, false),
  ('2026-3', 2026, 3,
   current_date - interval '60 days',  current_date + interval '20 days',
   current_date + interval '15 days',  true,  true),   -- período activo
  ('2026-4', 2026, 4,
   current_date + interval '30 days',  current_date + interval '90 days',
   current_date + interval '95 days',  true,  false);

-- ─────────────────────────────────────────────
-- 8. ASIGNACIONES — AHORA con tres grados distintos:
-- Marta (Matemáticas) dicta en 9-B Y en 8-A.
-- Carlos (Español) dicta en 9-B Y en 10-A.
-- Cada combinación profesor+grado se repite en los 4 períodos.
-- ─────────────────────────────────────────────
insert into asignaciones (profesor_id, asignatura_id, sede_id, grado, periodo_id)
select p.id, a.id, s.id, datos.grado, per.id
from (values
  ('10000002', 'MAT', '9-B'),
  ('10000002', 'MAT', '8-A'),
  ('10000003', 'ESP', '9-B'),
  ('10000003', 'ESP', '10-A')
) as datos(documento, codigo_asignatura, grado)
join usuarios up on up.documento = datos.documento
join profesores p on p.usuario_id = up.id
join asignaturas a on a.codigo = datos.codigo_asignatura
join sedes s on s.nombre = 'Escuela La Laguna'
cross join periodos_academicos per;

-- ─────────────────────────────────────────────
-- 9. MATRÍCULAS — cada estudiante en SU grado correspondiente,
-- no todos en el mismo.
-- ─────────────────────────────────────────────
insert into matriculas (estudiante_id, sede_id, grado, periodo_id)
select e.id, s.id, datos.grado, per.id
from (values
  ('10000004', '9-B'),   -- Luis
  ('10000005', '9-B'),   -- Daniela
  ('10000006', '9-B'),   -- Valeria
  ('10000008', '8-A'),   -- Andrés
  ('10000009', '10-A')   -- Camila
) as datos(documento, grado)
join usuarios u on u.documento = datos.documento
join estudiantes e on e.usuario_id = u.id
join sedes s on s.nombre = 'Escuela La Laguna'
cross join periodos_academicos per;

-- ─────────────────────────────────────────────
-- 10. EXCEPCIÓN DE PLAZO — Carlos, período activo, SOLO su
-- asignación de 9-B (ahora que tiene dos asignaciones activas
-- en el mismo período, hay que ser explícito con el grado para
-- no crear la excepción sobre las dos por accidente).
-- ─────────────────────────────────────────────
insert into excepciones_plazo (profesor_id, asignacion_id, periodo_id, fecha_limite_extendida, autorizado_por, motivo)
select p.id, asg.id, per.id,
       per.fecha_limite_notas + interval '10 days',
       (select id from usuarios where documento = '10000001'),
       'Sin conectividad en la vereda durante la semana del cierre'
from profesores p
join usuarios up on up.id = p.usuario_id and up.documento = '10000003'
join periodos_academicos per on per.nombre = '2026-3'
join asignaciones asg on asg.profesor_id = p.id
                      and asg.periodo_id = per.id
                      and asg.grado = '9-B';   -- explícito: solo esta, no la de 10-A

-- ─────────────────────────────────────────────
-- 11. NOTAS
-- 9-B: Luis, Daniela, Valeria (Matemáticas, con Marta) — igual
-- que antes. Se agregan notas de Andrés (8-A, con Marta) y
-- Camila (10-A, con Carlos) para probar cruce de grados.
-- ─────────────────────────────────────────────
insert into notas (estudiante_id, asignacion_id, valor, en_revision, registrado_por)
select e.id, asg.id, datos.valor, datos.revision, prof_usuario.id
from (values
  -- 9-B, Matemáticas con Marta
  ('10000004','2026-1','MAT','9-B', 4.2, false),
  ('10000005','2026-1','MAT','9-B', 4.8, false),
  ('10000006','2026-1','MAT','9-B', 4.0, false),
  ('10000004','2026-2','MAT','9-B', 3.8, false),
  ('10000005','2026-2','MAT','9-B', 4.5, true),    -- en revisión
  ('10000006','2026-2','MAT','9-B', 3.6, false),
  ('10000005','2026-3','MAT','9-B', 4.9, false),   -- período activo
  -- 8-A, Matemáticas con Marta (grado distinto)
  ('10000008','2026-1','MAT','8-A', 3.5, false),
  ('10000008','2026-2','MAT','8-A', 4.1, false),
  -- 10-A, Español con Carlos (otro profesor, otro grado)
  ('10000009','2026-1','ESP','10-A', 4.6, false),
  ('10000009','2026-2','ESP','10-A', 4.3, false)
) as datos(documento_estudiante, periodo, codigo_asignatura, grado, valor, revision)
join usuarios ue on ue.documento = datos.documento_estudiante
join estudiantes e on e.usuario_id = ue.id
join periodos_academicos per on per.nombre = datos.periodo
join asignaturas asig on asig.codigo = datos.codigo_asignatura
join asignaciones asg on asg.periodo_id = per.id
                      and asg.asignatura_id = asig.id
                      and asg.grado = datos.grado
join profesores prof on prof.id = asg.profesor_id
join usuarios prof_usuario on prof_usuario.id = prof.usuario_id;

-- ─────────────────────────────────────────────
-- 12. RECURSOS Y PERMISOS
-- ─────────────────────────────────────────────
insert into recursos (codigo, tipo, descripcion, modulo) values
  ('btn_registrar_nota',   'boton', 'Registrar o editar una nota',        'notas'),
  ('btn_exportar_notas',   'boton', 'Exportar notas a Excel',             'notas'),
  ('vista_admin_usuarios', 'vista', 'Panel de administración de usuarios','usuarios'),
  ('btn_eliminar_usuario', 'boton', 'Eliminar un usuario',                'usuarios'),
  ('vista_reportes',       'vista', 'Reportes generales por sede',        'reportes');

insert into permisos (rol_id, recurso_id, habilitado)
select r.id, rec.id, datos.habilitado
from (values
  ('admin',      'btn_registrar_nota',   true),
  ('admin',      'btn_exportar_notas',   true),
  ('admin',      'vista_admin_usuarios', true),
  ('admin',      'btn_eliminar_usuario', true),
  ('admin',      'vista_reportes',       true),
  ('profesor',   'btn_registrar_nota',   true),
  ('profesor',   'btn_exportar_notas',   true),
  ('profesor',   'vista_admin_usuarios', false),
  ('profesor',   'btn_eliminar_usuario', false),
  ('estudiante', 'vista_reportes',       false)
) as datos(rol, codigo, habilitado)
join roles r on r.nombre = datos.rol
join recursos rec on rec.codigo = datos.codigo;

-- ─────────────────────────────────────────────
-- 13. DOCUMENTOS
-- ─────────────────────────────────────────────
insert into documentos (estudiante_id, tipo_documento, storage_path, subido_por)
select e.id, 'registro_civil', 'documentos/luis-perez/registro-civil.pdf',
       (select id from usuarios where documento = '10000001')
from estudiantes e join usuarios u on u.id = e.usuario_id
where u.documento = '10000004';

-- ═══════════════════════════════════════════════════════════
-- VERIFICACIÓN
--
-- Confirmar contraseñas (el hash es fijo, generado una vez con
-- Hash::make('Prueba123!') en Laravel -- ver nota en el insert de
-- usuarios más arriba sobre por qué no se genera con crypt() acá):
-- select documento, email, password_hash like '$2y$%' as es_hash_laravel
-- from usuarios;
-- -> 'true' en las 9 filas. La verificación real de que la clave es
--    'Prueba123!' se hace en Laravel con Hash::check(), no en SQL.
--
-- Confirmar los tres grados con sus asignaciones:
-- select s.nombre as sede, a.grado, asig.nombre as asignatura,
--        u.nombres as profesor
-- from asignaciones a
-- join sedes s on s.id = a.sede_id
-- join asignaturas asig on asig.id = a.asignatura_id
-- join profesores p on p.id = a.profesor_id
-- join usuarios u on u.id = p.usuario_id
-- join periodos_academicos per on per.id = a.periodo_id and per.nombre = '2026-3'
-- order by a.grado;
-- -> debe mostrar 4 filas: 9-B/MAT/Marta, 8-A/MAT/Marta,
--    9-B/ESP/Carlos, 10-A/ESP/Carlos.
--
-- Confirmar que la excepción de plazo quedó SOLO en 9-B:
-- select a.grado from excepciones_plazo ex
-- join asignaciones a on a.id = ex.asignacion_id;
-- -> debe devolver una sola fila: '9-B'.
--
-- El rol admin (Yolanda) quedó creado:
-- select documento, email, r.nombre as rol
-- from usuarios u join roles r on r.id = u.rol_id
-- where documento = '10000007';
-- ═══════════════════════════════════════════════════════════
