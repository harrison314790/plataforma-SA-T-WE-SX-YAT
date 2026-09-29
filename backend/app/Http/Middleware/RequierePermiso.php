<?php

namespace App\Http\Middleware;

use App\Services\PermisoService;
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
 * La decisión de si el rol puede o no está delegada en PermisoService y no
 * escrita acá: el bypass de `super_admin` es una regla que también
 * necesitan el mapa de permisos del login y el armado del menú, y las tres
 * tienen que coincidir exactamente con lo que hace RLS. Ver el docblock de
 * PermisoService para el bug que causó tenerla duplicada.
 *
 * Uso: ->middleware('requiere.permiso:btn_registrar_nota')
 *
 * Ver .claude/skills/sistema-academico/references/permisos.md
 */
class RequierePermiso
{
    public function __construct(private readonly PermisoService $permisoService)
    {
    }

    public function handle(Request $request, Closure $next, string $codigo): Response
    {
        $rol = $request->user()->rol->nombre;

        if (! $this->permisoService->puede($rol, $codigo)) {
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
