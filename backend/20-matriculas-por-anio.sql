-- ============================================================
-- 20-matriculas-por-anio.sql
-- Lo que necesita la BASE para el módulo de Matrículas.
--
-- 1. CORRIGE EL GRANO DE `matriculas`: de "una fila por período" (4
--    filas idénticas al año) a "una fila por AÑO". Es la deuda que
--    09-asignaciones-por-anio.sql dejó anotada ("matriculas NO se
--    toca... es una inconsistencia real que vale la pena limpiar más
--    adelante"), y el módulo de Matrículas la vuelve imposible de
--    esquivar por dos razones:
--      · Matricular es un acto de una vez al año (en enero), no cuatro.
--      · En enero se matricula para un año cuyos períodos TODAVÍA NO
--        EXISTEN (los crea el admin después). Con `periodo_id`
--        obligatorio no habría dónde colgar la matrícula de 2027.
--    Las notas siguen siendo por período: `notas.periodo_id` no cambia.
--
-- 2. AGREGA LO QUE LA PANTALLA MUESTRA Y NO TENÍA DÓNDE GUARDARSE:
--    fecha de matrícula, quién la registró, el acudiente que matriculó,
--    y el retiro (motivo, detalle, fecha, quién). Retirar NO borra la
--    fila: queda en estado 'retirada' -- las notas ya registradas se
--    conservan y el historial dice que estuvo.
--
-- 3. REESCRIBE LO QUE DEPENDÍA DE `matriculas.periodo_id`: tres
--    políticas RLS, `fn_estudiante_cursa` y la vista de pendientes de
--    promoción. De paso, la política de inserción de notas del
--    profesor exige matrícula ACTIVA: a un estudiante retirado no se
--    le registran notas nuevas (el admin sí puede, si hiciera falta).
--
-- 4. Los tres botones del módulo con sus permisos.
--
-- Corré esto DESPUÉS de 19-usuarios-modulo.sql.
-- ============================================================

begin;

-- ----------------------------------------------------------------
-- 1. `anio`, rellenado desde el período que tenía cada fila
-- ----------------------------------------------------------------
alter table matriculas add column anio integer;

update matriculas m
set anio = p.anio
from periodos_academicos p
where p.id = m.periodo_id;

alter table matriculas alter column anio set not null;

-- ----------------------------------------------------------------
-- 2. Deduplicar: una fila por estudiante y año. Se queda la del
--    ÚLTIMO período (si alguien cambió de grupo a mitad de año, la
--    fila más reciente es la que dice dónde está hoy) y, a igualdad,
--    la activa. `matriculas` no es referenciada por ninguna otra
--    tabla, así que no hay nada que redirigir antes de borrar --
--    a diferencia de asignaciones en 09, que arrastraba notas.
-- ----------------------------------------------------------------
delete from matriculas m
using (
  select m2.id,
         row_number() over (
           partition by m2.estudiante_id, m2.anio
           order by (m2.estado = 'activa') desc, p.numero desc, m2.id
         ) as orden
  from matriculas m2
  join periodos_academicos p on p.id = m2.periodo_id
) d
where d.id = m.id
  and d.orden > 1;

-- ----------------------------------------------------------------
-- 3. Fuera `periodo_id`
--
--    Las tres políticas y la vista que leen `matriculas.periodo_id`
--    se sueltan ANTES del `drop column` -- misma trampa que ya dieron
--    07 y 09. Se recrean, ya por año, en los pasos 6 y 7.
-- ----------------------------------------------------------------
drop policy "estudiantes_profesor_ve_los_suyos" on estudiantes;
drop policy "matriculas_profesor_ve_las_suyas" on matriculas;
drop policy "notas_profesor_inserta_dentro_de_plazo" on notas;
drop view vista_estudiantes_pendientes_promocion;

alter table matriculas drop column periodo_id;  -- arrastra su FK y su índice

create index idx_matriculas_anio on matriculas (anio);

-- ----------------------------------------------------------------
-- 4. Columnas nuevas
--
-- `matriculado_por` y `retirado_por` toman su valor por DEFECTO de la
-- sesión (`fn_usuario_id_actual()`, la que setea Laravel con SET
-- LOCAL), no de lo que mande el frontend: la auditoría la escribe la
-- base. `retirado_por` no puede usar default (se llena en un UPDATE),
-- así que Laravel lo setea con el usuario autenticado -- el mismo dato
-- que ya verificó Sanctum, nunca uno del body.
--
-- `acudiente_id` apunta a la PAREJA (estudiante, acudiente) de
-- `estudiante_acudientes`, no a `acudientes` suelta: así la base
-- garantiza que quien matricula es acudiente de ESE estudiante y no
-- de otro. Con `acudiente_id` nulo la FK compuesta no se evalúa
-- (MATCH SIMPLE), que es exactamente "sin registrar".
-- ----------------------------------------------------------------
alter table matriculas
  add column fecha_matricula date not null default current_date,
  add column matriculado_por uuid default fn_usuario_id_actual(),
  add column acudiente_id    uuid,
  add column motivo_retiro   text,
  add column detalle_retiro  text,
  add column fecha_retiro    date,
  add column retirado_por    uuid;

-- Las matrículas que ya existían: fecha = inicio del primer período
-- de su año (la mejor aproximación disponible). Quién las registró no
-- se sabe y queda nulo -- inventarlo sería peor que no tenerlo.
update matriculas m
set fecha_matricula = coalesce(
  (select min(p.fecha_inicio) from periodos_academicos p where p.anio = m.anio),
  make_date(m.anio, 1, 15)
);

alter table matriculas
  add constraint matriculas_matriculado_por_fkey
    foreign key (matriculado_por) references usuarios (id),
  add constraint matriculas_retirado_por_fkey
    foreign key (retirado_por) references usuarios (id),
  add constraint matriculas_acudiente_fkey
    foreign key (estudiante_id, acudiente_id)
    references estudiante_acudientes (estudiante_id, acudiente_id),

  add constraint matriculas_estado_check
    check (estado in ('activa', 'retirada')),
  add constraint matriculas_motivo_retiro_check
    check (motivo_retiro in ('Traslado a otra institución', 'Deserción', 'Otro')),
  -- Retirada <=> tiene motivo y fecha. Activa con motivo de retiro, o
  -- retirada sin motivo, son estados que la pantalla no sabría pintar.
  add constraint matriculas_retiro_coherente
    check ((estado = 'retirada') = (motivo_retiro is not null and fecha_retiro is not null)),
  -- "Otro" sin decir cuál no le sirve a nadie dentro de un año.
  add constraint matriculas_otro_con_detalle
    check (motivo_retiro is distinct from 'Otro' or nullif(trim(detalle_retiro), '') is not null);

-- Una sola matrícula ACTIVA por estudiante y año. Las retiradas no
-- cuentan: alguien que se retiró en marzo y volvió en junio tiene dos
-- filas ese año (la retirada y la nueva), y las dos son historia real.
create unique index matriculas_una_activa_por_anio
  on matriculas (estudiante_id, anio)
  where estado = 'activa';

-- ----------------------------------------------------------------
-- 5. GRANT: `authenticated` ya tiene select/insert/update sobre la
--    tabla (02), y eso cubre las columnas nuevas. No hay DELETE a
--    propósito -- ni política ni flujo: una matrícula se RETIRA, no
--    se borra (super_admin conserva su `for all`, como en todo).
-- ----------------------------------------------------------------

-- ----------------------------------------------------------------
-- 6. Políticas RLS reescritas por año
-- ----------------------------------------------------------------
create policy "estudiantes_profesor_ve_los_suyos" on estudiantes for select
  to authenticated using (
    exists (
      select 1 from matriculas m
      join asignaciones a on a.sede_id = m.sede_id
                          and a.grado = m.grado
                          and a.grupo = m.grupo
                          and a.anio = m.anio
      where m.estudiante_id = estudiantes.id
        and a.profesor_id = fn_profesor_id_actual()
    )
  );

create policy "matriculas_profesor_ve_las_suyas" on matriculas for select
  to authenticated using (
    exists (
      select 1 from asignaciones a
      where a.profesor_id = fn_profesor_id_actual()
        and a.sede_id = matriculas.sede_id
        and a.grado = matriculas.grado
        and a.grupo = matriculas.grupo
        and a.anio = matriculas.anio
    )
  );

-- Igual a la de 15-notas-respetan-asignacion-activa.sql, con dos
-- cambios: la matrícula se cruza por AÑO (el de la asignación) y tiene
-- que estar ACTIVA; y el período de la nota tiene que ser de ese mismo
-- año -- antes lo garantizaba de rebote `m.periodo_id = notas.periodo_id`,
-- y sin él una nota de 2026-3 podría colgarse de una asignación de 2025.
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
          and now() <= ex.fecha_limite_extendida
      )
    )
  );

-- ----------------------------------------------------------------
-- 7. Función y vista que leían `periodo_id`
--
-- `fn_estudiante_cursa` (16): una función SQL no registra dependencia
-- de columnas, así que el `drop column` no la tumbó -- habría fallado
-- recién en tiempo de ejecución, la primera vez que un estudiante
-- abriera su boletín. Se reescribe acá, con el mismo contrato.
-- ----------------------------------------------------------------
create or replace function fn_estudiante_cursa(
  p_sede_id integer, p_grado smallint, p_grupo text, p_anio integer
) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from matriculas m
    where m.estudiante_id = fn_estudiante_id_actual()
      and m.sede_id = p_sede_id
      and m.grado = p_grado
      and m.grupo = p_grupo
      and m.anio = p_anio
  );
$$;

-- Misma intención que en 07 (quién del año anterior todavía no tiene
-- matrícula este año), ahora por año y solo con matrículas activas.
create view vista_estudiantes_pendientes_promocion as
with ultima_matricula as (
  select distinct on (m.estudiante_id)
         m.estudiante_id, m.grado, m.grupo, m.sede_id, m.anio
  from matriculas m
  where m.estado = 'activa'
  order by m.estudiante_id, m.anio desc
), anio_actual as (
  select p.anio
  from periodos_academicos p
  where p.activo = true
  order by p.anio desc, p.numero desc
  limit 1
)
select e.id as estudiante_id,
       u.nombres,
       u.apellidos,
       um.grado as grado_anterior,
       um.grupo as grupo_anterior,
       s.nombre as sede_anterior,
       um.anio  as anio_anterior,
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
    where m2.estudiante_id = e.id
      and m2.anio = aa.anio
      and m2.estado = 'activa'
  );

grant select on vista_estudiantes_pendientes_promocion to authenticated;

-- ----------------------------------------------------------------
-- 8. Recursos y permisos del módulo
--
-- Tres códigos, por el mismo criterio que asignaciones y usuarios:
-- matricular es el trabajo diario de secretaría; cambiar de grupo
-- mueve a alguien que ya está; retirar es la acción con consecuencias
-- (sale de las listas y no recibe notas nuevas). Separarlos deja que
-- super_admin le dé a alguien las dos primeras sin la tercera.
--
-- "Agregar acudiente" vive dentro del formulario de matricular y va
-- con `btn_matricular_estudiante`: no es una acción suelta de la
-- pantalla.
-- ----------------------------------------------------------------
update recursos
   set descripcion = 'Matricular estudiantes en una sede, grado y grupo para un año escolar'
 where codigo = 'vista_matriculas';

insert into recursos (codigo, tipo, descripcion, modulo, etiqueta, ruta, icono, orden) values
  ('btn_matricular_estudiante', 'boton', 'Matricular estudiantes (uno a uno o en lote) y registrar su acudiente', 'matriculas', 'Matricular estudiante', null, null,           10),
  ('btn_cambiar_grupo',         'boton', 'Mover una matrícula activa a otro grupo o sede del mismo grado',      'matriculas', 'Cambiar de grupo',      null, 'intercambiar', 20),
  ('btn_retirar_matricula',     'boton', 'Retirar a un estudiante del año, con motivo',                         'matriculas', 'Retirar del año',       null, 'retirar',      30)
on conflict (codigo) do update
  set descripcion = excluded.descripcion,
      modulo      = excluded.modulo,
      etiqueta    = excluded.etiqueta,
      icono       = excluded.icono,
      orden       = excluded.orden;

insert into permisos (rol_id, recurso_id, habilitado)
select r.id, rec.id, datos.habilitado
from (values
  ('admin',      'btn_matricular_estudiante', true),
  ('profesor',   'btn_matricular_estudiante', false),
  ('estudiante', 'btn_matricular_estudiante', false),

  ('admin',      'btn_cambiar_grupo',         true),
  ('profesor',   'btn_cambiar_grupo',         false),
  ('estudiante', 'btn_cambiar_grupo',         false),

  ('admin',      'btn_retirar_matricula',     true),
  ('profesor',   'btn_retirar_matricula',     false),
  ('estudiante', 'btn_retirar_matricula',     false)
) as datos(rol, codigo, habilitado)
join roles r      on r.nombre = datos.rol
join recursos rec on rec.codigo = datos.codigo
on conflict (rol_id, recurso_id) do update set habilitado = excluded.habilitado;

commit;

-- ============================================================
-- Verificación (opcional, correr aparte)
-- ============================================================
-- -- Una fila por estudiante y año:
-- select estudiante_id, anio, count(*) from matriculas
-- where estado = 'activa' group by 1, 2 having count(*) > 1;   -- 0 filas
--
-- -- Ninguna política ni función sigue mirando periodo_id de matriculas:
-- select tablename, policyname from pg_policies
-- where qual ilike '%matriculas.periodo_id%' or with_check ilike '%m.periodo_id%';
