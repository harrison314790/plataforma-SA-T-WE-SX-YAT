-- ============================================================
-- 19-usuarios-modulo.sql
-- Lo que le faltaba a la BASE para que el módulo de Usuarios
-- (cuentas de profesores y estudiantes) exista con sus tres capas:
--
--   1. Los dos botones que no estaban sembrados (crear y editar).
--      03-datos-prueba.sql solo dejó `vista_admin_usuarios` y
--      `btn_eliminar_usuario`, así que hoy ninguna ruta de alta o
--      edición podría pasar el middleware `requiere.permiso`.
--   2. Las políticas RLS de DELETE sobre `usuarios`, `profesores` y
--      `estudiantes`. 02-politicas-rls.sql les dio select/insert/
--      update a las tres, pero delete solo a super_admin (vía su
--      `for all`). Con RLS activo y sin política, un DELETE no falla:
--      afecta 0 filas y la aplicación cree que borró -- mismo hueco
--      que cerró 11-asignaciones-modulo.sql para asignaciones.
--   3. Un índice para el listado, que filtra por rol.
--
-- QUÉ NO CAMBIA: el alcance del módulo es SOLO la cuenta y sus datos
-- de identidad. Grado, grupo y sede del estudiante viven en
-- `matriculas` (módulo Matrículas); las materias del profesor, en
-- `asignaciones`. Nada de eso se toca acá.
--
-- Corré esto DESPUÉS de 18-datos-prueba-historico.sql (o de 16 en
-- producción, donde 17 y 18 no se corren).
-- ============================================================

begin;

-- ----------------------------------------------------------------
-- 1. Recursos: crear y editar (eliminar ya existía desde 03)
--
-- Tres códigos separados por la misma razón que en asignaciones:
-- crear y editar son reversibles, eliminar no. Separarlos deja que
-- super_admin le dé a una secretaria el alta de cuentas sin darle el
-- borrado, sin tocar código.
--
-- Activar/desactivar una cuenta NO tiene código propio: es el toggle
-- "Cuenta activa" dentro del formulario de edición, así que va con
-- `btn_editar_usuario`.
--
-- Rótulo e ícono en la base, igual que 14-acciones-de-tabla.sql: la
-- pantalla los lee de `GET /usuarios/opciones`.
-- ----------------------------------------------------------------
insert into recursos (codigo, tipo, descripcion, modulo, etiqueta, ruta, icono, orden) values
  ('btn_crear_usuario',  'boton', 'Crear una cuenta de profesor o estudiante',                 'usuarios', 'Nueva cuenta',    null, null,       10),
  ('btn_editar_usuario', 'boton', 'Editar los datos de una cuenta, o activarla/desactivarla',  'usuarios', 'Editar',          null, 'lapiz',    20)
on conflict (codigo) do update
  set descripcion = excluded.descripcion,
      modulo      = excluded.modulo,
      etiqueta    = excluded.etiqueta,
      icono       = excluded.icono,
      orden       = excluded.orden;

update recursos
   set descripcion = 'Eliminar definitivamente una cuenta sin datos asociados',
       etiqueta    = 'Eliminar cuenta',
       icono       = 'papelera',
       orden       = 30
 where codigo = 'btn_eliminar_usuario';

-- ----------------------------------------------------------------
-- 2. Permisos: exclusivo del nivel admin
--
-- super_admin no aparece: pasa cualquier código sin fila sembrada
-- (ver references/permisos.md). Las negativas de profesor y
-- estudiante sí se siembran, para que el mapa de permisos de Angular
-- distinga "no habilitado" de "no existe" -- mismo criterio que el
-- paso 7 de 11-asignaciones-modulo.sql.
--
-- `btn_eliminar_usuario` de estudiante faltaba desde 03; se completa.
-- ----------------------------------------------------------------
insert into permisos (rol_id, recurso_id, habilitado)
select r.id, rec.id, datos.habilitado
from (values
  ('admin',      'btn_crear_usuario',    true),
  ('profesor',   'btn_crear_usuario',    false),
  ('estudiante', 'btn_crear_usuario',    false),

  ('admin',      'btn_editar_usuario',   true),
  ('profesor',   'btn_editar_usuario',   false),
  ('estudiante', 'btn_editar_usuario',   false),

  ('admin',      'btn_eliminar_usuario', true),
  ('profesor',   'btn_eliminar_usuario', false),
  ('estudiante', 'btn_eliminar_usuario', false)
) as datos(rol, codigo, habilitado)
join roles r      on r.nombre = datos.rol
join recursos rec on rec.codigo = datos.codigo
on conflict (rol_id, recurso_id) do update set habilitado = excluded.habilitado;

-- ----------------------------------------------------------------
-- 3. RLS: las políticas de DELETE que faltaban
--
-- `usuarios` repite la misma guarda que `usuarios_admin_actualiza`:
-- un admin NO puede borrar la fila de alguien que es super_admin.
-- Sin esa condición, cualquier admin podría dejar al colegio sin su
-- operador del producto -- es el mismo escalamiento que 02 cerró
-- para insert/update, y no tendría sentido dejarlo abierto por el
-- lado del borrado.
--
-- Borrar una cuenta con historia (asignaciones, matrículas, notas,
-- documentos...) lo sigue impidiendo la base por sus llaves
-- foráneas, que NO tienen `on delete cascade` a propósito. Estas
-- políticas no relajan eso: solo hacen que el borrado de una cuenta
-- vacía (creada por error) llegue a ejecutarse.
-- ----------------------------------------------------------------
drop policy if exists "usuarios_admin_elimina" on usuarios;
create policy "usuarios_admin_elimina" on usuarios for delete
  to authenticated using (
    fn_es_admin()
    and rol_id <> (select id from roles where nombre = 'super_admin')
  );

drop policy if exists "profesores_admin_elimina" on profesores;
create policy "profesores_admin_elimina" on profesores for delete
  to authenticated using (fn_es_admin());

drop policy if exists "estudiantes_admin_elimina" on estudiantes;
create policy "estudiantes_admin_elimina" on estudiantes for delete
  to authenticated using (fn_es_admin());

-- ----------------------------------------------------------------
-- 4. Índice del listado
--
-- La pantalla pide las cuentas por rol (profesor/estudiante). Con
-- decenas de filas da igual; con unos cientos de estudiantes y RLS
-- evaluándose fila por fila, deja de dar igual.
-- ----------------------------------------------------------------
create index if not exists idx_usuarios_rol_id on usuarios (rol_id);

commit;

-- ============================================================
-- Verificación (opcional, correr aparte, como app_user y con el uuid
-- LITERAL -- ver la trampa del punto 9 del checklist de base-datos.md)
-- ============================================================
-- -- Las seis políticas de escritura de las tres tablas:
-- select tablename, policyname, cmd from pg_policies
-- where tablename in ('usuarios', 'profesores', 'estudiantes')
-- order by tablename, cmd;
--
-- -- Los permisos del módulo por rol:
-- select r.nombre as rol, rec.codigo, p.habilitado
-- from permisos p
-- join roles r on r.id = p.rol_id
-- join recursos rec on rec.id = p.recurso_id
-- where rec.modulo = 'usuarios'
-- order by rec.codigo, r.nombre;
--
-- -- Prueba de la guarda: con la sesión de Yolanda (admin, 10000007),
-- -- intentar borrar a Harrison (super_admin, 10000001) -> DELETE 0.
