<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Capa 3 de seguridad (RLS), lado Laravel: le dice a Postgres quién es el
 * usuario autenticado con `SET LOCAL app.usuario_id`, dentro de una
 * transacción que envuelve TODO el resto del request -- no una query
 * suelta. `fn_usuario_id_actual()` (ver base-datos.md) lee esa variable
 * de sesión desde las políticas RLS.
 *
 * Va SIEMPRE después de `auth:sanctum` (necesita `$request->user()` ya
 * resuelto) y SIEMPRE antes de cualquier middleware o controlador que
 * toque Eloquent. Por eso vive empaquetado junto con `auth:sanctum` en el
 * grupo de middleware `auth.rls` (ver bootstrap/app.php) -- ninguna ruta
 * protegida debería usar `auth:sanctum` suelto, sino siempre
 * `middleware('auth.rls')`, para que sea imposible construir un módulo
 * nuevo que se olvide de este paso.
 *
 * Ver .claude/skills/sistema-academico/references/laravel-postgres.md
 */
class EstablecerUsuarioActual
{
    public function handle(Request $request, Closure $next): Response
    {
        $usuarioId = $request->user()->id;

        return DB::transaction(function () use ($request, $next, $usuarioId) {
            DB::statement('SET LOCAL app.usuario_id = ?', [$usuarioId]);

            // $next($request) ejecuta el resto de middlewares y el
            // controlador completo -- todas sus queries de Eloquent
            // corren dentro de esta misma transacción.
            return $next($request);
        });
    }
}
