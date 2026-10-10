# Funciones compartidas por init-db.sh, reset.sh y backup.sh.
# No se ejecuta solo: se carga con `. ./lib.sh`.

set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEMO_DIR"

BASE=sistema_academico_demo
VOLUMEN_DB=sademo_demo_pgdata

# Git Bash (Windows) traduce rutas tipo /algo en los argumentos de docker;
# aquí no se quiere eso.
export MSYS_NO_PATHCONV=1

dc() { docker compose "$@"; }

# psql como dueño de la base (postgres). SOLO para aplicar scripts y
# verificar; la app nunca usa esta conexión.
psql_db() { dc exec -T db psql -U postgres -d "$BASE" -v ON_ERROR_STOP=1 "$@"; }

aleatorio() { openssl rand -hex 24; }

# Crea demo/.env y demo/backend.env si faltan, con secretos aleatorios.
asegurar_secretos() {
  if [ ! -f .env ]; then
    printf 'POSTGRES_PASSWORD=%s\nAPP_USER_PASSWORD=%s\n' "$(aleatorio)" "$(aleatorio)" > .env
    echo "· Creado demo/.env con contraseñas aleatorias de la base"
  fi
  if [ ! -f backend.env ]; then
    cp backend.env.example backend.env
    echo "· Creado demo/backend.env desde backend.env.example"
  fi
  if ! grep -q '^APP_KEY=base64:' backend.env; then
    local clave="base64:$(openssl rand -base64 32)"
    sed -i "s|^APP_KEY=.*|APP_KEY=${clave}|" backend.env
    echo "· APP_KEY generada"
  fi
  set -a; . ./.env; set +a
}

esperar_db() {
  dc up -d db >/dev/null
  printf '· Esperando a Postgres'
  for _ in $(seq 1 60); do
    if dc exec -T db pg_isready -U postgres -d "$BASE" >/dev/null 2>&1; then echo " listo"; return; fi
    printf '.'; sleep 1
  done
  echo; echo "Postgres no respondió en 60 s" >&2; exit 1
}

# Roles que la app necesita ANTES de cualquier script: `authenticated`
# (lo crea 01 igual, pero un respaldo restaurado lo necesita antes) y
# `app_user` con la contraseña de demo/.env. 01 crea app_user con la
# clave de desarrollo SOLO si no existe, así que crearlo aquí primero
# hace que la demo nunca use la clave versionada.
crear_roles() {
  psql_db -q -v clave="$APP_USER_PASSWORD" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login;
  end if;
end $$;
alter role app_user login nosuperuser nobypassrls nocreatedb nocreaterole password :'clave';
grant authenticated to app_user;
SQL
}
