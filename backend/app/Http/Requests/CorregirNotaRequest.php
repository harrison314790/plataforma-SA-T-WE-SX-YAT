<?php

namespace App\Http\Requests;

/**
 * Valor nuevo y motivo, los dos obligatorios. Que no sea igual al
 * anterior lo verifica NotaService (necesita la nota); el mínimo de 10
 * caracteres del motivo lo exige también la base (`historial_notas`).
 */
class CorregirNotaRequest extends CoordinacionNotasRequest
{
    public function rules(): array
    {
        return [
            'valor' => ['required', 'numeric', 'between:1,5', 'decimal:0,1'],
            'motivo' => ['required', 'string', 'min:10', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'valor.required' => 'Escribe el valor nuevo.',
            'valor.between' => 'La nota debe estar entre 1,0 y 5,0.',
            'valor.decimal' => 'La nota lleva como máximo un decimal.',
            'motivo.required' => 'Explica el motivo de la corrección.',
            'motivo.min' => 'Explica el motivo (mínimo 10 caracteres).',
        ];
    }
}
