-- ═══════════════════════════════════════════════════════════
-- Sistema Académico — Políticas RLS
-- Correr DESPUÉS de 01-esquema-inicial.sql
-- Caso de referencia: Marta Ríos (profesora, Matemáticas 9-B,
-- Escuela La Laguna) y Luis Pérez (estudiante, 9-B, 2026-1)
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- FUNCIONES AUXILIARES
-- SECURITY DEFINER: leen `usuarios` saltándose su propio RLS,
-- para no caer en recursión (una política de `usuarios` que
-- necesita leer `usuarios` para evaluarse a sí misma).
-- STABLE: Postgres cachea el resultado dentro de la misma
-- consulta en vez de re-ejecutarlas por cada fila.
-- ─────────────────────────────────────────────

create or replace function fn_usuario_id_actual() returns uuid
language sql stable security definer set search_path = public as $$
  select id from usuarios where auth_id = auth.uid();
$$;

create or replace function fn_rol_actual() returns text
language sql stable security definer set search_path = public as $$
  select r.nombre from usuarios u
  join roles r on r.id = u.rol_id
  where u.auth_id = auth.uid();
$$;

create or replace function fn_es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select fn_rol_actual() = 'admin';
$$;

create or replace function fn_estudiante_id_actual() returns uuid
language sql stable security definer set search_path = public as $$
  select e.id from estudiantes e
  join usuarios u on u.id = e.usuario_id
  where u.auth_id = auth.uid();
$$;

create or replace function fn_profesor_id_actual() returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from profesores p
  join usuarios u on u.id = p.usuario_id
  where u.auth_id = auth.uid();
$$;

-- Marta: fn_profesor_id_actual() = su id de profesora.
-- Luis:  fn_estudiante_id_actual() = su id de estudiante.

-- ─────────────────────────────────────────────
-- ACTIVAR RLS EN TODAS LAS TABLAS
-- Sin esto, aunque escribas políticas, no se aplican.
-- ─────────────────────────────────────────────

alter table roles                  enable row level security;
alter table sedes                  enable row level security;
alter table usuarios               enable row level security;
alter table estudiantes            enable row level security;
alter table profesores             enable row level security;
alter table acudientes             enable row level security;
alter table estudiante_acudientes  enable row level security;
alter table asignaturas            enable row level security;
alter table periodos_academicos    enable row level security;
alter table asignaciones           enable row level security;
alter table matriculas             enable row level security;
alter table excepciones_plazo      enable row level security;
alter table notas                  enable row level security;
alter table recursos               enable row level security;
alter table permisos               enable row level security;
alter table documentos             enable row level security;

-- ─────────────────────────────────────────────
-- CATÁLOGOS DE SOLO LECTURA PARA TODOS LOS AUTENTICADOS
-- roles, sedes, asignaturas, periodos, recursos, permisos:
-- no son datos sensibles, y Angular los necesita para
-- llenar selects y evaluar *appHasRole. Solo admin escribe.
-- ─────────────────────────────────────────────

create policy "roles_lectura" on roles for select
  to authenticated using (true);
create policy "roles_admin_escribe" on roles for all
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

create policy "sedes_lectura" on sedes for select
  to authenticated using (true);
create policy "sedes_admin_escribe" on sedes for all
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

create policy "asignaturas_lectura" on asignaturas for select
  to authenticated using (true);
create policy "asignaturas_admin_escribe" on asignaturas for all
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

create policy "periodos_lectura" on periodos_academicos for select
  to authenticated using (true);
create policy "periodos_admin_escribe" on periodos_academicos for all
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

create policy "recursos_lectura" on recursos for select
  to authenticated using (true);
create policy "recursos_admin_escribe" on recursos for all
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

create policy "permisos_lectura" on permisos for select
  to authenticated using (true);
create policy "permisos_admin_escribe" on permisos for all
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

-- ─────────────────────────────────────────────
-- USUARIOS
-- Cada quien ve su propia fila. Admin ve y gestiona todas.
-- Nadie más allá de admin puede cambiar rol o sede de otro.
-- ─────────────────────────────────────────────

create policy "usuarios_ve_su_fila" on usuarios for select
  to authenticated using (auth_id = auth.uid() or fn_es_admin());

create policy "usuarios_admin_gestiona" on usuarios for all
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

-- ─────────────────────────────────────────────
-- ESTUDIANTES
-- Luis ve su propia fila. Marta ve a los estudiantes que
-- están matriculados en alguna de sus asignaciones (no toda
-- la sede, solo los que le corresponden a ella).
-- ─────────────────────────────────────────────

create policy "estudiantes_ve_su_fila" on estudiantes for select
  to authenticated using (
    usuario_id = fn_usuario_id_actual() or fn_es_admin()
  );

create policy "estudiantes_profesor_ve_los_suyos" on estudiantes for select
  to authenticated using (
    exists (
      select 1 from matriculas m
      join asignaciones a on a.sede_id = m.sede_id
                          and a.grado = m.grado
                          and a.periodo_id = m.periodo_id
      where m.estudiante_id = estudiantes.id
        and a.profesor_id = fn_profesor_id_actual()
    )
  );

create policy "estudiantes_admin_gestiona" on estudiantes for insert
  to authenticated with check (fn_es_admin());
create policy "estudiantes_admin_actualiza" on estudiantes for update
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

-- ─────────────────────────────────────────────
-- PROFESORES
-- ─────────────────────────────────────────────

create policy "profesores_ve_su_fila" on profesores for select
  to authenticated using (
    usuario_id = fn_usuario_id_actual() or fn_es_admin()
  );

create policy "profesores_admin_gestiona" on profesores for insert
  to authenticated with check (fn_es_admin());
create policy "profesores_admin_actualiza" on profesores for update
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

-- ─────────────────────────────────────────────
-- ACUDIENTES — administración centralizada por ahora.
-- Cuando un acudiente tenga cuenta propia, se agrega una
-- política de "ve sus propios estudiantes vinculados".
-- ─────────────────────────────────────────────

create policy "acudientes_admin" on acudientes for all
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

create policy "estudiante_acudientes_admin" on estudiante_acudientes for all
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

-- ─────────────────────────────────────────────
-- ASIGNACIONES
-- Marta ve las asignaciones que son suyas. Admin, todas.
-- Los estudiantes no necesitan ver esta tabla directo.
-- ─────────────────────────────────────────────

create policy "asignaciones_profesor_ve_las_suyas" on asignaciones for select
  to authenticated using (
    profesor_id = fn_profesor_id_actual() or fn_es_admin()
  );

create policy "asignaciones_admin_gestiona" on asignaciones for insert
  to authenticated with check (fn_es_admin());
create policy "asignaciones_admin_actualiza" on asignaciones for update
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

-- ─────────────────────────────────────────────
-- MATRÍCULAS
-- Luis ve la suya. Marta ve las de sus estudiantes asignados.
-- ─────────────────────────────────────────────

create policy "matriculas_estudiante_ve_la_suya" on matriculas for select
  to authenticated using (
    estudiante_id = fn_estudiante_id_actual() or fn_es_admin()
  );

create policy "matriculas_profesor_ve_las_suyas" on matriculas for select
  to authenticated using (
    exists (
      select 1 from asignaciones a
      where a.profesor_id = fn_profesor_id_actual()
        and a.sede_id = matriculas.sede_id
        and a.grado = matriculas.grado
        and a.periodo_id = matriculas.periodo_id
    )
  );

create policy "matriculas_admin_gestiona" on matriculas for insert
  to authenticated with check (fn_es_admin());
create policy "matriculas_admin_actualiza" on matriculas for update
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

-- ─────────────────────────────────────────────
-- EXCEPCIONES DE PLAZO
-- Marta puede ver si le abrieron una excepción a ella.
-- Solo admin la crea.
-- ─────────────────────────────────────────────

create policy "excepciones_profesor_ve_las_suyas" on excepciones_plazo for select
  to authenticated using (
    profesor_id = fn_profesor_id_actual() or fn_es_admin()
  );

create policy "excepciones_admin_crea" on excepciones_plazo for insert
  to authenticated with check (fn_es_admin());

-- ─────────────────────────────────────────────
-- NOTAS — el núcleo de todo lo que hemos hablado.
-- ─────────────────────────────────────────────

-- Luis lee SIEMPRE sus propias notas, sin importar plazos ni
-- si el período está cerrado. El plazo restringe ESCRITURA de
-- Marta, nunca la LECTURA de Luis sobre lo suyo — son permisos
-- distintos y no deben mezclarse.
create policy "notas_estudiante_lee_las_suyas" on notas for select
  to authenticated using (
    estudiante_id = fn_estudiante_id_actual()
  );

-- Marta lee las notas de sus propias asignaciones.
create policy "notas_profesor_lee_las_suyas" on notas for select
  to authenticated using (
    exists (
      select 1 from asignaciones a
      where a.id = notas.asignacion_id
        and a.profesor_id = fn_profesor_id_actual()
    )
  );

create policy "notas_admin_lee_todo" on notas for select
  to authenticated using (fn_es_admin());

-- Marta INSERTA una nota solo si:
--  1. la asignación es suya,
--  2. el estudiante está matriculado en esa sede/grado/período
--     (evita que registre una nota de un estudiante que no es
--     suyo, aunque conozca su id),
--  3. Y (el período sigue habilitado y dentro de fecha
--      O existe una excepción vigente para ella en esa
--      asignación puntual).
create policy "notas_profesor_inserta_dentro_de_plazo" on notas for insert
  to authenticated with check (
    exists (
      select 1 from asignaciones a
      where a.id = asignacion_id
        and a.profesor_id = fn_profesor_id_actual()
    )
    and exists (
      select 1 from matriculas m
      join asignaciones a on a.sede_id = m.sede_id
                          and a.grado = m.grado
                          and a.periodo_id = m.periodo_id
      where a.id = asignacion_id
        and m.estudiante_id = notas.estudiante_id
    )
    and (
      exists (
        select 1 from asignaciones a
        join periodos_academicos p on p.id = a.periodo_id
        where a.id = asignacion_id
          and p.notas_habilitadas = true
          and now() <= p.fecha_limite_notas
      )
      or exists (
        select 1 from excepciones_plazo ex
        where ex.asignacion_id = notas.asignacion_id
          and ex.profesor_id = fn_profesor_id_actual()
          and now() <= ex.fecha_limite_extendida
      )
    )
  );

-- La misma regla aplica para EDITAR una nota ya cargada.
create policy "notas_profesor_actualiza_dentro_de_plazo" on notas for update
  to authenticated
  using (
    exists (
      select 1 from asignaciones a
      where a.id = notas.asignacion_id
        and a.profesor_id = fn_profesor_id_actual()
    )
  )
  with check (
    exists (
      select 1 from asignaciones a
      where a.id = asignacion_id
        and a.profesor_id = fn_profesor_id_actual()
    )
    and (
      exists (
        select 1 from asignaciones a
        join periodos_academicos p on p.id = a.periodo_id
        where a.id = asignacion_id
          and p.notas_habilitadas = true
          and now() <= p.fecha_limite_notas
      )
      or exists (
        select 1 from excepciones_plazo ex
        where ex.asignacion_id = notas.asignacion_id
          and ex.profesor_id = fn_profesor_id_actual()
          and now() <= ex.fecha_limite_extendida
      )
    )
  );

-- Admin puede todo, incluida corrección fuera de plazo
-- por una reclamación resuelta.
create policy "notas_admin_gestiona" on notas for all
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

-- Nadie borra una nota, ni siquiera admin, ni siquiera vía
-- panel de Supabase con un rol autenticado normal. Una nota
-- mal cargada se CORRIGE (queda el update en notas_historial
-- cuando agreguemos esa tabla), nunca desaparece sin rastro.
-- No se crea política de DELETE a propósito: sin una política
-- que la permita, la operación queda bloqueada por RLS.

-- ─────────────────────────────────────────────
-- DOCUMENTOS
-- ─────────────────────────────────────────────

create policy "documentos_estudiante_ve_los_suyos" on documentos for select
  to authenticated using (
    estudiante_id = fn_estudiante_id_actual() or fn_es_admin()
  );

create policy "documentos_admin_gestiona" on documentos for insert
  to authenticated with check (fn_es_admin());

-- ═══════════════════════════════════════════════════════════
-- Verificación rápida después de correr esto:
--
-- 1. Con el JWT de Luis: select * from notas;
--    -> debe devolver solo las notas donde estudiante_id = Luis.
--
-- 2. Con el JWT de Marta: intentar
--    insert into notas (estudiante_id, asignacion_id, valor,
--    registrado_por) values (<id de un estudiante que NO es
--    suyo>, <su propia asignación>, 4.0, <su usuario_id>);
--    -> debe fallar, aunque el insert esté bien formado.
--
-- 3. Con el JWT de Marta, después de vencido fecha_limite_notas
--    y sin excepción vigente: el mismo insert sobre un
--    estudiante que SÍ es suyo -> debe fallar igual.
-- ═══════════════════════════════════════════════════════════
