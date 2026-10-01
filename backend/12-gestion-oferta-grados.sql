-- ============================================================
-- 12-gestion-oferta-grados.sql
-- Permite administrar `oferta_grados` (qué grado+grupo existe en
-- cada sede) desde la pantalla de Asignaciones.
--
-- Es un archivo CORTO a propósito: la tabla, sus políticas RLS y
-- sus GRANT ya los creó 08-oferta-grados-por-sede.sql, y su
-- política de escritura es `for all using (fn_es_admin())`, que ya
-- cubre insert, update y delete. Lo único que faltaba era el
-- RECURSO -- sin él, el middleware `requiere.permiso` no tiene
-- contra qué comparar y la acción no existe para ninguna capa.
--
-- Corré esto DESPUÉS de 11-asignaciones-modulo.sql.
-- ============================================================

begin;

-- ----------------------------------------------------------------
-- 1. Un solo recurso para crear Y eliminar, a diferencia de
--    `asignaciones`
--
-- En 11 se separaron `btn_crear_asignacion` / `btn_editar_asignacion`
-- / `btn_eliminar_asignacion` porque eliminar una asignación es
-- irreversible y crear no. Acá la asimetría no existe: la llave
-- foránea compuesta de `asignaciones`/`matriculas` contra
-- `oferta_grados` impide borrar cualquier combinación que se haya
-- usado alguna vez, así que lo único que se puede borrar de verdad
-- es una fila que nadie tocó -- y volver a crearla son tres campos.
-- Separar el permiso daría la ilusión de controlar un riesgo que la
-- base ya eliminó, y una fila más que mantener en `permisos`.
--
-- El módulo es 'asignaciones' porque es desde ahí que se
-- administra hoy. Cuando exista la pantalla de Matrículas, que usa
-- la misma tabla, hay que decidir si este recurso se mueve a un
-- módulo de configuración propio -- no heredarlo por inercia.
-- ----------------------------------------------------------------
insert into recursos (codigo, tipo, descripcion, modulo, etiqueta, ruta, icono, orden) values
  ('btn_gestionar_grados', 'boton',
   'Crear, desactivar o eliminar un grado y grupo de una sede (oferta_grados)',
   'asignaciones', null, null, null, 100)
on conflict (codigo) do update
  set descripcion = excluded.descripcion,
      modulo      = excluded.modulo;

-- ----------------------------------------------------------------
-- 2. Permisos: nivel admin, igual que el resto del módulo
--
-- super_admin no aparece (bypass total, ver references/permisos.md).
-- Las negativas de profesor y estudiante sí se siembran, para que el
-- mapa que recibe Angular traiga la clave y se pueda distinguir "no
-- habilitado para tu rol" de "este recurso no existe".
-- ----------------------------------------------------------------
insert into permisos (rol_id, recurso_id, habilitado)
select r.id, rec.id, datos.habilitado
from (values
  ('admin',      'btn_gestionar_grados', true),
  ('profesor',   'btn_gestionar_grados', false),
  ('estudiante', 'btn_gestionar_grados', false)
) as datos(rol, codigo, habilitado)
join roles r      on r.nombre = datos.rol
join recursos rec on rec.codigo = datos.codigo
on conflict (rol_id, recurso_id) do update set habilitado = excluded.habilitado;

-- ----------------------------------------------------------------
-- 3. Índice para el conteo de uso
--
-- Antes de ofrecer el borrado hay que saber si esa combinación se
-- usó, y eso es un count sobre `matriculas` por (sede, grado, grupo).
-- `asignaciones` ya tiene ese índice desde 11; `matriculas` no tenía
-- ninguno que sirviera (solo estudiante_id y periodo_id).
-- ----------------------------------------------------------------
create index if not exists idx_matriculas_sede_grado_grupo
  on matriculas (sede_id, grado, grupo);

commit;

-- ============================================================
-- Verificación (opcional, correr aparte)
-- ============================================================
-- -- el recurso y quién lo tiene:
-- select r.nombre as rol, p.habilitado
-- from permisos p
-- join roles r on r.id = p.rol_id
-- join recursos rec on rec.id = p.recurso_id
-- where rec.codigo = 'btn_gestionar_grados' order by r.nombre;
--
-- -- qué combinaciones se pueden borrar de verdad (uso = 0):
-- select og.id, s.nombre, og.grado, og.grupo, og.activo,
--   (select count(*) from asignaciones a
--     where a.sede_id=og.sede_id and a.grado=og.grado and a.grupo=og.grupo) as asignaciones,
--   (select count(*) from matriculas m
--     where m.sede_id=og.sede_id and m.grado=og.grado and m.grupo=og.grupo) as matriculas
-- from oferta_grados og join sedes s on s.id = og.sede_id
-- order by s.nombre, og.grado, og.grupo;
