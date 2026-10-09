-- ============================================================
-- NO es idempotente: se corre UNA vez, en orden. (24 sí lo es.)
-- 22-epocas-por-fecha.sql
-- La época activa sale del CALENDARIO, no de una marca a mano.
--
-- Decisión del rector: desde inicio de año se sabe cuándo abre y
-- cierra cada época. Coordinación escribe las 4 fechas una vez (pantalla
-- "Calendario de épocas" en Seguimiento de notas) y la época activa
-- cambia sola el día que toca. Reemplaza al botón "Iniciar siguiente
-- período" que agregó 21-notas-modulo.sql, que deja de existir.
--
-- 1. FUERA `periodos_academicos.activo`. Una columna que alguien tiene
--    que acordarse de cambiar el día exacto es una fuente de verdad que
--    se desincroniza; ahora la verdad es "¿hoy cae entre fecha_inicio y
--    fecha_fin?", calculada en `fn_periodo_activo_id()`.
--    "Hoy" es la fecha de COLOMBIA, no la del servidor: el VPS corre en
--    UTC, y a las 7 p. m. de Bogotá en UTC ya es mañana -- el último día
--    de una época se cortaría cinco horas antes.
--
-- 2. EL CALENDARIO SE VALIDA EN LA BASE: cierre después del inicio,
--    las dos fechas dentro del año de la época, y ninguna época se cruza
--    con otra (restricción de exclusión sobre el rango de fechas). Con
--    eso, en un día dado hay UNA época activa o NINGUNA (receso); el
--    índice `periodos_un_solo_activo` de 21 ya no hace falta.
--
-- 3. RECESO: si hoy no cae en ninguna época, nadie sube notas -- ni con
--    prórroga. La política de inserción exige que el período de la nota
--    sea el activo por fecha.
--
-- 4. Lo que leía `activo` se reescribe: la política de inserción de
--    notas y `vista_estudiantes_pendientes_promocion`. El "año escolar
--    en curso" (que Matrículas, Nudos, Porcentajes y Boletines usan) es
--    `fn_anio_escolar_actual()`: el de la época activa, o en receso el
--    de la última que ya empezó -- así en el receso de mitad de año la
--    pantalla sigue en el año correcto.
--
-- 5. Recursos: sale `btn_iniciar_periodo`, entra
--    `btn_editar_calendario_epocas`.
--
-- Corré esto DESPUÉS de 21-notas-modulo.sql. Para desarrollo, después
-- de este va 23-datos-prueba-calendario.sql.
-- ============================================================

begin;

-- ----------------------------------------------------------------
-- 1. "Hoy" en el colegio, y la época activa por fecha
-- ----------------------------------------------------------------
create or replace function fn_hoy_colegio()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

create or replace function fn_periodo_activo_id()
returns integer
language sql
stable
set search_path = public
as $$
  select p.id
  from periodos_academicos p
  where fn_hoy_colegio() between p.fecha_inicio and p.fecha_fin
  limit 1;   -- la exclusión de abajo garantiza que hay a lo sumo una
$$;

create or replace function fn_anio_escolar_actual()
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select p.anio from periodos_academicos p
      where p.fecha_inicio <= fn_hoy_colegio()
      order by p.fecha_inicio desc limit 1),
    (select min(p.anio) from periodos_academicos p),
    extract(year from fn_hoy_colegio())::integer
  );
$$;

grant execute on function fn_hoy_colegio(), fn_periodo_activo_id(), fn_anio_escolar_actual() to authenticated;

-- ----------------------------------------------------------------
-- 2. El calendario, validado por la base
-- ----------------------------------------------------------------
alter table periodos_academicos
  add constraint periodos_fin_despues_de_inicio
    check (fecha_fin >= fecha_inicio),
  add constraint periodos_fechas_en_su_anio
    check (extract(year from fecha_inicio) = anio and extract(year from fecha_fin) = anio),
  -- Sobre rangos, gist no necesita la extensión btree_gist.
  add constraint periodos_sin_cruces
    exclude using gist (daterange(fecha_inicio, fecha_fin, '[]') with &&)
    deferrable initially deferred;

-- `deferrable initially deferred`: al guardar el calendario completo se
-- actualizan las 4 épocas una por una, y en el medio dos pueden cruzarse
-- un instante (mover la 2 hacia atrás antes de mover la 1). La exclusión
-- se verifica al COMMIT, sobre el calendario ya completo.

-- ----------------------------------------------------------------
-- 3. Política de inserción de notas: período activo POR FECHA
--
-- Igual a la de 21, cambiando `p.activo = true` por
-- `p.id = fn_periodo_activo_id()`. Va también en la rama de la
-- prórroga (por la misma condición general): en receso, nadie.
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
    and notas.periodo_id = fn_periodo_activo_id()          -- CAMBIA
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
          and ex.revocada_en is null
          and now() <= ex.fecha_limite_extendida
      )
    )
  );

-- ----------------------------------------------------------------
-- 4. La vista de pendientes de promoción: año escolar por fecha
-- ----------------------------------------------------------------
create or replace view vista_estudiantes_pendientes_promocion as
with ultima_matricula as (
  select distinct on (m.estudiante_id) m.estudiante_id, m.grado, m.grupo, m.sede_id, m.anio
  from matriculas m
  where m.estado = 'activa'
  order by m.estudiante_id, m.anio desc
), anio_actual as (
  select fn_anio_escolar_actual() as anio
)
select e.id as estudiante_id,
       u.nombres,
       u.apellidos,
       um.grado as grado_anterior,
       um.grupo as grupo_anterior,
       s.nombre as sede_anterior,
       um.anio as anio_anterior,
       case when um.grado = 5 then 'primaria_a_secundaria' else 'mismo_nivel' end as tipo_transicion
from estudiantes e
join usuarios u on u.id = e.usuario_id
join ultima_matricula um on um.estudiante_id = e.id
join sedes s on s.id = um.sede_id
cross join anio_actual aa
where e.activo = true
  and um.anio < aa.anio
  and not exists (
    select 1 from matriculas m2
    where m2.estudiante_id = e.id and m2.anio = aa.anio and m2.estado = 'activa'
  );

-- ----------------------------------------------------------------
-- 5. Fuera la marca a mano
-- ----------------------------------------------------------------
drop index if exists periodos_un_solo_activo;
alter table periodos_academicos drop column activo;

-- ----------------------------------------------------------------
-- 6. Recursos
-- ----------------------------------------------------------------
delete from permisos
 where recurso_id = (select id from recursos where codigo = 'btn_iniciar_periodo');
delete from recursos where codigo = 'btn_iniciar_periodo';

insert into recursos (codigo, tipo, descripcion, modulo, etiqueta, ruta, icono, orden) values
  ('btn_editar_calendario_epocas', 'boton',
   'Escribir las fechas de inicio y cierre de las 4 épocas del año (la época activa sale de ahí)',
   'notas', 'Editar fechas', null, null, 15)
on conflict (codigo) do update
  set descripcion = excluded.descripcion,
      modulo      = excluded.modulo,
      etiqueta    = excluded.etiqueta,
      orden       = excluded.orden;

insert into permisos (rol_id, recurso_id, habilitado)
select r.id, rec.id, datos.habilitado
from (values
  ('admin',      'btn_editar_calendario_epocas', true),
  ('profesor',   'btn_editar_calendario_epocas', false),
  ('estudiante', 'btn_editar_calendario_epocas', false)
) as datos(rol, codigo, habilitado)
join roles r      on r.nombre = datos.rol
join recursos rec on rec.codigo = datos.codigo
on conflict (rol_id, recurso_id) do update set habilitado = excluded.habilitado;

commit;

-- ============================================================
-- Verificación (correr aparte)
-- ============================================================
-- select fn_hoy_colegio(), fn_periodo_activo_id(), fn_anio_escolar_actual();
--
-- -- Un cruce tiene que fallar al COMMIT:
-- begin;
-- update periodos_academicos set fecha_fin = '2026-05-01' where nombre = '2026-1';
-- commit;   -- ERROR: conflicting key value violates exclusion constraint "periodos_sin_cruces"
