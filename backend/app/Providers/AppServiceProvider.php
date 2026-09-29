<?php

namespace App\Providers;

use Illuminate\Http\Resources\Json\JsonResource;
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
    }
}
