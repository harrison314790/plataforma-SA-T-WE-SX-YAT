#!/usr/bin/env bash
# Inicializa la base de la DEMO desde cero y deja todo arriba.
#   bash demo/init-db.sh
#
# 1. Crea demo/.env y demo/backend.env (secretos aleatorios, APP_KEY).
# 2. Crea los roles (app_user con la clave de demo/.env).
# 3. Aplica backend/NN-*.sql en orden numérico, como el dueño de la base.
# 4. `php artisan migrate` (solo tablas internas de Laravel).
# 5. Levanta app + web y verifica RLS.
#
# Se niega a correr sobre una base que ya tiene el esquema: para volver
# a empezar está demo/reset.sh.

. "$(dirname "$0")/lib.sh"

# Scripts que NO se aplican en la demo, con el porqué:
#   25-preparar-piloto.sql  -> BORRA a toda la gente de prueba y crea
#                              cuentas reales de super_admin/admin. Es
#                              para el servidor del piloto, no la demo.
#   26-crear-anio-escolar.sql -> necesita -v anio=NNNN y es el trámite de
#                              cada enero; 2026 ya viene completo.
OMITIR=" 25-preparar-piloto.sql 26-crear-anio-escolar.sql "

asegurar_secretos
esperar_db

if [ "$(psql_db -tAc "select to_regclass('public.usuarios') is not null")" = "t" ]; then
  echo "La base de la demo ya está inicializada. Para empezar de cero: bash demo/reset.sh" >&2
  exit 1
fi

echo "· Roles"
crear_roles

echo "· Scripts SQL (backend/, orden numérico)"
for ruta in $(ls ../backend/[0-9][0-9]-*.sql | sort); do
  f="$(basename "$ruta")"
  case "$OMITIR" in *" $f "*) echo "  - $f  (omitido)"; continue ;; esac
  if ! salida="$(psql_db -q -f - < "$ruta" 2>&1)"; then
    echo "  ✗ $f FALLÓ:" >&2
    echo "$salida" | grep -iE 'error|line|línea' | head -5 >&2
    exit 1
  fi
  echo "  ✓ $f"
done

echo "· Migraciones de Laravel (personal_access_tokens, cache, jobs)"
# app_user no puede crear tablas (a propósito), así que la migración
# corre UNA vez con el dueño de la base. Los GRANT para `authenticated`
# salen de los ALTER DEFAULT PRIVILEGES de 01-esquema-inicial.sql.
dc build app >/dev/null
dc run --rm --no-deps \
  -e DB_USERNAME=postgres -e DB_PASSWORD="$POSTGRES_PASSWORD" \
  app php artisan migrate --force --no-interaction

echo "· Levantando app y web"
dc up -d

echo "· Verificación"
psql_db -tA <<'SQL'
select 'tablas con RLS activo: ' || count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity;
select 'tablas SIN RLS:        ' || coalesce(string_agg(c.relname, ', ' order by c.relname), '-')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
select 'políticas RLS:         ' || count(*) from pg_policies where schemaname = 'public';
select 'fn_usuario_para_login: ' || case when to_regprocedure('fn_usuario_para_login(text)') is null then 'NO EXISTE' else 'existe' end;
select 'app_user:              ' || case when rolsuper or rolbypassrls then 'PELIGRO: salta RLS' else 'sin superusuario ni BYPASSRLS' end
  from pg_roles where rolname = 'app_user';
select 'usuarios de prueba:    ' || count(*) from usuarios;
SQL

echo
echo "Listo. Si todavía no compilaste Angular:"
echo "  docker compose --profile build run --rm build-front"
echo "Cuentas: demo/CUENTAS.md -- abre http://localhost/"
