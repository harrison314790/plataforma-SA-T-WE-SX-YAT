<?php

namespace App\Http\Middleware;

use App\Models\Permiso;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Capa 2 de seguridad. Verifica el mismo `codigo` que usa *appHasRole en
 * Angular contra la tabla `permisos`, con el rol ya resuelto por Sanctum
 * -- nunca un header que mande el cliente. Va DESPUÉS de `auth.rls` (ver
 * bootstrap/app.php), porque consulta `permisos` vía Eloquent y esa
 * consulta ya tiene que correr con el usuario/contexto RLS establecido
 * (aunque `permisos_lectura` es de lectura abierta, mejor no asumir el
 * orden al revés).
 *
 * Uso: ->middleware('requiere.permiso:btn_registrar_nota')
 *
 * Ver .claude/skills/sistema-academico/references/permisos.md
 */
class RequierePermiso
{
    public function handle(Request $request, Closure $next, string $codigo): Response
    {
        $rol = $request->user()->rol->nombre;

        // super_admin pasa cualquier `codigo` sin consultar la tabla --
        // mismo criterio que el bypass total que ya tiene en RLS
        // (fn_es_super_admin()). Ver permisos.md para el porqué.
        if ($rol === 'super_admin') {
            return $next($request);
        }

        $habilitado = Permiso::whereHas('recurso', fn ($q) => $q->where('codigo', $codigo))
            ->whereHas('rol', fn ($q) => $q->where('nombre', $rol))
            ->value('habilitado');

        if (! $habilitado) {
            return response()->json([
                'error' => [
                    'codigo' => 'NO_AUTORIZADO',
                    'mensaje' => 'No tiene permiso para esta acción',
                ],
            ], 403);
        }

        return $next($request);
    }
}
