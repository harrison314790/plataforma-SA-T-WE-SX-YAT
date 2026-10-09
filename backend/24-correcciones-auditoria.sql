-- ============================================================
-- 24-correcciones-auditoria.sql
-- Lo que la BASE tenía que garantizar y no garantizaba, según la
-- auditoría del 2026-10-07 (AUDITORIA-2026-10-07.md en la raíz).
--
-- C1. Una asignación con notas no cambia de curso, materia ni año.
--     Antes, `PUT /asignaciones/{id}` movía las notas de 9-B a 8-A, de
--     Español a Matemáticas o de 2026 a 2025 sin que nada lo frenara.
--     Laravel ya lo valida con un mensaje legible; este trigger es la
--     garantía para cualquier otro camino. Cambiar el PROFESOR sí se
--     permite: es el reemplazo de un docente, y las notas siguen siendo
--     de esa materia en ese curso.
--
-- C2. Una materia de un curso la dicta UN solo docente por año. La
--     unicidad incluía `profesor_id`, así que Matemáticas 9-B 2026 podía
--     tener a Marta y a Carlos: cada uno subía su nota, el nudo promediaba
--     las dos y el boletín mostraba una sola. Decisión: unicidad sin
--     profesor. Si el colegio llegara a necesitar dos docentes para la
--     misma materia de un curso, primero hay que definir cómo se combinan
--     sus notas.
--
-- C3. Nadie borra una nota. `notas_admin_gestiona` era `FOR ALL` y por
--     eso incluía DELETE: un admin podía borrar una nota directo en la
--     base. Se reemplaza por políticas explícitas (insert/update; select
--     ya lo cubre `notas_admin_lee_todo`), y se revoca el privilegio
--     DELETE como segundo cinturón.
--
-- M2. Un token de un usuario desactivado deja de servir aunque la
--     desactivación no pase por la pantalla de Usuarios (que sí borra
--     los tokens). `fn_usuario_activo` la usa el middleware
--     EstablecerUsuarioActual en cada request: tiene que ser SECURITY
--     DEFINER porque corre ANTES de que exista `app.usuario_id`, igual
--     que `fn_usuario_para_login`.
--
-- M4. El login no distingue mayúsculas en el correo. Los correos se
--     guardan en minúsculas (UsuarioRequest); el teclado del celular pone
--     la primera letra en mayúscula y el login fallaba.
--
-- B4. Fuera `btn_exportar_notas`: recurso sembrado sin ruta ni botón.
--
-- Corré esto DESPUÉS de 23. Idempotente: se puede volver a correr.
-- ============================================================

begin;

-- ----------------------------------------------------------------
-- C1. Asignación con notas: curso, materia y año quedan fijos
-- ----------------------------------------------------------------
create or replace function fn_asignacion_con_notas_inmutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.asignatura_id, new.sede_id, new.grado, new.grupo, new.anio)
     is distinct from (old.asignatura_id, old.sede_id, old.grado, old.grupo, old.anio)
     and exists (select 1 from notas n where n.asignacion_id = old.id) then
    raise exception 'Esta asignación ya tiene notas: no se puede cambiar de curso, materia ni año.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_asignacion_con_notas_inmutable on asignaciones;
create trigger trg_asignacion_con_notas_inmutable
  before update on asignaciones
  for each row execute function fn_asignacion_con_notas_inmutable();

-- ----------------------------------------------------------------
-- C2. Una materia por curso y año, sin importar el profesor
-- ----------------------------------------------------------------
alter table asignaciones drop constraint if exists asignaciones_unicidad_anual;
alter table asignaciones drop constraint if exists asignaciones_una_por_materia_curso_anio;
alter table asignaciones
  add constraint asignaciones_una_por_materia_curso_anio
  unique (asignatura_id, sede_id, grado, grupo, anio);

-- ----------------------------------------------------------------
-- C3. Nadie borra una nota
-- ----------------------------------------------------------------
drop policy if exists "notas_admin_gestiona" on notas;
drop policy if exists "notas_admin_inserta" on notas;
drop policy if exists "notas_admin_corrige" on notas;

create policy "notas_admin_inserta" on notas for insert
  to authenticated with check (fn_es_admin());

create policy "notas_admin_corrige" on notas for update
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

-- Sin política de delete, RLS ya lo bloquea; sin el privilegio, ni
-- siquiera llega a evaluar políticas. Mismo criterio para el historial.
revoke delete on notas from authenticated;
revoke update, delete on historial_notas from authenticated;

-- ----------------------------------------------------------------
-- M2. ¿El dueño del token sigue activo?
-- ----------------------------------------------------------------
create or replace function fn_usuario_activo(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select u.activo from usuarios u where u.id = p_usuario), false);
$$;

revoke all on function fn_usuario_activo(uuid) from public;
grant execute on function fn_usuario_activo(uuid) to authenticated;

-- ----------------------------------------------------------------
-- M4. Login sin distinguir mayúsculas en el correo
-- ----------------------------------------------------------------
create or replace function fn_usuario_para_login(p_email text)
returns table (id uuid, password_hash text, rol_id integer)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.password_hash, u.rol_id
  from usuarios u
  where lower(u.email) = lower(btrim(p_email)) and u.activo = true;
$$;

-- ----------------------------------------------------------------
-- B4. Recurso huérfano
-- ----------------------------------------------------------------
delete from permisos where recurso_id in (select id from recursos where codigo = 'btn_exportar_notas');
delete from recursos where codigo = 'btn_exportar_notas';

commit;

-- ============================================================
-- Verificación (correr aparte, como app_user con app.usuario_id de un admin)
-- ============================================================
-- delete from notas where id = '<una nota>';            -- ERROR: permission denied
-- update asignaciones set grado = 8 where id = '<una con notas>';  -- ERROR: ya tiene notas
-- select fn_usuario_para_login('SECRETARIA@SEDEPRINCIPAL.EDU.CO');  -- 1 fila
