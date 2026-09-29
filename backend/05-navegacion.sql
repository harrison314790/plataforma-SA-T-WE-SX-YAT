-- ═══════════════════════════════════════════════════════════
-- Sistema Académico — Catálogo de navegación (Postgres puro)
-- Correr DESPUÉS de 01, 02, 03 y 04. Es ADITIVO: no modifica
-- ninguna tabla de datos ni ninguna política existente.
--
-- QUÉ RESUELVE
-- El menú lateral tiene que salir de la base, no de un array
-- hardcodeado en Angular. La razón es la misma que ya gobierna
-- `recursos`/`permisos` (ver references/permisos.md): super_admin
-- decide qué módulos trae habilitada cada instalación según su
-- plan, y un admin de sede no puede activarse un módulo que su
-- colegio no pagó. Si el menú viviera en el código de Angular,
-- cambiar la oferta de un colegio exigiría desplegar de nuevo.
--
-- DÓNDE SE CORTA LA RAYA (decisión deliberada)
-- La base guarda QUÉ módulos existen, cómo se llaman, en qué
-- grupo y en qué orden aparecen, y a qué ruta llevan. NO guarda
-- el SVG del ícono: `modulos.icono` y `recursos.icono` son
-- NOMBRES de ícono ('libro', 'montanas', 'estrella'...) que
-- Angular resuelve contra su propio set, tomado del escudo de la
-- institución (ver references/diseno-ui.md). Guardar marcado SVG
-- en una columna de texto sería meter presentación en la base y
-- pagar ancho de banda por ella en cada login.
--
-- LO QUE LA BASE TAMPOCO SABE, Y ESTÁ BIEN ASÍ
-- Si el módulo ya está CONSTRUIDO en el frontend. Eso no es
-- configuración, es estado del código: lo responde Angular
-- (core/navegacion/modulos-construidos.ts). Son dos preguntas
-- distintas —"¿este rol puede entrar?" (base) y "¿la pantalla
-- existe?" (código)— y cada una la contesta quien de verdad la
-- sabe.
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. CATÁLOGO DE MÓDULOS
--
-- Catálogo de configuración, lectura abierta a cualquier
-- autenticado, sin ningún dato personal ni académico -> `integer
-- generated always as identity`, no uuid. Es el punto 1 del
-- checklist de references/base-datos.md.
--
-- `grupo` es texto libre a propósito y NO tiene tabla propia: el
-- orden en que se pintan los grupos se deriva del `orden` mínimo
-- de sus módulos (ver NavegacionService), así no existe un
-- `orden_grupo` que se pueda desincronizar del `orden` de los
-- módulos que contiene.
--
-- `activo = false` significa "esta instalación no tiene este
-- módulo" (no lo incluye su plan). Es distinto de que un rol no
-- tenga permiso: lo primero apaga el módulo para todo el colegio,
-- lo segundo solo para ese rol.
-- ─────────────────────────────────────────────

create table if not exists modulos (
  id       integer generated always as identity primary key,
  codigo   text not null unique,
  etiqueta text not null,
  grupo    text not null,
  icono    text not null,
  orden    integer not null default 100,
  activo   boolean not null default true
);

comment on table modulos is
  'Catálogo del menú. codigo coincide 1:1 con recursos.modulo. Escritura exclusiva de super_admin (control por plan).';
comment on column modulos.icono is
  'NOMBRE de ícono del set del escudo (libro, montanas, personas...), nunca marcado SVG. Angular lo resuelve.';
comment on column modulos.activo is
  'false = módulo no incluido en esta instalación. Distinto de "este rol no tiene permiso".';

-- ─────────────────────────────────────────────
-- 2. RECURSOS: los datos de navegación de una vista
--
-- `recursos` ya decía QUÉ vistas existen y a qué módulo pertenecen.
-- Le faltaba con qué nombre mostrarlas y a dónde llevan. Las cuatro
-- columnas son nullable porque solo tienen sentido para
-- `tipo = 'vista'`: un botón ('btn_registrar_nota') no es una
-- entrada de menú y no tiene ruta.
-- ─────────────────────────────────────────────

alter table recursos add column if not exists etiqueta text;
alter table recursos add column if not exists ruta     text;
alter table recursos add column if not exists icono    text;
alter table recursos add column if not exists orden    integer not null default 100;

comment on column recursos.etiqueta is 'Rótulo del menú. Obligatorio si tipo = vista (ver constraint).';
comment on column recursos.ruta is 'Ruta de Angular, con barra inicial. Obligatorio si tipo = vista.';

-- ─────────────────────────────────────────────
-- 2b. ROLES: etiqueta legible
--
-- La barra superior tiene que mostrar quién inició sesión, y
-- `roles.nombre` no sirve para eso: 'super_admin' es un código, no algo
-- que se le muestre a la secretaria de una escuela. La etiqueta va en la
-- base y no en un array de PHP por la misma razón que el resto de este
-- archivo: la escritura es exclusiva de super_admin, así que renombrar
-- un cargo no exige desplegar.
--
-- Las cuatro etiquetas son NEUTRAS en género a propósito: el sistema no
-- guarda el género de nadie y no se puede inferir de un nombre, así que
-- 'Docente' (no "Profesor/a") y 'Administración' (no "Administrador/a")
-- son la forma correcta de rotular a Marta y a Yolanda.
-- ─────────────────────────────────────────────

alter table roles add column if not exists etiqueta text;

update roles set etiqueta = datos.etiqueta
from (values
  ('super_admin', 'Superadmin'),
  ('admin',       'Administración'),
  ('profesor',    'Docente'),
  ('estudiante',  'Estudiante')
) as datos(nombre, etiqueta)
where roles.nombre = datos.nombre;

-- Se pone NOT NULL después del update, no en el add column: la tabla ya
-- tiene filas y un `add column ... not null` sin default las rechazaría.
alter table roles alter column etiqueta set not null;

comment on column roles.etiqueta is
  'Rótulo para mostrar (Docente, Administración...). roles.nombre sigue siendo el código que leen las políticas y el middleware.';

-- ─────────────────────────────────────────────
-- 3. MÓDULOS DEL SISTEMA
--
-- Los siete del roadmap real del proyecto (ver SKILL.md). Todos
-- quedan `activo = true`: la institución los quiere todos. Que hoy
-- solo `notas` esté construido en Angular es información del
-- frontend, no de la base -- ver la nota de arriba.
--
-- `orden` numera el sistema completo de corrido (10, 20, 30...), no
-- reinicia por grupo: así el grupo hereda su posición del orden de
-- sus módulos sin necesitar una columna aparte.
-- ─────────────────────────────────────────────

insert into modulos (codigo, etiqueta, grupo, icono, orden, activo) values
  ('notas',         'Notas',            'Académico', 'libro',    10, true),
  ('matriculas',    'Matrículas',       'Académico', 'carnet',   20, true),
  ('asistencia',    'Asistencia',       'Académico', 'lista',    30, true),
  ('usuarios',      'Usuarios',         'Gestión',   'personas', 40, true),
  ('documentos',    'Documentos',       'Gestión',   'carpeta',  50, true),
  ('reportes',      'Reportes',         'Gestión',   'grafico',  60, true),
  ('configuracion', 'Roles y permisos', 'Sistema',   'llave',    70, true)
on conflict (codigo) do update
  set etiqueta = excluded.etiqueta,
      grupo    = excluded.grupo,
      icono    = excluded.icono,
      orden    = excluded.orden;

-- ─────────────────────────────────────────────
-- 4. VISTAS (recursos tipo 'vista') CON SU NAVEGACIÓN
--
-- Las dos que ya existían de 03-datos-prueba.sql
-- (vista_admin_usuarios, vista_reportes) solo reciben etiqueta,
-- ruta e ícono. Las demás se crean acá.
--
-- Faltaba una vista para el propio módulo de notas: 03 sembró los
-- BOTONES de notas (btn_registrar_nota, btn_exportar_notas) pero
-- ninguna vista, así que el módulo que sí está construido era el
-- único sin entrada posible en el menú.
-- ─────────────────────────────────────────────

insert into recursos (codigo, tipo, descripcion, modulo, etiqueta, ruta, icono, orden) values
  ('vista_notas',         'vista', 'Registro y consulta de notas por grupo',      'notas',         'Registro de notas', '/notas',         'libro',    10),
  ('vista_matriculas',    'vista', 'Matricular estudiantes en un grado y período','matriculas',    'Matrículas',        '/matriculas',    'carnet',   10),
  ('vista_asistencia',    'vista', 'Registro diario de asistencia',               'asistencia',    'Asistencia',        '/asistencia',    'lista',    10),
  ('vista_documentos',    'vista', 'Documentos del estudiante y de la sede',      'documentos',    'Documentos',        '/documentos',    'carpeta',  10),
  ('vista_configuracion', 'vista', 'Roles, recursos y permisos del sistema',      'configuracion', 'Roles y permisos',  '/configuracion', 'llave',    10)
on conflict (codigo) do update
  set etiqueta = excluded.etiqueta,
      ruta     = excluded.ruta,
      icono    = excluded.icono,
      orden    = excluded.orden;

update recursos set etiqueta = 'Usuarios',          ruta = '/usuarios', icono = 'personas', orden = 10
  where codigo = 'vista_admin_usuarios';
update recursos set etiqueta = 'Reportes por sede', ruta = '/reportes', icono = 'grafico',  orden = 10
  where codigo = 'vista_reportes';

-- ─────────────────────────────────────────────
-- 5. INTEGRIDAD
--
-- Dos restricciones contra los dos errores más probables al agregar
-- un módulo a mano: (a) una vista sin etiqueta ni ruta, que dejaría
-- un hueco en blanco en el menú; (b) un `recursos.modulo` que no
-- existe en `modulos`, que dejaría la vista huérfana y por lo tanto
-- invisible.
--
-- EL ORDEN IMPORTA Y SE APRENDIÓ FALLANDO: las dos restricciones van
-- DESPUÉS de los pasos 3 y 4, no antes. Puestas arriba, el check
-- revienta con "is violated by some row" -- las dos vistas que venían
-- de 03-datos-prueba.sql (vista_admin_usuarios, vista_reportes)
-- todavía no tienen etiqueta ni ruta en ese punto, y la FK todavía no
-- tiene fila en `modulos` para cada valor de `recursos.modulo`.
-- ─────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recursos_vista_tiene_navegacion'
  ) then
    alter table recursos add constraint recursos_vista_tiene_navegacion
      check (tipo <> 'vista' or (etiqueta is not null and ruta is not null));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'recursos_modulo_fkey'
  ) then
    alter table recursos add constraint recursos_modulo_fkey
      foreign key (modulo) references modulos(codigo);
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 6. PERMISOS DE LAS VISTAS NUEVAS
--
-- super_admin NO aparece acá, y no es un olvido: pasa cualquier
-- código sin fila sembrada, tanto en RLS (`fn_es_super_admin()` es
-- bypass total) como en el middleware RequierePermiso. Sembrarle
-- filas crearía una segunda fuente de verdad que se puede
-- desincronizar -- ver references/permisos.md.
--
-- vista_configuracion no se le da a NINGÚN rol: es exclusiva de
-- super_admin, y precisamente por eso no necesita fila.
-- ─────────────────────────────────────────────

insert into permisos (rol_id, recurso_id, habilitado)
select r.id, rec.id, datos.habilitado
from (values
  -- Notas: las ve todo el mundo, pero cada uno ve filas distintas
  -- (RLS decide eso, no el permiso de vista).
  ('admin',      'vista_notas',         true),
  ('profesor',   'vista_notas',         true),
  ('estudiante', 'vista_notas',         true),

  -- Matrículas: administrativo puro. Marta no matricula a nadie.
  ('admin',      'vista_matriculas',    true),
  ('profesor',   'vista_matriculas',    false),
  ('estudiante', 'vista_matriculas',    false),

  -- Asistencia: la toma quien está en el aula.
  ('admin',      'vista_asistencia',    true),
  ('profesor',   'vista_asistencia',    true),
  ('estudiante', 'vista_asistencia',    false),

  -- Documentos: el estudiante consulta los suyos (RLS ya lo acota
  -- a sus propias filas); el profesor no tiene nada que hacer ahí.
  ('admin',      'vista_documentos',    true),
  ('profesor',   'vista_documentos',    false),
  ('estudiante', 'vista_documentos',    true),

  -- Faltaban las negativas explícitas de estas dos: sin fila, el
  -- mapa de permisos que recibe Angular no traía la clave y la
  -- diferencia entre "no habilitado" y "no existe" se perdía.
  ('estudiante', 'vista_admin_usuarios', false),
  ('profesor',   'vista_reportes',       false)
) as datos(rol, codigo, habilitado)
join roles r    on r.nombre = datos.rol
join recursos rec on rec.codigo = datos.codigo
on conflict (rol_id, recurso_id) do update set habilitado = excluded.habilitado;

-- ─────────────────────────────────────────────
-- 7. RLS Y GRANTS DE `modulos`
--
-- Misma pareja de políticas que ya tienen `recursos` y `permisos`,
-- por la misma razón: lectura abierta (Angular necesita el catálogo
-- para armar el menú en cuanto entra), escritura EXCLUSIVA de
-- super_admin porque activar o desactivar un módulo es el control
-- por plan -- un admin de sede no puede habilitarse un módulo que
-- su colegio no contrató.
--
-- El GRANT explícito no es redundante con el `alter default
-- privileges` de 01: ese solo aplica a tablas creadas por el mismo
-- rol que lo definió. Si este archivo se corre con otro usuario, la
-- tabla nace sin permisos y "no se deja leer" aunque la política
-- esté perfecta -- es el punto 3 del checklist de base-datos.md.
-- ─────────────────────────────────────────────

alter table modulos enable row level security;

drop policy if exists "modulos_lectura" on modulos;
create policy "modulos_lectura" on modulos for select
  to authenticated using (true);

drop policy if exists "modulos_superadmin_escribe" on modulos;
create policy "modulos_superadmin_escribe" on modulos for all
  to authenticated using (fn_es_super_admin()) with check (fn_es_super_admin());

grant select, insert, update, delete on modulos to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Las políticas de `recursos` y `permisos` NO se tocan: las columnas
-- nuevas de `recursos` quedan cubiertas por `recursos_lectura` /
-- `recursos_superadmin_escribe`, que son a nivel de fila y no
-- enumeran columnas.

-- ─────────────────────────────────────────────
-- ÍNDICE
--
-- El menú se arma ordenando por (grupo, orden) y filtrando activo:
-- con 7 filas da igual, pero la consulta corre en CADA login y el
-- índice deja de ser gratis de agregar el día que un colegio tenga
-- 40 módulos.
-- ─────────────────────────────────────────────

create index if not exists idx_modulos_activo_orden on modulos(activo, orden);
create index if not exists idx_recursos_modulo on recursos(modulo);

-- ═══════════════════════════════════════════════════════════
-- VERIFICACIÓN — corrida de verdad como app_user, no como postgres
-- (punto 9 del checklist de base-datos.md: el superusuario salta RLS
-- y haría parecer que una política funciona cuando ni se evalúa).
--
-- ⚠️  TRAMPA ENCONTRADA AL CORRER ESTO, vale para cualquier prueba
-- futura de RLS: NO sirve resolver el uuid con una subconsulta dentro
-- de la misma sesión de app_user, así:
--
--   select set_config('app.usuario_id',
--     (select id::text from usuarios where documento='10000007'), false);
--
-- En ese momento `app.usuario_id` todavía está sin setear, así que
-- `usuarios_ve_su_fila` no deja leer NINGUNA fila, la subconsulta
-- devuelve NULL, y set_config(nombre, NULL, ...) guarda CADENA VACÍA
-- -- no null. La siguiente sentencia falla con un error que no dice
-- nada del problema real:
--   ERROR: invalid input syntax for type uuid: ""
--   CONTEXT: SQL function "fn_rol_actual" during startup
-- Es la misma pescadilla que se muerde la cola que resolvió
-- 04-login-function.sql, pero para las pruebas a mano.
--
-- La forma correcta: sacar el uuid en una sesión aparte (como
-- postgres, o desde TablePlus) y pasarlo LITERAL. En bash:
--
--   ADMIN=$(docker exec mi-postgres psql -U postgres -d sistema_academico \
--     -t -A -c "select id from usuarios where documento='10000007'")
--   docker exec mi-postgres psql -U app_user -d sistema_academico \
--     -c "select set_config('app.usuario_id','$ADMIN',false); ..."
--
-- ─────────────────────────────────────────────
-- 1. El menú de Marta (profesora, documento 10000002). PROBADO:
--    devuelve exactamente 2 filas, y ni matrículas, ni usuarios, ni
--    reportes, ni configuración se asoman:
--
--      Académico | Notas      | Registro de notas | /notas
--      Académico | Asistencia | Asistencia        | /asistencia
--
-- select m.grupo, m.etiqueta as modulo, rec.etiqueta as vista, rec.ruta
-- from modulos m
-- join recursos rec on rec.modulo = m.codigo and rec.tipo = 'vista'
-- join permisos p on p.recurso_id = rec.id
-- join roles r on r.id = p.rol_id and r.nombre = 'profesor'
-- where m.activo and p.habilitado
-- order by m.orden, rec.orden;
--
-- 2. El mismo query con r.nombre = 'admin' -> 6 filas (todo menos
--    configuración, que es exclusiva de super_admin).
--
-- 3. Control por plan, PROBADO con los dos roles:
--    update modulos set activo = false where codigo = 'notas';
--      · con la sesión de Yolanda (admin, 10000007)   -> UPDATE 0
--      · con la sesión de Harrison (super_admin, ...1) -> UPDATE 1
--    Una secretaria no puede apagarle un módulo al colegio; el
--    operador del producto sí.
-- ═══════════════════════════════════════════════════════════
