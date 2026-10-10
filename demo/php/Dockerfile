# PHP-FPM con Laravel 12 para la DEMO.
# Contexto de build: ../backend (ver docker-compose.yml). El código se
# COPIA a la imagen: no se monta, para no arrastrar el vendor/ ni el .env
# de desarrollo del portátil (ver Dockerfile.dockerignore).
FROM php:8.2-fpm-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq-dev libzip-dev libicu-dev unzip \
 && docker-php-ext-install -j"$(nproc)" pdo_pgsql pgsql bcmath intl zip opcache \
 && apt-get purge -y --auto-remove \
 && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/backend

# Dependencias primero (capa cacheable mientras no cambie composer.lock).
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --no-interaction --prefer-dist

COPY . .
RUN composer dump-autoload --optimize --no-dev \
 && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
 && chown -R www-data:www-data storage bootstrap/cache

COPY --from=demo php/php.ini /usr/local/etc/php/conf.d/zz-demo.ini
COPY --from=demo php/www.conf /usr/local/etc/php-fpm.d/zz-demo-pool.conf
COPY --from=demo php/entrypoint.sh /usr/local/bin/demo-entrypoint
RUN chmod +x /usr/local/bin/demo-entrypoint

ENTRYPOINT ["demo-entrypoint"]
CMD ["php-fpm"]
