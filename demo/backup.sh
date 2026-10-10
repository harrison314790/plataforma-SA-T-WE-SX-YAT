#!/usr/bin/env bash
# Respaldo de la base de la demo en demo/backups/ (ignorado por git).
#   bash demo/backup.sh
# Restaurar: bash demo/reset.sh backups/<archivo>.dump

. "$(dirname "$0")/lib.sh"

mkdir -p backups
archivo="backups/demo-$(date +%Y%m%d-%H%M%S).dump"
dc exec -T db pg_dump -U postgres -Fc "$BASE" > "$archivo"
echo "Respaldo: demo/$archivo ($(du -h "$archivo" | cut -f1))"
