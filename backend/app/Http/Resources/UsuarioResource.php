<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Los datos del usuario conectado que la barra superior necesita mostrar.
 * Claves en camelCase a propósito: coinciden 1:1 con
 * `frontend/src/app/core/interfaces/usuario.interface.ts`, así Angular no
 * traduce snake_case.
 *
 * `password_hash` no aparece por dos razones independientes, y las dos
 * hacen falta: este Resource arma la respuesta campo por campo, y el
 * modelo `Usuario` además lo tiene en `$hidden` -- eso último protege
 * contra un `return $usuario;` directo que alguien escriba más adelante
 * sin pasar por acá.
 *
 * @mixin \App\Models\Usuario
 */
class UsuarioResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'nombres' => $this->nombres,
            'apellidos' => $this->apellidos,
            'nombreCompleto' => trim("{$this->nombres} {$this->apellidos}"),
            // Se calculan en el backend y no en Angular para que el avatar
            // sea idéntico en cualquier vista que lo muestre, sin repetir
            // la misma manipulación de strings en varios componentes.
            'iniciales' => $this->iniciales(),
            'email' => $this->email,
            'documento' => $this->documento,

            // El rol viaja con su código Y su etiqueta. El código es lo que
            // compara el guard/la directiva; la etiqueta es lo único que se
            // le muestra a una persona ('Docente', no 'profesor').
            'rol' => [
                'codigo' => $this->rol->nombre,
                'etiqueta' => $this->rol->etiqueta,
            ],

            // Nullable de verdad: `usuarios.sede_id` lo es en el esquema
            // (un super_admin podría no estar adscrito a ninguna sede).
            'sede' => $this->whenLoaded('sede', fn () => $this->sede === null ? null : [
                'id' => $this->sede->id,
                'nombre' => $this->sede->nombre,
                'tipo' => $this->sede->tipo,
                'vereda' => $this->sede->vereda,
                // Lo usa el ícono de estrella del menú: llena = sede
                // principal, contorno = escuela satélite. Es una regla real
                // del sistema de diseño, no decoración -- permite
                // distinguir la sede de un vistazo sin leer el nombre (ver
                // references/diseno-ui.md).
                'esPrincipal' => $this->sede->tipo === 'principal',
            ]),
        ];
    }

    private function iniciales(): string
    {
        $primera = fn (?string $texto) => mb_strtoupper(mb_substr(trim((string) $texto), 0, 1));

        return $primera($this->nombres).$primera($this->apellidos);
    }
}
