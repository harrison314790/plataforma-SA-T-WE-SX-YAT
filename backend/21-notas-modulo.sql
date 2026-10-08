-- ============================================================
-- 21-notas-modulo.sql
-- Lo que necesita la BASE para el módulo de Notas (las dos pantallas:
-- "Registro de notas" del profesor y "Seguimiento de notas" de
-- coordinación).
--
-- 1. HISTORIAL DE CORRECCIONES (`historial_notas`). Era el pendiente
--    prioritario de base-datos.md: desde que el profesor no edita nunca,
--    cada UPDATE de una nota es una corrección administrativa, y sin
--    historial no quedaba rastro del valor anterior. Lo escribe un
--    TRIGGER, no Laravel: así no existe forma de cambiar un valor sin
--    dejar huella, aunque mañana alguien escriba otro endpoint y se
--    olvide. El motivo llega por la variable de sesión
--    `app.motivo_correccion` (Laravel la setea con set_config, igual que
--    `app.usuario_id`); sin motivo, el UPDATE se rechaza.
--
-- 2. PRÓRROGAS QUE SE PUEDEN QUITAR SIN BORRARLAS. "Quitar" una prórroga
--    no la borra: la marca `revocada_en`/`revocada_por`, y queda el
--    rastro de que existió. "Modificar" la actualiza (nueva fecha,
--    motivo y quién autorizó). Una sola prórroga viva por asignación y
--    período (índice único parcial).
--
-- 3. LA POLÍTICA DE INSERCIÓN DE NOTAS EXIGE PERÍODO ACTIVO. Hueco real
--    encontrado al preparar este módulo: la política miraba
--    `notas_habilitadas` y la fecha límite, pero NO `activo`. Con los
--    datos de prueba, 2026-4 (futuro) tiene la carga habilitada y fecha
--    límite futura, así que un profesor podía registrar notas de la
--    Cuarta Época hoy mismo. Ahora: período activo, y además la
--    prórroga no puede estar revocada.
--
-- 4. UN SOLO PERÍODO ACTIVO A LA VEZ (índice único parcial). "Iniciar
--    el siguiente período" apaga uno y prende el otro en la misma
--    transacción; el índice garantiza que nunca queden dos prendidos.
--
-- 5. Recursos y permisos de las acciones nuevas.
--
-- QUÉ NO HACE FALTA CREAR: el brief pedía `carga_habilitada` y
-- `fecha_limite_notas` por período. Ya existen desde 01: son
-- `periodos_academicos.notas_habilitadas` y `.fecha_limite_notas`.
--
-- Corré esto DESPUÉS de 20-matriculas-por-anio.sql.
-- ============================================================

begin;

-- ----------------------------------------------------------------
-- 1. historial_notas
--
-- uuid (no integer): es actividad académica sobre una persona -- ver
-- "Esquema de IDs: mixto" en base-datos.md.
--
-- Sin `on delete cascade`: las notas no se borran nunca (no hay política
-- de delete en `notas`), y si algún día alguien lo intentara como
-- superusuario, que la FK lo frene es lo correcto.
--
-- RETENCIÓN: sin purga, a propósito. Una corrección es excepcional
-- (reclamo resuelto en persona con coordinación): son decenas por año,
-- no miles. La purga de "últimos 3 períodos" que proponía base-datos.md
-- pensaba en un historial de TODO cambio; este solo guarda
-- correcciones, y borrar la prueba de que una nota se cambió es
-- justo lo que esta tabla existe para impedir.
-- ----------------------------------------------------------------
create table historial_notas (
  id              uuid primary key default gen_random_uuid(),
  nota_id         uuid not null references notas(id),
  valor_anterior  numeric(3,1) not null,
  valor_nuevo     numeric(3,1) not null,
  motivo          text not null check (length(btrim(motivo)) >= 10),
  corregido_por   uuid not null references usuarios(id),
  corregido_en    timestamptz not null default now(),
  constraint historial_notas_cambia_algo check (valor_anterior <> valor_nuevo)
);

create index idx_historial_notas_nota_id on historial_notas (nota_id);

alter table historial_notas enable row level security;

-- Coordinación ve todas las correcciones.
create policy "historial_notas_admin_lee" on historial_notas for select
  to authenticated using (fn_es_admin());

-- El profesor ve las correcciones de las notas de SUS asignaciones: su
-- pantalla dice "Corregida por coordinación el …" en la nota bloqueada,
-- y tiene derecho a saber que alguien cambió lo que él registró.
create policy "historial_notas_profesor_lee_las_suyas" on historial_notas for select
  to authenticated using (
    exists (
      select 1 from notas n
      join asignaciones a on a.id = n.asignacion_id
      where n.id = historial_notas.nota_id
        and a.profesor_id = fn_profesor_id_actual()
    )
  );

-- Solo admin inserta, y solo a su nombre. En la práctica la fila la
-- escribe el trigger de abajo dentro del UPDATE del admin (corre con sus
-- permisos), así que esta política es la que lo deja pasar.
create policy "historial_notas_admin_inserta" on historial_notas for insert
  to authenticated with check (
    fn_es_admin() and corregido_por = fn_usuario_id_actual()
  );

-- Sin update ni delete: el historial no se reescribe.
grant select, insert on historial_notas to authenticated;

-- ----------------------------------------------------------------
-- El trigger: TODA corrección deja historial, sin excepción.
--
-- Además impide que una "corrección" mueva la nota a otro estudiante,
-- otra asignación u otro período, o cambie quién la registró: la
-- política `notas_admin_gestiona` es `for all`, y sin esto un UPDATE
-- podría reescribir la fila entera con un historial que solo cuenta el
-- valor. Corregir es cambiar el número, nada más.
-- ----------------------------------------------------------------
create or replace function fn_auditar_correccion_nota()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_motivo text := nullif(btrim(current_setting('app.motivo_correccion', true)), '');
begin
  if new.estudiante_id  is distinct from old.estudiante_id
     or new.asignacion_id  is distinct from old.asignacion_id
     or new.periodo_id     is distinct from old.periodo_id
     or new.registrado_por is distinct from old.registrado_por
     or new.created_at     is distinct from old.created_at then
    raise exception 'Una corrección solo puede cambiar el valor de la nota.'
      using errcode = 'check_violation';
  end if;

  if new.valor is distinct from old.valor then
    if v_motivo is null or length(v_motivo) < 10 then
      raise exception 'Toda corrección de nota exige un motivo (app.motivo_correccion).'
        using errcode = 'check_violation';
    end if;

    insert into historial_notas (nota_id, valor_anterior, valor_nuevo, motivo, corregido_por)
    values (old.id, old.valor, new.valor, v_motivo, fn_usuario_id_actual());
  end if;

  return new;
end;
$$;

create trigger trg_auditar_correccion_nota
  before update on notas
  for each row execute function fn_auditar_correccion_nota();

-- ----------------------------------------------------------------
-- 2. Prórrogas: revocar en vez de borrar, y una viva por asignación+período
-- ----------------------------------------------------------------
alter table excepciones_plazo
  add column actualizada_en timestamptz,
  add column revocada_en    timestamptz,
  add column revocada_por   uuid references usuarios(id),
  add constraint excepciones_revocada_completa
    check ((revocada_en is null) = (revocada_por is null));

create unique index excepciones_una_viva_por_asignacion
  on excepciones_plazo (asignacion_id, periodo_id)
  where revocada_en is null;

-- Antes solo había insert para admin: no se podía ni modificar ni
-- quitar. Sin política de delete, a propósito (ver arriba).
create policy "excepciones_admin_actualiza" on excepciones_plazo for update
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

-- ----------------------------------------------------------------
-- 3. Inserción de notas del profesor: período ACTIVO y prórroga no revocada
--
-- Igual a la de 20-matriculas-por-anio.sql con dos agregados, marcados.
-- `p.activo` va en las DOS ramas del plazo: tampoco una prórroga de un
-- período ya cerrado sirve para colar notas en él después de iniciar el
-- siguiente (además, iniciar el siguiente las revoca -- ver
-- NotaPeriodoService::iniciarSiguiente).
-- ----------------------------------------------------------------
drop policy if exists "notas_profesor_inserta_dentro_de_plazo" on notas;

create policy "notas_profesor_inserta_dentro_de_plazo" on notas for insert
  to authenticated with check (
    exists (
      select 1 from asignaciones a
      where a.id = notas.asignacion_id
        and a.profesor_id = fn_profesor_id_actual()
        and a.activo = true
    )
    and exists (
      select 1 from asignaciones a
      join matriculas m on m.sede_id = a.sede_id
                       and m.grado = a.grado
                       and m.grupo = a.grupo
                       and m.anio = a.anio
      join periodos_academicos p on p.id = notas.periodo_id
                                and p.anio = a.anio
      where a.id = notas.asignacion_id
        and m.estudiante_id = notas.estudiante_id
        and m.estado = 'activa'
    )
    and exists (                                        -- NUEVO
      select 1 from periodos_academicos p
      where p.id = notas.periodo_id
        and p.activo = true
    )
    and (
      exists (
        select 1 from periodos_academicos p
        where p.id = notas.periodo_id
          and p.notas_habilitadas = true
          and now() <= p.fecha_limite_notas
      )
      or exists (
        select 1 from excepciones_plazo ex
        where ex.asignacion_id = notas.asignacion_id
          and ex.profesor_id = fn_profesor_id_actual()
          and ex.periodo_id = notas.periodo_id
          and ex.revocada_en is null                    -- NUEVO
          and now() <= ex.fecha_limite_extendida
      )
    )
  );

-- ----------------------------------------------------------------
-- 4. Un solo período activo
-- ----------------------------------------------------------------
create unique index periodos_un_solo_activo
  on periodos_academicos ((true))
  where activo;

-- ----------------------------------------------------------------
-- 5. Recursos y permisos
--
-- Cuatro botones de coordinación, separados por consecuencia (mismo
-- criterio que asignaciones, usuarios y matrículas): abrir/cerrar la
-- carga y mover la fecha es el día a día; dar prórroga es una excepción
-- individual; corregir una nota toca una calificación ya registrada;
-- iniciar el período es irreversible desde la pantalla. Separados,
-- super_admin puede darle a una secretaria las prórrogas sin darle
-- correcciones.
--
-- `accion_seguimiento_notas` (tipo 'accion', no 'vista'): la pantalla de
-- seguimiento vive en la misma ruta /notas, así que no es una entrada de
-- menú propia. Es lo que decide qué pantalla ve cada quien en Angular --
-- sin bifurcar por el string del rol, como pide angular.md -- y lo que
-- exige Laravel para devolver el avance de TODAS las asignaciones.
--
-- El estudiante deja de tener `vista_notas`: no hay pantalla de notas
-- para él en este módulo; sus notas las ve en Boletines.
-- ----------------------------------------------------------------
update recursos
   set descripcion = 'Registro de notas (profesor) y seguimiento del plazo de carga (coordinación)'
 where codigo = 'vista_notas';

update recursos
   set etiqueta = 'Registrar notas', orden = 10
 where codigo = 'btn_registrar_nota';

insert into recursos (codigo, tipo, descripcion, modulo, etiqueta, ruta, icono, orden) values
  ('accion_seguimiento_notas',  'accion', 'Ver el avance de carga de notas de todas las asignaciones',          'notas', 'Seguimiento de notas', null, null,  5),
  ('btn_controlar_plazo_notas', 'boton',  'Habilitar o cerrar la carga de notas y cambiar la fecha límite',      'notas', 'Cambiar fecha',        null, null, 20),
  ('btn_dar_prorroga',          'boton',  'Dar, modificar o quitar la prórroga individual de una asignación',     'notas', 'Dar prórroga',         null, null, 30),
  ('btn_corregir_nota',         'boton',  'Corregir una nota ya registrada, con motivo (queda en el historial)', 'notas', 'Corregir',             null, null, 40),
  ('btn_iniciar_periodo',       'boton',  'Cerrar el período activo e iniciar el siguiente',                      'notas', 'Iniciar período',      null, null, 50)
on conflict (codigo) do update
  set tipo        = excluded.tipo,
      descripcion = excluded.descripcion,
      modulo      = excluded.modulo,
      etiqueta    = excluded.etiqueta,
      orden       = excluded.orden;

insert into permisos (rol_id, recurso_id, habilitado)
select r.id, rec.id, datos.habilitado
from (values
  ('admin',      'accion_seguimiento_notas',  true),
  ('profesor',   'accion_seguimiento_notas',  false),
  ('estudiante', 'accion_seguimiento_notas',  false),

  ('admin',      'btn_controlar_plazo_notas', true),
  ('profesor',   'btn_controlar_plazo_notas', false),
  ('estudiante', 'btn_controlar_plazo_notas', false),

  ('admin',      'btn_dar_prorroga',          true),
  ('profesor',   'btn_dar_prorroga',          false),
  ('estudiante', 'btn_dar_prorroga',          false),

  ('admin',      'btn_corregir_nota',         true),
  ('profesor',   'btn_corregir_nota',         false),
  ('estudiante', 'btn_corregir_nota',         false),

  ('admin',      'btn_iniciar_periodo',       true),
  ('profesor',   'btn_iniciar_periodo',       false),
  ('estudiante', 'btn_iniciar_periodo',       false),

  ('estudiante', 'vista_notas',               false),
  ('estudiante', 'btn_registrar_nota',        false)
) as datos(rol, codigo, habilitado)
join roles r      on r.nombre = datos.rol
join recursos rec on rec.codigo = datos.codigo
on conflict (rol_id, recurso_id) do update set habilitado = excluded.habilitado;

-- ----------------------------------------------------------------
-- 6. Lo que el profesor necesita leer de `usuarios` (y nada más)
--
-- Bajo RLS el profesor no lee `usuarios` ajenos (`usuarios_ve_su_fila`):
-- su pantalla no podría decir quién es cada estudiante ni quién le
-- autorizó la prórroga. Abrirle una política de select sobre `usuarios`
-- le daría la FILA completa (email, password_hash) de cada estudiante.
-- En vez de eso, dos funciones SECURITY DEFINER que devuelven solo las
-- columnas que la pantalla muestra, y solo si la asignación es suya (o
-- si es admin). Mismo patrón que `fn_usuario_para_login` (04).
-- ----------------------------------------------------------------
create or replace function fn_estudiantes_de_asignacion(p_asignacion uuid)
returns table (
  estudiante_id    uuid,
  nombres          text,
  apellidos        text,
  documento        text,
  estado_matricula text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, u.nombres, u.apellidos, u.documento, m.estado
  from asignaciones a
  join matriculas m  on m.sede_id = a.sede_id
                    and m.grado = a.grado
                    and m.grupo = a.grupo
                    and m.anio = a.anio
  join estudiantes e on e.id = m.estudiante_id
  join usuarios u    on u.id = e.usuario_id
  where a.id = p_asignacion
    and (a.profesor_id = fn_profesor_id_actual() or fn_es_admin());
$$;

create or replace function fn_prorrogas_del_periodo(p_periodo integer)
returns table (
  id                     uuid,
  asignacion_id          uuid,
  fecha_limite_extendida timestamptz,
  motivo                 text,
  autorizado_por_nombre  text,
  autorizada_en          timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ex.id, ex.asignacion_id, ex.fecha_limite_extendida, ex.motivo,
         u.nombres || ' ' || u.apellidos,
         coalesce(ex.actualizada_en, ex.created_at)
  from excepciones_plazo ex
  join usuarios u on u.id = ex.autorizado_por
  where ex.periodo_id = p_periodo
    and ex.revocada_en is null
    and (ex.profesor_id = fn_profesor_id_actual() or fn_es_admin());
$$;

revoke all on function fn_estudiantes_de_asignacion(uuid) from public;
revoke all on function fn_prorrogas_del_periodo(integer) from public;
grant execute on function fn_estudiantes_de_asignacion(uuid) to authenticated;
grant execute on function fn_prorrogas_del_periodo(integer) to authenticated;

commit;

-- ============================================================
-- Verificación (correr aparte, como `app_user` con app.usuario_id
-- seteado a un uuid LITERAL -- nunca como `postgres`, que salta RLS)
-- ============================================================
-- -- 1. Profesor (Marta) NO puede insertar en 2026-4 aunque tenga la
-- --    carga habilitada: debe fallar con violación de RLS.
-- insert into notas (estudiante_id, asignacion_id, periodo_id, valor, registrado_por)
-- values ('<luis>', '<mat-9B>', (select id from periodos_academicos where nombre='2026-4'), 4.0, '<marta-usuario>');
--
-- -- 2. Admin corrige SIN motivo: debe fallar.
-- update notas set valor = 4.1 where id = '<nota>';
--
-- -- 3. Admin corrige CON motivo: pasa y deja una fila en historial_notas.
-- select set_config('app.motivo_correccion', 'Error de digitación; verificado con la planilla', true);
-- update notas set valor = 4.1 where id = '<nota>';
-- select * from historial_notas where nota_id = '<nota>';
--
-- -- 4. Nunca dos períodos activos:
-- select count(*) from periodos_academicos where activo;   -- 0 o 1
