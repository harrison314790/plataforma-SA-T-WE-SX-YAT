-- ============================================================
-- 11-asignaciones-modulo.sql
-- Todo lo que le faltaba a la BASE para que el módulo de
-- Asignaciones exista de verdad (las tres capas, no solo la
-- pantalla). Son cuatro cosas independientes, y ninguna es
-- cosmética:
--
--   1. `asignaciones.activo` -- hoy no existe, y sin esa columna
--      la única salida frente a una asignación con notas sería
--      "no se puede hacer nada". Ver el bloque 1.
--   2. Columnas de auditoría (`creado_por`, `created_at`) -- el
--      checklist de references/base-datos.md las exige en
--      cualquier tabla que un admin pueda escribir, y hasta hoy
--      `asignaciones` no se escribía desde ningún endpoint.
--   3. La política RLS de DELETE, que falta desde
--      02-politicas-rls.sql (hay select/insert/update, no delete).
--   4. El registro del módulo en `modulos`/`recursos`/`permisos`
--      -- 05-navegacion.sql sembró siete módulos y `asignaciones`
--      no estaba entre ellos, así que hoy no puede aparecer en el
--      menú ni pasar el middleware `requiere.permiso`.
--
-- Corré esto DESPUÉS de 10-vista-boletin-anual.sql.
-- ============================================================

begin;

-- ----------------------------------------------------------------
-- 1. asignaciones.activo
--
-- POR QUÉ HACE FALTA, Y POR QUÉ NO ALCANZA CON BORRAR:
-- `notas.asignacion_id` NO tiene `on delete cascade` a propósito
-- (ver SKILL.md): borrar una asignación con notas cargadas falla
-- con el error de FK 23503 de Postgres, y así debe seguir siendo
-- -- perder las notas de Marta en 9-B por un clic distraído sería
-- exactamente el riesgo que este proyecto existe para evitar.
--
-- Pero "no se puede borrar" no es una respuesta útil cuando lo que
-- pasó de verdad es que el profesor ya no dicta esa materia. Sin
-- una columna de estado, la asignación equivocada se queda viva
-- para siempre: el profesor la sigue viendo y puede seguir
-- registrando notas nuevas ahí.
--
-- `activo = false` resuelve eso sin tocar el histórico: las notas
-- ya registradas siguen intactas (y siguen apareciendo en
-- vista_boletin_anual, que consulta `notas`, no `asignaciones.activo`),
-- pero la asignación deja de ofrecerse para trabajo nuevo. Es el
-- mismo patrón que 08-oferta-grados-por-sede.sql ya eligió para
-- "eliminar" un grado/grupo con historial.
--
-- OJO -- LO QUE ESTA COLUMNA NO HACE POR SÍ SOLA: desactivar no
-- impide que el profesor registre una nota nueva contra esa
-- asignación. La política `notas_profesor_inserta_dentro_de_plazo`
-- no mira `a.activo`; agregarle esa condición cambiaría el
-- comportamiento de notas, que está fuera del alcance de este
-- archivo. Hoy la desactivación filtra la UI (el listado y los
-- selectores) y deja el histórico en paz; si se quiere que además
-- bloquee la escritura de notas, hay que reescribir esa política
-- en una migración propia del módulo de notas, con su prueba por
-- rol -- ver la nota final de este archivo.
-- ----------------------------------------------------------------
alter table asignaciones
  add column if not exists activo boolean not null default true;

comment on column asignaciones.activo is
  'false = el profesor ya no dicta esto. Las notas ya registradas se conservan; la asignación deja de ofrecerse para trabajo nuevo. Ver 11-asignaciones-modulo.sql.';

-- ----------------------------------------------------------------
-- 2. Auditoría mínima (punto 6 del checklist de base-datos.md)
--
-- `creado_por` es NULLABLE a propósito y no es un descuido: las
-- filas que ya existen vienen de 03-datos-prueba.sql, donde nadie
-- las creó desde la aplicación. Ponerlo `not null` obligaría a
-- inventarle un autor a datos históricos -- peor que admitir "no
-- se sabe". Las filas nuevas sí lo traen siempre, porque las
-- escribe AsignacionService con el usuario de la sesión.
-- ----------------------------------------------------------------
alter table asignaciones
  add column if not exists creado_por uuid,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'asignaciones_creado_por_fkey') then
    alter table asignaciones
      add constraint asignaciones_creado_por_fkey
      foreign key (creado_por) references usuarios(id);
  end if;
end $$;

comment on column asignaciones.creado_por is
  'Quién creó la asignación desde la app. NULL en las filas sembradas por 03-datos-prueba.sql, que no tienen autor real.';

-- ----------------------------------------------------------------
-- 3. Índices de los filtros de la pantalla (punto 5 del checklist)
--
-- El listado filtra por sede+grado+grupo y por asignatura. Sin
-- índice, cada consulta filtrada escanea la tabla entera Y evalúa
-- la política RLS fila por fila -- el costo se paga dos veces.
-- `profesor_id` y `anio` ya están indexados (01 y 09).
-- ----------------------------------------------------------------
create index if not exists idx_asignaciones_asignatura_id
  on asignaciones (asignatura_id);

create index if not exists idx_asignaciones_sede_grado_grupo
  on asignaciones (sede_id, grado, grupo);

-- ----------------------------------------------------------------
-- 4. RLS: la política de DELETE que faltaba
--
-- 02-politicas-rls.sql le dio a `asignaciones` select (profesor
-- dueño o admin), insert (admin) y update (admin) -- pero ninguna
-- de delete. Con RLS activo y sin política, un DELETE no falla:
-- simplemente no borra nada (0 filas afectadas). Eso es lo peor de
-- los dos mundos, porque la aplicación cree que borró.
--
-- Nótese la asimetría deliberada con el resto del archivo: es
-- `fn_es_admin()`, igual que insert/update. El profesor nunca
-- borra una asignación, ni la suya.
-- ----------------------------------------------------------------
drop policy if exists "asignaciones_admin_elimina" on asignaciones;
create policy "asignaciones_admin_elimina" on asignaciones for delete
  to authenticated using (fn_es_admin());

-- ----------------------------------------------------------------
-- 5. El módulo en el menú
--
-- Va en el grupo 'Académico' con orden 15: entre Notas (10) y
-- Matrículas (20). El orden del sistema se numera de corrido y el
-- grupo hereda su posición del orden mínimo de sus módulos (ver
-- 05-navegacion.sql), así que el 15 alcanza -- no hay que
-- renumerar nada.
--
-- El ícono es 'personas' (del set del escudo, ver
-- core/navegacion/iconos.ts): la asignación es, literalmente,
-- quién dicta qué. No se inventa un ícono nuevo.
-- ----------------------------------------------------------------
insert into modulos (codigo, etiqueta, grupo, icono, orden, activo) values
  ('asignaciones', 'Asignaciones', 'Académico', 'personas', 15, true)
on conflict (codigo) do update
  set etiqueta = excluded.etiqueta,
      grupo    = excluded.grupo,
      icono    = excluded.icono,
      orden    = excluded.orden;

-- ----------------------------------------------------------------
-- 6. Recursos: una vista y tres botones
--
-- Tres botones separados y no uno solo ('btn_gestionar_asignaciones')
-- porque las tres acciones tienen consecuencias distintas: crear y
-- editar son reversibles, eliminar no. Separarlos deja que
-- super_admin, el día que este sistema se instale en otro colegio,
-- le dé a una secretaria el alta de asignaciones sin darle el
-- borrado -- sin tocar código.
--
-- El check `recursos_vista_tiene_navegacion` de 05-navegacion.sql
-- exige etiqueta y ruta para tipo='vista'; los botones las dejan
-- en null, que es lo correcto (un botón no es entrada de menú).
-- ----------------------------------------------------------------
insert into recursos (codigo, tipo, descripcion, modulo, etiqueta, ruta, icono, orden) values
  ('vista_asignaciones',    'vista', 'Qué asignatura dicta cada profesor, por grado y grupo', 'asignaciones', 'Asignaciones', '/asignaciones', 'personas', 10),
  ('btn_crear_asignacion',  'boton', 'Crear una asignación nueva',                            'asignaciones', null, null, null, 100),
  ('btn_editar_asignacion', 'boton', 'Editar o desactivar/reactivar una asignación',          'asignaciones', null, null, null, 100),
  ('btn_eliminar_asignacion','boton','Eliminar definitivamente una asignación sin notas',     'asignaciones', null, null, null, 100)
on conflict (codigo) do update
  set descripcion = excluded.descripcion,
      modulo      = excluded.modulo,
      etiqueta    = excluded.etiqueta,
      ruta        = excluded.ruta,
      icono       = excluded.icono,
      orden       = excluded.orden;

-- ----------------------------------------------------------------
-- 7. Permisos: exclusivo del nivel admin
--
-- super_admin NO aparece, y no es un olvido: pasa cualquier código
-- sin fila sembrada, tanto en RLS (`fn_es_super_admin()` es bypass
-- total) como en el middleware RequierePermiso. Sembrarle filas
-- crearía una segunda fuente de verdad -- ver references/permisos.md.
--
-- Las negativas de profesor y estudiante SÍ se siembran, aunque
-- "sin fila" también los bloquearía: sin la fila, el mapa de
-- permisos que recibe Angular no trae la clave, y se pierde la
-- diferencia entre "no habilitado para tu rol" y "este recurso no
-- existe" -- que son los dos mensajes distintos que el escritorio
-- muestra. Misma razón que el paso 6 de 05-navegacion.sql.
-- ----------------------------------------------------------------
insert into permisos (rol_id, recurso_id, habilitado)
select r.id, rec.id, datos.habilitado
from (values
  ('admin',      'vista_asignaciones',     true),
  ('profesor',   'vista_asignaciones',     false),
  ('estudiante', 'vista_asignaciones',     false),

  ('admin',      'btn_crear_asignacion',   true),
  ('profesor',   'btn_crear_asignacion',   false),
  ('estudiante', 'btn_crear_asignacion',   false),

  ('admin',      'btn_editar_asignacion',  true),
  ('profesor',   'btn_editar_asignacion',  false),
  ('estudiante', 'btn_editar_asignacion',  false),

  ('admin',      'btn_eliminar_asignacion', true),
  ('profesor',   'btn_eliminar_asignacion', false),
  ('estudiante', 'btn_eliminar_asignacion', false)
) as datos(rol, codigo, habilitado)
join roles r      on r.nombre = datos.rol
join recursos rec on rec.codigo = datos.codigo
on conflict (rol_id, recurso_id) do update set habilitado = excluded.habilitado;

-- ----------------------------------------------------------------
-- 8. Reparación de consistencia: malla_curricular está VACÍA
--
-- Hueco real encontrado al construir este módulo, no hipotético:
-- 07-grado-grupo-malla.sql CREA la tabla `malla_curricular` pero
-- nunca la puebla, y 03-datos-prueba.sql tampoco. Resultado, contra
-- la base de desarrollo: `select count(*) from malla_curricular`
-- devuelve 0, mientras existen 4 asignaciones vivas.
--
-- Por qué eso rompe este módulo: el formulario filtra el selector de
-- asignatura contra la malla (regla de SKILL.md -- nunca una
-- combinación libre grado+materia). Con la tabla vacía, el selector
-- no ofrece ninguna materia para ningún grado, y ni siquiera se
-- puede volver a guardar una asignación que YA existe -- la
-- validación de edición la rechazaría por "no está en la malla".
--
-- Lo que hace este bloque, y lo que NO hace: deriva las filas de
-- malla que las asignaciones existentes YA implican (si Marta dicta
-- Matemáticas en 9, entonces grado 9 ve Matemáticas). No inventa
-- nada: cero materias nuevas, cero grados nuevos. Es reparar una
-- inconsistencia, no sembrar un plan de estudios.
--
-- ⚠️ ESTO NO ES LA MALLA REAL DE LA INSTITUCIÓN. Es el piso mínimo
-- para que lo que ya está cargado sea coherente. La malla de verdad
-- (qué ve cada uno de los 11 grados) la carga la institución desde
-- su propia pantalla, que todavía no existe -- mientras tanto, crear
-- una asignación de una materia que nunca se dictó en ese grado va a
-- fallar con "no está en la malla curricular", y es el
-- comportamiento correcto.
-- ----------------------------------------------------------------
insert into malla_curricular (grado, asignatura_id)
select distinct grado, asignatura_id from asignaciones
on conflict (grado, asignatura_id) do nothing;

commit;

-- ============================================================
-- Verificación (opcional, correr aparte)
-- ============================================================
-- -- la columna nueva y la auditoría:
-- select id, grado, grupo, anio, activo, creado_por, created_at
-- from asignaciones order by anio desc, grado, grupo limit 10;
--
-- -- las cuatro políticas de asignaciones (select/insert/update/delete):
-- select policyname, cmd from pg_policies
-- where tablename = 'asignaciones' order by cmd;
--
-- -- el módulo y sus permisos por rol:
-- select r.nombre as rol, rec.codigo, p.habilitado
-- from permisos p
-- join roles r on r.id = p.rol_id
-- join recursos rec on rec.id = p.recurso_id
-- where rec.modulo = 'asignaciones'
-- order by rec.codigo, r.nombre;
--
-- ⚠️ Probar como `app_user` con `select set_config('app.usuario_id', '<uuid literal>', false)`,
-- NUNCA como el superusuario `postgres` -- salta RLS y haría parecer que
-- la política de delete funciona sin evaluarse. Y sacar el uuid en una
-- sesión aparte, nunca con una subconsulta dentro de la misma sesión
-- (ver la trampa del punto 9 del checklist en references/base-datos.md).

-- ============================================================
-- Pendiente que este archivo NO resuelve, dicho explícitamente
-- ============================================================
-- `notas_profesor_inserta_dentro_de_plazo` sigue sin mirar
-- `asignaciones.activo`: un profesor con una asignación desactivada
-- todavía podría insertar una nota ahí si conoce el id (la UI ya no
-- se la ofrece, pero la UI no es seguridad). Cerrar eso es reescribir
-- una política del módulo de NOTAS, con su propia prueba por rol --
-- fuera del alcance de este archivo, que solo toca asignaciones.
