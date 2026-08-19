-- ═══════════════════════════════════════════════════════════
-- Sistema Académico — Datos de prueba
-- Correr DESPUÉS de 01-esquema-inicial.sql y 02-politicas-rls.sql
--
-- El SQL Editor de Supabase corre como el rol `postgres`, que
-- salta el RLS. Por eso este script puede insertar directo sin
-- pelear con las políticas — pero la app real SIEMPRE pasará
-- por ellas. Este script es solo para poblar de prueba.
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- PASO 0 — Crear estos usuarios ANTES de correr el resto.
-- Dashboard → Authentication → Users → Add user
-- Marcar "Auto Confirm User" en cada uno.
--
--  email                        password      rol
--  admin@sedeprincipal.edu.co   Prueba123!    admin
--  marta.rios@sedeprincipal.edu.co   Prueba123!   profesor
--  carlos.medina@sedeprincipal.edu.co Prueba123!  profesor
--  luis.perez@sedeprincipal.edu.co    Prueba123!  estudiante
--  daniela.chocue@sedeprincipal.edu.co Prueba123! estudiante
--  valeria.mestizo@sedeprincipal.edu.co Prueba123! estudiante
--
-- El script busca sus id por email, así que no hace falta
-- copiar ningún UUID a mano.
-- ─────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- 1. ROLES
-- ─────────────────────────────────────────────
insert into roles (nombre) values
  ('admin'), ('profesor'), ('estudiante')
on conflict (nombre) do nothing;

-- ─────────────────────────────────────────────
-- 2. SEDES — principal + una vereda, jerárquicas
-- ─────────────────────────────────────────────
insert into sedes (id, nombre, tipo, vereda, sede_padre_id) values
  ('a0000000-0000-0000-0000-000000000001', 'Sede Principal', 'principal', null, null);

insert into sedes (nombre, tipo, vereda, sede_padre_id) values
  ('Escuela La Laguna', 'vereda', 'La Laguna',
   'a0000000-0000-0000-0000-000000000001'),
  ('Escuela Guaitalá', 'vereda', 'Guaitalá',
   'a0000000-0000-0000-0000-000000000001');

-- ─────────────────────────────────────────────
-- 3. USUARIOS — enlazados a los auth.users del Paso 0 por email
-- ─────────────────────────────────────────────
insert into usuarios (auth_id, rol_id, sede_id, nombres, apellidos, documento)
select u.id,
       (select id from roles where nombre = datos.rol),
       (select id from sedes where nombre = datos.sede),
       datos.nombres, datos.apellidos, datos.documento
from auth.users u
join (values
  ('admin@sedeprincipal.edu.co',        'admin',      'Sede Principal',    'Harrison', 'Medina',  '10000001'),
  ('marta.rios@sedeprincipal.edu.co',   'profesor',   'Escuela La Laguna', 'Marta',    'Ríos',    '10000002'),
  ('carlos.medina@sedeprincipal.edu.co','profesor',   'Escuela La Laguna', 'Carlos',   'Medina',  '10000003'),
  ('luis.perez@sedeprincipal.edu.co',   'estudiante', 'Escuela La Laguna', 'Luis',     'Pérez',   '10000004'),
  ('daniela.chocue@sedeprincipal.edu.co','estudiante','Escuela La Laguna', 'Daniela',  'Chocué',  '10000005'),
  ('valeria.mestizo@sedeprincipal.edu.co','estudiante','Escuela La Laguna','Valeria',  'Mestizo', '10000006')
) as datos(email, rol, sede, nombres, apellidos, documento)
  on datos.email = u.email
on conflict (documento) do nothing;

-- ─────────────────────────────────────────────
-- 4. ESTUDIANTES Y PROFESORES — extensión de usuarios
-- ─────────────────────────────────────────────
insert into profesores (usuario_id)
select id from usuarios where documento in ('10000002','10000003');

insert into estudiantes (usuario_id)
select id from usuarios
where documento in ('10000004','10000005','10000006');

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
-- 7. PERÍODOS — dos cerrados, uno activo, uno futuro.
-- Fechas relativas a hoy para que la demo sea válida sin
-- importar cuándo corras este script.
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
-- 8. ASIGNACIONES — Marta con Matemáticas, Carlos con Español,
-- ambos en 9-B, Escuela La Laguna, en los 4 períodos.
-- ─────────────────────────────────────────────
insert into asignaciones (profesor_id, asignatura_id, sede_id, grado, periodo_id)
select p.id, a.id, s.id, '9-B', per.id
from profesores p
join usuarios up on up.id = p.usuario_id
join asignaturas a on a.codigo = case when up.documento = '10000002' then 'MAT' else 'ESP' end
join sedes s on s.nombre = 'Escuela La Laguna'
cross join periodos_academicos per
where up.documento in ('10000002','10000003');

-- ─────────────────────────────────────────────
-- 9. MATRÍCULAS — los tres estudiantes, en 9-B, en cada período
-- ─────────────────────────────────────────────
insert into matriculas (estudiante_id, sede_id, grado, periodo_id)
select e.id, s.id, '9-B', per.id
from estudiantes e
join sedes s on s.nombre = 'Escuela La Laguna'
cross join periodos_academicos per;

-- ─────────────────────────────────────────────
-- 10. EXCEPCIÓN DE PLAZO — Carlos, período activo, 10 días extra
-- por conectividad en la vereda.
-- ─────────────────────────────────────────────
insert into excepciones_plazo (profesor_id, asignacion_id, periodo_id, fecha_limite_extendida, autorizado_por, motivo)
select p.id, asg.id, per.id,
       per.fecha_limite_notas + interval '10 days',
       (select id from usuarios where documento = '10000001'),
       'Sin conectividad en la vereda durante la semana del cierre'
from profesores p
join usuarios up on up.id = p.usuario_id and up.documento = '10000003'
join periodos_academicos per on per.nombre = '2026-3'
join asignaciones asg on asg.profesor_id = p.id and asg.periodo_id = per.id;

-- ─────────────────────────────────────────────
-- 11. NOTAS
-- 2026-1 y 2026-2 (cerrados): todos con nota, una en revisión.
-- 2026-3 (activo): solo Daniela ya tiene nota — Luis y Valeria
-- quedan SIN fila, que es como el sistema representa "pendiente"
-- (ver diseño de la grilla: celda vacía = pendiente).
-- ─────────────────────────────────────────────
insert into notas (estudiante_id, asignacion_id, valor, en_revision, registrado_por)
select e.id, asg.id, datos.valor, datos.revision,
       (select up.id from usuarios up where up.documento = '10000002')
from (values
  ('10000004','2026-1', 4.2, false),
  ('10000005','2026-1', 4.8, false),
  ('10000006','2026-1', 4.0, false),
  ('10000004','2026-2', 3.8, false),
  ('10000005','2026-2', 4.5, true),   -- en revisión
  ('10000006','2026-2', 3.6, false),
  ('10000005','2026-3', 4.9, false)   -- solo ella tiene nota del período activo
) as datos(documento, periodo, valor, revision)
join usuarios ue on ue.documento = datos.documento
join estudiantes e on e.usuario_id = ue.id
join periodos_academicos per on per.nombre = datos.periodo
join asignaciones asg on asg.periodo_id = per.id
  and asg.profesor_id = (select pr.id from profesores pr
                          join usuarios upp on upp.id = pr.usuario_id
                          where upp.documento = '10000002');  -- Marta, Matemáticas

-- ─────────────────────────────────────────────
-- 12. RECURSOS Y PERMISOS — catálogo mínimo para probar
-- el mecanismo de *appHasRole en Angular.
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
-- 13. DOCUMENTOS — un ejemplo, sin archivo real
-- ─────────────────────────────────────────────
insert into documentos (estudiante_id, tipo_documento, storage_path, subido_por)
select e.id, 'registro_civil', 'documentos/luis-perez/registro-civil.pdf',
       (select id from usuarios where documento = '10000001')
from estudiantes e join usuarios u on u.id = e.usuario_id
where u.documento = '10000004';

-- ═══════════════════════════════════════════════════════════
-- VERIFICACIÓN — correr estas por separado después de sembrar
-- ═══════════════════════════════════════════════════════════

-- Todo Luis, todos sus períodos:
-- select per.nombre, n.valor, n.en_revision
-- from notas n
-- join estudiantes e on e.id = n.estudiante_id
-- join usuarios u on u.id = e.usuario_id
-- join asignaciones a on a.id = n.asignacion_id
-- join periodos_academicos per on per.id = a.periodo_id
-- where u.documento = '10000004' order by per.numero;

-- La grilla de Marta para 2026-3 (activo):
-- select u.nombres, u.apellidos, n.valor
-- from matriculas m
-- join estudiantes e on e.id = m.estudiante_id
-- join usuarios u on u.id = e.usuario_id
-- join periodos_academicos per on per.id = m.periodo_id and per.nombre = '2026-3'
-- left join asignaciones asg on asg.periodo_id = per.id
--   and asg.profesor_id = (select p.id from profesores p
--     join usuarios up on up.id = p.usuario_id where up.documento = '10000002')
-- left join notas n on n.asignacion_id = asg.id and n.estudiante_id = e.id
-- order by u.apellidos;
-- ═══════════════════════════════════════════════════════════
