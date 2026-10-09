<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        /*
         * Respuestas sin envoltorio `data`.
         *
         * Por defecto, un API Resource devuelto directo desde un
         * controlador se envuelve en `{ "data": ... }`, pero los errores de
         * esta API ya son planos (`{ "error": { codigo, mensaje } }`, ver
         * bootstrap/app.php). Mezclar las dos formas obligaría a Angular a
         * desenvolver en el camino feliz y no en el de error -- dos
         * contratos para el mismo endpoint.
         *
         * Cuándo revisar esta decisión: si algún listado pasa a estar
         * paginado, `data` vuelve a ser útil porque trae `meta`/`links` al
         * lado. Hoy no hay paginación (las tablas de notas usan scroll
         * virtual, no páginas -- ver references/diseno-ui.md), así que el
         * envoltorio solo agrega un nivel que nadie usa.
         */
        JsonResource::withoutWrapping();

        /*
         * Límite de intentos de login.
         *
         * Sin esto se podían probar contraseñas sin fin (la auditoría hizo
         * 70 seguidas sin un solo bloqueo), y una cuenta de profesor
         * registra notas. Dos límites: 5 por minuto para el mismo correo
         * desde la misma IP (alguien adivinando UNA cuenta), y 60 por
         * minuto por IP (alguien probando muchas). El de IP es holgado a
         * propósito: en una sede todos salen a internet por la misma IP, y
         * un salón de 30 entrando a la vez no debe quedar bloqueado.
         *
         * La respuesta se arma acá con el formato de errores del proyecto:
         * el 429 por defecto de Laravel caería en el manejador genérico de
         * bootstrap/app.php y saldría como 500 "Error interno".
         */
        RateLimiter::for('login', function (Request $request) {
            $responder = fn (Request $r, array $headers) => response()->json([
                'error' => [
                    'codigo' => 'DEMASIADOS_INTENTOS',
                    'mensaje' => 'Demasiados intentos. Espera un minuto antes de volver a intentar.',
                ],
            ], 429, $headers);

            $email = mb_strtolower(trim((string) $request->input('email')));

            return [
                Limit::perMinute(5)->by($email.'|'.$request->ip())->response($responder),
                Limit::perMinute(60)->by('ip|'.$request->ip())->response($responder),
            ];
        });
    }
}
