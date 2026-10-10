#!/usr/bin/env bash
# Devuelve la demo a un estado limpio.
#   bash demo/reset.sh                         -> base nueva con los datos de prueba
#   bash demo/reset.sh backups/demo-XXXX.dump  -> restaura ese respaldo
#
# Borra SOLO el volumen de la base de la demo (sademo_demo_pgdata). El
# Angular compilado y la caché de npm se conservan, así que no hay que
# volver a compilar. (`docker compose down -v` también funciona, pero
# borra el Angular compilado.)

. "$(dirname "$0")/lib.sh"

respaldo="${1:-}"
if [ -n "$respaldo" ]; then
  respaldo="$(cd "$(dirname "$respaldo")" && pwd)/$(basename "$respaldo")"
  [ -f "$respaldo" ] || { echo "No existe $respaldo" >&2; exit 1; }
fi

echo "· Apagando la demo y borrando la base"
dc down
docker volume rm "$VOLUMEN_DB" >/dev/null 2>&1 || true

if [ -z "$respaldo" ]; then
  exec bash ./init-db.sh
fi

asegurar_secretos
esperar_db
echo "· Restaurando $(basename "$respaldo")"
crear_roles
dc exec -T db pg_restore -U postgres -d "$BASE" --exit-on-error < "$respaldo"
dc up -d
echo "Listo: demo restaurada desde $(basename "$respaldo")"
