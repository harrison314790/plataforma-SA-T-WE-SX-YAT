#!/bin/sh
# Arranque del contenedor `app`. Solo cuando arranca php-fpm (no en un
# `docker compose run app php artisan ...`) se cachean config y rutas:
# la config cacheada congela las credenciales, y init-db.sh necesita
# correr `migrate` con otras (las del dueño de la base).
set -e

if [ -z "$APP_KEY" ]; then
  echo "Falta APP_KEY en demo/backend.env -- corre demo/init-db.sh" >&2
  exit 1
fi

if [ "$1" = "php-fpm" ]; then
  php artisan config:cache
  php artisan route:cache
fi

exec "$@"
