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
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
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

        // 'auth.rls': EstablecerUsuarioActual va PRIMERO -- lee el token
        // crudo y arma el contexto RLS antes de que auth:sanctum intente
        // resolver $request->user(), porque esa resolución lee la fila de
        // `usuarios`, que tiene RLS. Ver el docblock de
        // EstablecerUsuarioActual y
        // .claude/skills/sistema-academico/references/laravel-postgres.md
        $middleware->appendToGroup('auth.rls', [
            EstablecerUsuarioActual::class,
            'auth:sanctum',
        ]);

        // El orden dentro del array de arriba NO alcanza: Laravel tiene
        // una lista de prioridad interna que reordena middleware conocido
        // del framework (como `Authenticate`) SIEMPRE antes que cualquier
        // middleware propio ausente de esa lista, sin importar cómo se
        // declare en la ruta o el grupo. Sin esta línea, `auth:sanctum`
        // terminaba corriendo primero de todos modos -- se detectó
        // probando de verdad contra Postgres (401 "No autenticado" en
        // todo request autenticado, incluso con `EstablecerUsuarioActual`
        // listado antes). Ver
        // https://laravel.com/docs/12.x/middleware#sorting-middleware
        //
        // OJO con el target: la lista de prioridad de Laravel NO contiene
        // la clase concreta `Illuminate\Auth\Middleware\Authenticate`,
        // sino el contrato `AuthenticatesRequests` que implementa. Apuntar
        // a la clase concreta falla en silencio (no está en el array, así
        // que `addToMiddlewarePriorityBefore` no encuentra nada antes de
        // qué insertar y termina agregando al final) -- también se
        // detectó recién, inspeccionando
        // `app('router')` con reflexión.
        $middleware->prependToPriorityList(
            before: \Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests::class,
            prepend: EstablecerUsuarioActual::class,
        );

        // El permiso (capa 2) se revisa ANTES de resolver el modelo de la
        // ruta. Al revés, un rol sin permiso recibía 404 en vez de 403 en
        // `/usuarios/{usuario}`, `/notas/{nota}/correccion`... (RLS le
        // ocultaba la fila y el binding fallaba primero). Queda después de
        // la autenticación porque necesita `$request->user()`.
        $middleware->prependToPriorityList(
            before: \Illuminate\Routing\Middleware\SubstituteBindings::class,
            prepend: RequierePermiso::class,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Formato de error uniforme para toda la API -- ver
        // .claude/skills/sistema-academico/references/laravel-postgres.md.
        // Nunca se expone el mensaje crudo de una excepción no
        // clasificada ni de Postgres/Eloquent: eso puede incluir nombres
        // de columnas, restricciones o fragmentos de la query.

        // Un ErrorDeNegocio es un mensaje para la persona ("Correo o
        // contraseña incorrectos", "esa nota ya estaba registrada"), no una
        // falla del sistema: no va al log. Antes cada uno quedaba como
        // ERROR, dos veces -- en producción eso llena el disco y esconde
        // los errores de verdad.
        $exceptions->dontReport([ErrorDeNegocio::class]);

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

        // `AccessDeniedHttpException` tiene que estar en la firma: Laravel
        // convierte toda `AuthorizationException` (la de un `authorize()`
        // de Form Request, o una lanzada a mano) en esa excepción ANTES de
        // llamar a estos callbacks. Con solo `AuthorizationException`, este
        // bloque nunca corría y un 403 salía como 500 "Error interno" por
        // el manejador genérico de abajo. Ver Handler::render() del framework.
        $exceptions->render(function (AuthorizationException|AccessDeniedHttpException $e, Request $request) {
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

            // Sin `report($e)` acá: Laravel ya reportó la excepción (con la
            // query completa) ANTES de llamar a este render. Llamarlo de
            // nuevo dejaba cada error dos veces en el log.

            return response()->json([
                'error' => [
                    'codigo' => 'ERROR_INTERNO',
                    'mensaje' => 'No se pudo completar la operación. Intenta de nuevo.',
                ],
            ], 500);
        });

        // Una respuesta ya armada (por ejemplo, el 429 del límite de
        // intentos de login, ver AppServiceProvider) se devuelve tal cual.
        // Sin esto, el atrapa-todo de abajo la convertía en 500.
        $exceptions->render(function (HttpResponseException $e, Request $request) {
            return $request->is('api/*') ? $e->getResponse() : null;
        });

        // Los demás errores HTTP (405 método no permitido, 429, 413...) con
        // su código real y un mensaje en español, no como 500.
        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            $estado = $e->getStatusCode();
            [$codigo, $mensaje] = match ($estado) {
                405 => ['METODO_NO_PERMITIDO', 'Esa acción no existe en esta dirección.'],
                413 => ['DEMASIADO_GRANDE', 'Lo que se envió es demasiado grande.'],
                429 => ['DEMASIADAS_SOLICITUDES', 'Demasiadas solicitudes seguidas. Espera un momento y vuelve a intentar.'],
                default => ['ERROR_HTTP', 'No se pudo completar la operación.'],
            };

            return response()->json(['error' => ['codigo' => $codigo, 'mensaje' => $mensaje]], $estado, $e->getHeaders());
        });

        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error' => ['codigo' => 'ERROR_INTERNO', 'mensaje' => 'Error interno'],
            ], 500);
        });
    })->create();
