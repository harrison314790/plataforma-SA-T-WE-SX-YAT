<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Alta o edición de un nudo pedagógico (nombre + orden en el boletín).
 *
 * Sirve para crear y para editar: la única diferencia es que la regla de
 * nombre único ignora al propio nudo cuando se edita.
 */
class NudoPedagogicoRequest extends FormRequest
{
    /**
     * Escribir nudos es del nivel admin, igual que lo dice la política RLS
     * `nudos_pedagogicos_admin_escribe` -- mismo criterio que
     * AsignacionRequest: `permisos` es configurable, esta regla no.
     */
    public function authorize(): bool
    {
        return in_array($this->user()?->rol?->nombre, ['admin', 'super_admin'], true);
    }

    /**
     * El nombre se guarda en MAYÚSCULA, como sale en el boletín impreso.
     * `mb_strtoupper` y no `strtoupper`: los nombres en nasa yuwe llevan
     * letras como ẽ o ç que la versión de un byte rompería.
     */
    protected function prepareForValidation(): void
    {
        $nombre = $this->input('nombre');

        if (is_string($nombre)) {
            $this->merge(['nombre' => preg_replace('/\s+/u', ' ', mb_strtoupper(trim($nombre)))]);
        }
    }

    public function rules(): array
    {
        $nudo = $this->route('nudo');

        return [
            'nombre' => [
                'required', 'string', 'max:120',
                Rule::unique('nudos_pedagogicos', 'nombre')->ignore($nudo?->id),
            ],
            'orden' => ['required', 'integer', 'between:1,999'],
        ];
    }

    public function messages(): array
    {
        return [
            'nombre.unique' => 'Ya existe un nudo con ese nombre.',
        ];
    }
}
