-- ═══════════════════════════════════════════════════════════
-- Sistema Académico — Función auxiliar para login (Postgres puro)
-- Correr DESPUÉS de 01-esquema-inicial.sql y 02-politicas-rls.sql.
-- No modifica nada existente, solo agrega esta función.
--
-- POR QUÉ HACE FALTA: antes de autenticar no existe ningún
-- `app.usuario_id` seteado en la sesión -- fn_usuario_id_actual()
-- devuelve null, así que la política "usuarios_ve_su_fila" (id =
-- fn_usuario_id_actual() or fn_es_admin()) nunca matchea para NADIE
-- todavía. Sin esta función, Laravel no tiene forma de leer la fila
-- de `usuarios` para comparar el email/password_hash en el login.
--
-- SECURITY DEFINER corre con los privilegios de quien creó la función
-- (el dueño de la base, no `app_user`), así que sí puede leer la fila
-- puntual que hace falta -- nada más. No expone más que email,
-- password_hash y rol_id, y solo para un email exacto.
-- ═══════════════════════════════════════════════════════════

create or replace function fn_usuario_para_login(p_email text)
returns table (id uuid, password_hash text, rol_id integer)
language sql stable security definer set search_path = public as $$
  select u.id, u.password_hash, u.rol_id
  from usuarios u
  where u.email = p_email and u.activo = true;
$$;

grant execute on function fn_usuario_para_login(text) to authenticated;

-- ═══════════════════════════════════════════════════════════
-- Verificación:
-- select * from fn_usuario_para_login('admin@sedeprincipal.edu.co');
-- -> debe devolver una fila, incluso conectado como app_user (no como
--    superusuario) y sin haber seteado app.usuario_id todavía.
-- ═══════════════════════════════════════════════════════════
