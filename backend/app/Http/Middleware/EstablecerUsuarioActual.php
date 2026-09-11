<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Capa 3 de seguridad (RLS), lado Laravel: le dice a Postgres quién es el
 * usuario autenticado con `set_config('app.usuario_id', ...)`, dentro de
 * una transacción que envuelve TODO el resto del request -- no una query
 * suelta. `fn_usuario_id_actual()` (ver base-datos.md) lee esa variable
 * de sesión desde las políticas RLS.
 *
 * Va SIEMPRE ANTES de `auth:sanctum` en el grupo `auth.rls` (ver
 * bootstrap/app.php) -- al revés de lo que parecería natural, y al
 * revés de como se armó la primera vez (se corrigió recién al probar
 * contra Postgres real: `auth:sanctum` necesita leer la fila de
 * `usuarios` del dueño del token para resolver `$request->user()`, pero
 * esa fila tiene RLS (`usuarios_ve_su_fila`) y todavía nadie seteó
 * `app.usuario_id` -- el mismo problema del huevo y la gallina que
 * resuelve `fn_usuario_para_login()` en el login (ver
 * AutenticacionService), pero repetido acá para CADA request
 * autenticado, no solo el login.
 *
 * La solución: leer el token crudo directo de `personal_access_tokens`
 * (tabla propia de Sanctum, sin RLS) con la MISMA verificación de hash
 * que usa el guard de Sanctum por dentro (`PersonalAccessToken::findToken`)
 * -- no es un atajo inseguro, es la misma validación, solo que se
 * ejecuta un paso antes. Con el contexto ya puesto, cuando `auth:sanctum`
 * corre después y carga el `Usuario`, la política RLS lo deja pasar
 * porque la fila sí es la suya. Si el token no existe o ya no es válido,
 * esta clase no hace nada y deja que `auth:sanctum` (que sigue corriendo
 * después, con su validación completa de expiración/revocación) rechace
 * la petición como siempre.
 *
 * Ver .claude/skills/sistema-academico/references/laravel-postgres.md
 */
class EstablecerUsuarioActual
{
    public function handle(Request $request, Closure $next): Response
    {
        $tokenCrudo = $request->bearerToken();
        $token = $tokenCrudo ? PersonalAccessToken::findToken($tokenCrudo) : null;

        if (! $token) {
            // Sin token válido no hay nada que setear -- auth:sanctum,
            // que corre después, rechaza la petición con 401 como
            // siempre.
            return $next($request);
        }

        return DB::transaction(function () use ($request, $next, $token) {
            // set_config() es una función normal (acepta bind params);
            // `SET LOCAL app.usuario_id = ?` no es válido en Postgres --
            // el comando SET solo admite literales, no parámetros.
            DB::statement("select set_config('app.usuario_id', ?, true)", [$token->tokenable_id]);

            // $next($request) ejecuta auth:sanctum (que ahora sí puede
            // leer la fila de `usuarios`), el resto de middlewares y el
            // controlador completo -- todas sus queries de Eloquent
            // corren dentro de esta misma transacción.
            return $next($request);
        });
    }
}
