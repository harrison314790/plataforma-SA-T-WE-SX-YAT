-- ============================================================
-- 14-acciones-de-tabla.sql
-- Las acciones de cada fila de la tabla de Asignaciones pasan a
-- definirse en la BASE: su rótulo y su ícono, además de quién las
-- puede usar (que ya estaba).
--
-- POR QUÉ SE PUEDE HACER SIN TOCAR EL ESQUEMA
-- `recursos` ya tiene `etiqueta` e `icono` desde 05-navegacion.sql.
-- Se agregaron para las VISTAS (las entradas del menú) y quedaron
-- en null para los botones, con el comentario "un botón no es
-- entrada de menú". Eso era cierto para el menú y falso para una
-- barra de acciones: un botón de fila también necesita un rótulo y
-- un ícono, y son exactamente el mismo par de datos.
--
-- QUÉ QUEDA EN LA BASE Y QUÉ NO -- la línea importa
--   En la base: el RÓTULO, el ÍCONO y QUIÉN puede usar la acción.
--     Renombrar "Eliminar" a "Borrar", cambiarle el ícono, o
--     quitarle el borrado a un rol, deja de ser un despliegue.
--   En el código: QUÉ HACE la acción y CUÁNDO aplica. Eso es
--     comportamiento, no configuración -- es la misma línea que
--     separa `modulos` (qué trae la instalación) de
--     `modulos-construidos.ts` (qué pantalla existe). Una fila
--     nueva en esta tabla no inventa una acción: si el código no
--     sabe manejar ese `codigo`, no aparece.
--
-- Corré esto DESPUÉS de 13-datos-prueba-multisede.sql.
-- ============================================================

begin;

-- ----------------------------------------------------------------
-- 1. Rótulo e ícono de los botones del módulo
--
-- `orden` decide en qué secuencia se pintan en la fila: editar
-- primero (lo más frecuente) y eliminar al final -- la única
-- irreversible, lejos del puntero que viene de pulsar la otra.
--
-- Los íconos son NOMBRES del set de Angular (core/navegacion/iconos.ts),
-- nunca marcado SVG, igual que en `modulos.icono`.
-- ----------------------------------------------------------------
update recursos set etiqueta = 'Editar',    icono = 'lapiz',    orden = 10 where codigo = 'btn_editar_asignacion';
update recursos set etiqueta = 'Eliminar',  icono = 'papelera', orden = 30 where codigo = 'btn_eliminar_asignacion';

-- Estos dos no son acciones de fila (viven en la cabecera de la
-- pantalla), pero se les pone rótulo igual: si algún día se quieren
-- renombrar, que sea el mismo mecanismo y no dos.
--
-- NO hay recursos de "desactivar"/"reactivar" para asignaciones, y es
-- deliberado: desactivar una asignación NO es una acción de la tabla.
-- Se llega a ella por una sola puerta -- el diálogo de eliminar, cuando
-- la asignación tiene notas y el borrado es imposible -- y ahí es la
-- alternativa que se ofrece, no una acción que se elige de entrada.
-- Como parte de "editar una asignación", va con `btn_editar_asignacion`.
update recursos set etiqueta = 'Nueva asignación', orden = 10 where codigo = 'btn_crear_asignacion';
update recursos set etiqueta = 'Grados y grupos',  orden = 20 where codigo = 'btn_gestionar_grados';

commit;

-- ============================================================
-- Verificación (opcional, correr aparte)
-- ============================================================
-- -- Las acciones, tal como las va a pintar la tabla:
-- select codigo, etiqueta, icono, orden
-- from recursos
-- where modulo = 'asignaciones' and tipo = 'boton'
-- order by orden, codigo;
--
-- -- Para renombrar una acción NO hace falta desplegar:
-- --   update recursos set etiqueta = 'Borrar' where codigo = 'btn_eliminar_asignacion';
-- -- Para quitársela a un rol, tampoco:
-- --   update permisos set habilitado = false
-- --   where recurso_id = (select id from recursos where codigo = 'btn_eliminar_asignacion')
-- --     and rol_id = (select id from roles where nombre = 'admin');
