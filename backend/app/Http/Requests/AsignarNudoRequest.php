<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A qué nudo pertenece una materia. `null` la deja sin nudo (no entra en
 * ningún cálculo de boletín hasta que se la ubique).
 */
class AsignarNudoRequest extends FormRequest
{
    /** Mismo criterio que NudoPedagogicoRequest. */
    public function authorize(): bool
    {
        return in_array($this->user()?->rol?->nombre, ['admin', 'super_admin'], true);
    }

    public function rules(): array
    {
        return [
            'nudo_pedagogico_id' => ['present', 'nullable', 'integer', 'exists:nudos_pedagogicos,id'],
        ];
    }
}
