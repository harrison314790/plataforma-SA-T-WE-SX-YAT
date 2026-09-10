<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Capa 2 explícita para operaciones exclusivas de super_admin: gestionar
 * `recursos`/`permisos`/`roles`, o los casos de `usuarios` donde el
 * objetivo ya es o pasaría a ser super_admin. RLS ya lo bloquea
 * (`fn_es_super_admin()`), pero sin este chequeo el error que le llega a
 * un admin normal es el genérico de Postgres, no un mensaje claro.
 *
 * Ver .claude/skills/sistema-academico/references/permisos.md
 */
class RequiereSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()->rol->nombre !== 'super_admin') {
            return response()->json([
                'error' => [
                    'codigo' => 'NO_AUTORIZADO',
                    'mensaje' => 'Esta acción es exclusiva de super administrador',
                ],
            ], 403);
        }

        return $next($request);
    }
}
