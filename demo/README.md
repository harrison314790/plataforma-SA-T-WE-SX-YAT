# Demo en el portátil (Docker + Cloudflare Tunnel)

```
Internet → cloudflared (túnel) → nginx :80 ─┬─ /            Angular compilado
                                            └─ /api, /up    php-fpm (Laravel) → Postgres 16
```

Todo corre en contenedores propios (proyecto `sademo`). No toca
`mi-postgres` / `sistema_academico` ni `backend/.env`. La app entra a la
base como `app_user` (sin superusuario ni BYPASSRLS), así que RLS filtra
igual que en el sistema real. Cuentas y qué mostrar: [CUENTAS.md](CUENTAS.md).

Requisitos: Docker Desktop encendido y **Git Bash** (los `.sh` son bash).
Todos los comandos se corren **dentro de `demo/`**.

## Primer arranque (una vez)

```bash
cd demo
bash init-db.sh                                      # secretos, base, scripts SQL, migraciones; levanta todo
docker compose --profile build run --rm build-front  # compila Angular (~1-2 min)
```

Abre <http://localhost/>. `init-db.sh` crea `demo/.env` (claves de la
base) y `demo/backend.env` (Laravel, con `APP_KEY`). Los dos están en
`.gitignore`; las plantillas versionadas son `backend.env.example`.

Aplica `backend/01…24` en orden. **No** aplica `25-preparar-piloto.sql`
(borra a la gente de prueba: es para el servidor real) ni
`26-crear-anio-escolar.sql` (es el trámite de enero; 2026 ya viene completo).

Si cambias código: `docker compose up -d --build app` (backend) o se
vuelve a correr `build-front` (Angular).

## Exponer con el túnel

Instala cloudflared una vez: descarga `cloudflared-windows-amd64.exe` de
<https://github.com/cloudflare/cloudflared/releases/latest>, renómbralo a
`cloudflared.exe` y ponlo en una carpeta del PATH (o usa
`winget install Cloudflare.cloudflared` si tienes winget).

```powershell
cloudflared tunnel --url http://localhost:80
```

Imprime una URL `https://xxxx.trycloudflare.com`: esa es la que compartes.
**Cambia en cada arranque.** Deja esa ventana abierta mientras dure la demo.

Sin instalar nada (alternativa, misma ruta hacia nginx):

```bash
docker run --rm --network sademo_default cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://web:80
```

## Respaldo y reinicio

```bash
bash backup.sh                         # → demo/backups/demo-AAAAMMDD-HHMMSS.dump
bash reset.sh                          # base nueva con los datos de prueba (borra lo que hicieron en la demo)
bash reset.sh backups/demo-XXXX.dump   # vuelve exactamente a ese respaldo
```

`reset.sh` borra solo el volumen de la base; el Angular compilado se
conserva. (`docker compose down -v` también reinicia, pero borra el
Angular compilado y hay que volver a correr `build-front` e `init-db.sh`.)

## Apagar al terminar

1. `Ctrl+C` en la ventana de `cloudflared` (la URL pública deja de existir).
2. `docker compose down` (los datos quedan en el volumen para la próxima vez).

## Cosas que conviene saber

- **El puerto 80 solo escucha en `127.0.0.1`.** Nadie de la Wi-Fi entra
  directo al portátil: solo por el túnel.
- **Límite del login:** 5 intentos por minuto por correo+IP, y 60 por
  minuto por IP. nginx toma la IP real de `CF-Connecting-IP`, así que
  cada colegio/celular tiene su propio cupo. Un salón entero detrás de la
  misma IP puede hacer 60 ingresos por minuto; si alguien ve
  "Demasiados intentos", que espere un minuto.
- **Capacidad medida:** 28 ingresos simultáneos en ~1,2 s dentro de
  Docker y 30 en ~3,5 s desde Windows (la diferencia es el reenvío de
  puertos de Docker Desktop, no PHP). Cada ingreso gasta ~0,17 s de CPU
  en bcrypt; `pm.max_children = 16` (`php/www.conf`) alcanza de sobra
  para una demo.
- **Logs:** `docker compose logs -f app web`.
- **Sin CSP:** nginx manda `nosniff`, `X-Frame-Options`, `Referrer-Policy`
  y `Permissions-Policy`, pero no `Content-Security-Policy`. El build de
  Angular carga el CSS con un `onload` en línea, y una CSP estricta lo
  bloquearía.
