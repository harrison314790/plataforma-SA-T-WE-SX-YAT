<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Desactivar o reactivar algo que tiene columna `activo`:
 * `PATCH /asignaciones/{id}/activo` y `PATCH /oferta-grados/{id}/activo`.
 *
 * Endpoint propio, y no un campo más del formulario de edición, porque en
 * los dos casos es la salida que se le ofrece a quien intentó ELIMINAR
 * algo que no se puede borrar (una asignación con notas, un grado+grupo
 * con historial): ahí no se está editando nada, se está eligiendo la
 * alternativa segura.
 *
 * Sirve a los dos recursos porque el cuerpo es literalmente el mismo
 * (`{ activo: bool }`) y la autorización también (nivel admin). Quién
 * puede tocar CUÁL lo decide el `requiere.permiso` de cada ruta, no este
 * archivo.
 */
class CambiarEstadoRequest extends FormRequest
{
    /** Mismo criterio que AsignacionRequest -- ver su docblock. */
    public function authorize(): bool
    {
        $rol = $this->user()?->rol?->nombre;

        return in_array($rol, ['admin', 'super_admin'], true);
    }

    public function rules(): array
    {
        return [
            'activo' => ['required', 'boolean'],
        ];
    }
}
