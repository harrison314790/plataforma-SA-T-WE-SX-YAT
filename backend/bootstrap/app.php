<?php

use App\Exceptions\ErrorDeNegocio;
use App\Http\Middleware\EstablecerUsuarioActual;
use App\Http\Middleware\RequierePermiso;
use App\Http\Middleware\RequiereSuperAdmin;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'requiere.permiso' => RequierePermiso::class,
            'requiere.superadmin' => RequiereSuperAdmin::class,
        ]);

        // 'auth.rls': auth:sanctum resuelve $request->user(),
        // EstablecerUsuarioActual arma el contexto RLS con ese usuario.
        // Ver .claude/skills/sistema-academico/references/laravel-postgres.md
        $middleware->appendToGroup('auth.rls', [
            'auth:sanctum',
            EstablecerUsuarioActual::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Formato de error uniforme para toda la API -- ver
        // .claude/skills/sistema-academico/references/laravel-postgres.md.
        // Nunca se expone el mensaje crudo de una excepción no
        // clasificada ni de Postgres/Eloquent: eso puede incluir nombres
        // de columnas, restricciones o fragmentos de la query.

        $exceptions->render(function (ErrorDeNegocio $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error' => ['codigo' => 'ERROR_DE_NEGOCIO', 'mensaje' => $e->getMessage()],
            ], 422);
        });

        $exceptions->render(function (ValidationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error' => [
                    'codigo' => 'VALIDACION',
                    'mensaje' => 'Los datos enviados no son válidos.',
                    'detalles' => $e->errors(),
                ],
            ], 422);
        });

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error' => ['codigo' => 'NO_AUTENTICADO', 'mensaje' => 'No autenticado'],
            ], 401);
        });

        $exceptions->render(function (AuthorizationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error' => ['codigo' => 'NO_AUTORIZADO', 'mensaje' => 'No tiene permiso para esta acción'],
            ], 403);
        });

        $exceptions->render(function (ModelNotFoundException|NotFoundHttpException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error' => ['codigo' => 'NO_ENCONTRADO', 'mensaje' => 'Recurso no encontrado'],
            ], 404);
        });

        $exceptions->render(function (QueryException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            report($e); // detalle completo (incluida la query) solo al log del servidor

            return response()->json([
                'error' => [
                    'codigo' => 'ERROR_INTERNO',
                    'mensaje' => 'No se pudo completar la operación. Intenta de nuevo.',
                ],
            ], 500);
        });

        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            report($e);

            return response()->json([
                'error' => ['codigo' => 'ERROR_INTERNO', 'mensaje' => 'Error interno'],
            ], 500);
        });
    })->create();
