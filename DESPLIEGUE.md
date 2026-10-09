# Despliegue del piloto: dónde y cómo

Guía paso a paso para montar el sistema en internet y que coordinación y los profesores lo prueben desde el colegio o la casa.

## Dónde: un VPS

La decisión ya estaba tomada en el proyecto: un **VPS** (servidor virtual) en **OVHcloud**. Comparado con las otras opciones:

- **Contra la nube gestionada (Supabase + Render, unos 32 USD al mes):** sale más barato.
- **Contra un PC en la escuela:** trae copias de seguridad automáticas e IP fija, y no se cae cuando se va la luz o el internet de la sede.

| Qué | Recomendación | Costo aproximado |
|---|---|---|
| Servidor | OVHcloud **VPS** con 2 vCPU y 4 GB de RAM, **Ubuntu 24.04**, centro de datos en **EE. UU. Este (Vint Hill)**, el más cercano a Colombia | 5–8 USD/mes |
| Copias de seguridad | La opción "Automated backup" de OVH, más el `pg_dump` diario de esta guía | 1–2 USD/mes |
| Dirección web | **Para el piloto, gratis:** `sistema.<IP-con-guiones>.sslip.io` (ver paso 1). **Después:** un dominio propio (`.edu.co` lo tramita el colegio; `.com` o `.co` unos 10–30 USD al año) | 0 para el piloto |

Requisitos mínimos si eliges otro proveedor (Hostinger, DigitalOcean, Contabo…): Ubuntu 22.04 o 24.04, 2 GB de RAM y acceso root por SSH. Todo lo demás de la guía es igual.

**Arquitectura** (una sola máquina, un solo dominio):

```
Navegador ──HTTPS──► nginx ─┬─ /          → Angular (archivos estáticos ya compilados)
                            └─ /api/...   → PHP-FPM → Laravel ──► PostgreSQL 16 (en la misma máquina)
```

Angular y la API comparten dominio, así que no hace falta CORS: el `environment.ts` de producción ya apunta a `/api/v1`.

---

## Paso 1. Crear el servidor y la dirección

1. Contrata el VPS con Ubuntu 24.04. OVH te manda por correo la **IP** y el usuario (`ubuntu`).
2. **Dirección sin comprar dominio (para el piloto):** si la IP es `51.79.12.34`, la dirección `sistema.51-79-12-34.sslip.io` ya apunta a tu servidor sin configurar nada. Sirve para HTTPS con Let's Encrypt.
3. **Con dominio propio:** crea un registro **A** (por ejemplo `sistema.tucolegio.edu.co`) que apunte a la IP.

En el resto de la guía, `TU_DIRECCION` es una de esas dos.

## Paso 2. Seguridad básica del servidor

Desde tu computador:

```bash
ssh ubuntu@TU_IP
sudo apt update && sudo apt -y upgrade
sudo apt -y install ufw unattended-upgrades fail2ban
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw --force enable
sudo dpkg-reconfigure -plow unattended-upgrades   # parches de seguridad automáticos
```

Recomendado: entrar con **llave SSH** y desactivar la contraseña de SSH (`PasswordAuthentication no` en `/etc/ssh/sshd_config`).

## Paso 3. Instalar lo necesario

```bash
sudo apt -y install nginx postgresql-16 postgresql-contrib \
  php8.3-fpm php8.3-cli php8.3-pgsql php8.3-mbstring php8.3-xml php8.3-curl php8.3-zip php8.3-bcmath php8.3-intl \
  unzip git certbot python3-certbot-nginx
# Composer
curl -sS https://getcomposer.org/installer | php && sudo mv composer.phar /usr/local/bin/composer
```

Si Ubuntu no trae `postgresql-16` o `php8.3`, agrega primero los repositorios oficiales (`apt.postgresql.org` y `ppa:ondrej/php`). El proyecto exige PHP 8.2 o superior y se probó con Postgres 16.

## Paso 4. Subir el código

```bash
sudo mkdir -p /var/www/sistema && sudo chown $USER:www-data /var/www/sistema
git clone <URL-DE-TU-REPO> /var/www/sistema
cd /var/www/sistema && git checkout main   # o la rama que vayas a desplegar
```

## Paso 5. Base de datos

```bash
sudo -u postgres psql -c "create database sistema_academico"
cd /var/www/sistema/backend
for f in $(ls [0-9]*.sql | sort); do
  case "$f" in 25-*|26-*) continue;; esac          # 25 y 26 van después
  echo "== $f"; sudo -u postgres psql -d sistema_academico -v ON_ERROR_STOP=1 -q -f "$f" || break
done
```

Probé ese orden (01 → 24) sobre una base vacía y corre sin errores. El esquema resultante es idéntico al de desarrollo.

**Obligatorio: cambia la contraseña de `app_user`.** El script 01 la crea con la de desarrollo (`AppUserLocalDev2026`), que está en el repositorio:

```bash
sudo -u postgres psql -c "alter role app_user password 'UNA-CLAVE-LARGA-Y-ALEATORIA'"
```

Postgres escucha solo en `localhost` por defecto. **No** abras el puerto 5432 en el firewall.

## Paso 6. Laravel

```bash
cd /var/www/sistema/backend
composer install --no-dev --optimize-autoloader
cp .env.example .env && php artisan key:generate
```

Edita `.env`:

```dotenv
APP_ENV=production
APP_DEBUG=false                 # NUNCA true en el servidor: muestra rutas y consultas en los errores
APP_URL=https://TU_DIRECCION
LOG_LEVEL=warning
DB_DATABASE=sistema_academico
DB_USERNAME=app_user            # nunca postgres: el superusuario se salta RLS
DB_PASSWORD=UNA-CLAVE-LARGA-Y-ALEATORIA
SANCTUM_EXPIRATION=720          # sesiones de 12 horas
```

Las tablas propias de Laravel (sesiones, caché) se crean con el **superusuario**: `app_user` no tiene permiso para crear tablas, y es a propósito.

```bash
sudo -u postgres psql -c "alter role postgres password 'OTRA-CLAVE-SOLO-PARA-ESTO'"
DB_USERNAME=postgres DB_PASSWORD='OTRA-CLAVE-SOLO-PARA-ESTO' php artisan migrate --force
php artisan config:cache && php artisan route:cache
sudo chown -R www-data:www-data storage bootstrap/cache
```

## Paso 7. Dejar la base lista para el piloto (sin gente de prueba)

Los scripts 03, 13, 17, 18 y 23 siembran **personas de prueba** (Marta Ríos, Luis Pérez…) con la contraseña conocida `Prueba123!`. El script 25 las borra, junto con sus notas y matrículas. Conserva el catálogo (roles, permisos, nudos, materias, malla, sedes, oferta) y crea las dos cuentas que la pantalla de Usuarios no puede crear:

```bash
sudo -u postgres psql -d sistema_academico \
  -v anio=2026 \
  -v super_email='tu.correo@colegio.edu.co' -v super_clave='ClaveLarga-1' \
  -v super_nombres='Harrison' -v super_apellidos='Valencia' -v super_documento='1234567890' \
  -v admin_email='coordinacion@colegio.edu.co' -v admin_clave='ClaveLarga-2' \
  -v admin_nombres='Nombre' -v admin_apellidos='Apellido' -v admin_documento='9876543210' \
  -f 25-preparar-piloto.sql
```

Las **sedes** de prueba se llaman "Sede Principal", "Escuela La Laguna" y "Escuela Guaitalá". Todavía no hay pantalla de sedes, así que los nombres reales se ponen con SQL:

```sql
update sedes set nombre = 'Nombre real', vereda = 'Vereda real' where id = 2;
```

Probé el recorrido completo sobre una base dejada así: coordinación crea un profesor y un estudiante, abre el curso, crea la asignación y matricula; el profesor entra y sube su nota; el estudiante ve su boletín. Todo funcionó.

## Paso 8. Angular

En tu computador (o en el servidor, si tiene Node 20 o superior):

```bash
cd frontend && npm ci && npx ng build --configuration production
# copiar el resultado al servidor (la primera vez, crear la carpeta):
ssh ubuntu@TU_IP "mkdir -p /var/www/sistema/frontend/dist/frontend/browser"
scp -r dist/frontend/browser/* ubuntu@TU_IP:/var/www/sistema/frontend/dist/frontend/browser/
```

## Paso 9. nginx

`/etc/nginx/sites-available/sistema`:

```nginx
server {
    listen 80;
    server_name TU_DIRECCION;

    root /var/www/sistema/frontend/dist/frontend/browser;
    index index.html;
    client_max_body_size 10m;

    # Angular: cualquier ruta que no sea un archivo vuelve a index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Archivos con hash en el nombre (js, css, fuentes): caché larga
    location ~* \.(js|css|woff2|png|svg|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # La API va a Laravel
    location /api/ {
        root /var/www/sistema/backend/public;
        try_files $uri /index.php?$query_string;
    }
    location = /index.php {
        root /var/www/sistema/backend/public;
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME /var/www/sistema/backend/public/index.php;
    }

    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header Referrer-Policy strict-origin-when-cross-origin;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/sistema /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## Paso 10. HTTPS (obligatorio)

Los tokens de sesión viajan en cada petición: sin HTTPS, cualquiera en el mismo wifi los ve.

```bash
sudo certbot --nginx -d TU_DIRECCION --redirect -m tu.correo@colegio.edu.co --agree-tos -n
```

Certbot renueva el certificado solo.

## Paso 11. Tareas programadas y copias de seguridad

```bash
sudo crontab -u www-data -e
```

```cron
# Laravel: borra sesiones vencidas (y las tareas que se agreguen después)
* * * * * cd /var/www/sistema/backend && php artisan schedule:run >> /dev/null 2>&1
```

```bash
sudo mkdir -p /var/backups/sistema && sudo chown postgres /var/backups/sistema
sudo crontab -u postgres -e
```

```cron
# Copia diaria a las 2 a. m. (hora del servidor); se guardan 14 días
0 2 * * * pg_dump -Fc sistema_academico > /var/backups/sistema/$(date +\%F).dump && find /var/backups/sistema -name '*.dump' -mtime +14 -delete
```

**Prueba de que la copia sirve** (hazla una vez; una copia que nunca se restauró no es una copia):

```bash
sudo -u postgres createdb restauracion_prueba
sudo -u postgres pg_restore -d restauracion_prueba /var/backups/sistema/<fecha>.dump
sudo -u postgres dropdb restauracion_prueba
```

Activa también el "Automated backup" de OVH y, si puedes, copia los `.dump` fuera del servidor (Google Drive, otro equipo).

## Paso 12. Antes de invitar a los profesores

1. Entra con la cuenta de coordinación.
2. **Matrículas:** que exista la oferta de grados real de cada sede (Asignaciones › Grados).
3. **Usuarios:** crea las cuentas de los profesores y anota la contraseña que muestra la pantalla para entregarla en persona.
4. **Asignaciones:** quién dicta qué en cada curso.
5. **Usuarios + Matrículas:** crea y matricula a los estudiantes del piloto.
6. **Notas › Calendario de épocas:** pon las fechas reales y abre la carga con el interruptor.
7. Pide a un profesor que entre y registre una nota de prueba, y míralo en Seguimiento.

Si un profesor olvida su contraseña: Usuarios → editar su cuenta → **Restablecer contraseña**. La nueva se muestra una vez y sus sesiones abiertas se cierran.

## Actualizar el sistema después (cuando haya cambios)

```bash
cd /var/www/sistema && git pull
cd backend && composer install --no-dev --optimize-autoloader
sudo -u postgres psql -d sistema_academico -v ON_ERROR_STOP=1 -f <solo los .sql NUEVOS>
php artisan config:cache && php artisan route:cache
# y subir el build nuevo de Angular (paso 8)
```

**Antes de cada actualización, saca una copia:** `sudo -u postgres pg_dump -Fc sistema_academico > antes-de-actualizar.dump`.

Cada enero, crea las épocas del año nuevo y luego ajusta las fechas en la pantalla:

```bash
sudo -u postgres psql -d sistema_academico -v anio=2027 -f backend/26-crear-anio-escolar.sql
```

---

## Lo que el piloto todavía NO tiene (conocido)

| Falta | Mientras tanto |
|---|---|
| Que cada persona cambie **su propia** contraseña | Coordinación la restablece desde Usuarios |
| Recuperar contraseña por correo | No hay envío de correos configurado; lo hace coordinación |
| Pantalla de **sedes** | SQL (paso 7) |
| Pantalla para crear el **año escolar** siguiente | Script 26 |
| Crear cuentas de **coordinación** desde la pantalla | Script 25, o pedirlo al super_admin |
| Asistencia, Documentos, Reportes | Aparecen como "Pronto" |
| **Angular 18 sin soporte**: tiene avisos de seguridad que se corrigen en Angular 20 o 21 | Ninguno afecta lo que usa este sistema (no usa i18n, SSR, `innerHTML` ni caché de hidratación). Conviene actualizar antes de abrirlo a todo el colegio; es un cambio grande que merece su propia ronda de pruebas |
