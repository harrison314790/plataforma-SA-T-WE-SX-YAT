<?php

namespace App\Http\Requests;

/**
 * El interruptor y la fecha límite se cambian por separado desde la
 * pantalla, así que los dos son opcionales -- pero al menos uno tiene que
 * venir. Una fecha pasada se acepta a propósito: cierra la carga ya mismo.
 */
class PlazoNotasRequest extends CoordinacionNotasRequest
{
    public function rules(): array
    {
        return [
            'notas_habilitadas' => ['required_without:fecha_limite_notas', 'boolean'],
            'fecha_limite_notas' => ['required_without:notas_habilitadas', 'date'],
        ];
    }

    public function messages(): array
    {
        return [
            'fecha_limite_notas.date' => 'Escribe fecha y hora completas.',
        ];
    }
}
