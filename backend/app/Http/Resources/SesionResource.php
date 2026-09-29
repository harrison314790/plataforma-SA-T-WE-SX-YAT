<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Todo lo que Angular necesita saber de la sesión, en un solo objeto:
 * quién está conectado, en qué período está la institución, qué puede
 * hacer y a qué módulos puede entrar.
 *
 * POR QUÉ VIAJA TODO JUNTO Y NO EN CUATRO PETICIONES
 * Conectividad intermitente (zona rural): cada round-trip extra es un
 * punto más donde la pantalla se queda a medias. Con esto, `login` y
 * `/autenticacion/yo` devuelven exactamente la misma forma y una sola
 * respuesta deja la aplicación lista para pintar el menú completo -- ver
 * el flujo en references/permisos.md ("AuthService trae una sola vez el
 * mapa de permisos, en la misma respuesta del login").
 *
 * `login` devuelve esto MÁS el token; `yo` devuelve esto solo. Así la
 * respuesta de login no es un formato aparte que haya que mantener en
 * paralelo: es este mismo objeto con una clave más.
 *
 * @property-read \App\Models\Usuario $resource
 */
class SesionResource extends JsonResource
{
    /**
     * @param  array<string, bool>  $permisos
     * @param  \Illuminate\Support\Collection<int, array<string, mixed>>  $modulos
     */
    public function __construct(
        $usuario,
        private readonly array $permisos,
        private readonly \Illuminate\Support\Collection $modulos,
        private readonly ?\App\Models\PeriodoAcademico $periodoActivo,
    ) {
        parent::__construct($usuario);
    }

    public function toArray(Request $request): array
    {
        return [
            'usuario' => UsuarioResource::make($this->resource),

            // Puede ser null con toda legitimidad: entre el cierre de un
            // año escolar y la apertura del siguiente no hay período
            // activo. La barra superior tiene que saber mostrar ese caso
            // sin romperse, no asumir que siempre hay uno.
            'periodoActivo' => $this->periodoActivo === null
                ? null
                : PeriodoActivoResource::make($this->periodoActivo),

            // Mapa `codigo => habilitado` para *appHasRole y los guards.
            // Se fuerza a objeto para que un mapa vacío serialice como {}
            // y no como [], que es lo que hace PHP con un array vacío --
            // Angular espera Record<string, boolean>, y un [] lo obligaría
            // a defenderse de los dos tipos.
            'permisos' => (object) $this->permisos,

            'modulos' => $this->modulos,
        ];
    }
}
