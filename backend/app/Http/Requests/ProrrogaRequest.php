<?php

namespace App\Http\Requests;

/**
 * Dar o modificar la prórroga de una asignación en el período activo.
 * Que vaya más allá del cierre general lo valida NotaPeriodoService
 * (depende del estado del período).
 */
class ProrrogaRequest extends CoordinacionNotasRequest
{
    public function rules(): array
    {
        return [
            'asignacion_id' => ['required', 'uuid', 'exists:asignaciones,id'],
            'fecha_limite' => ['required', 'date', 'after:now'],
            'motivo' => ['required', 'string', 'min:8', 'max:300'],
        ];
    }

    public function messages(): array
    {
        return [
            'fecha_limite.required' => 'Escribe fecha y hora completas.',
            'fecha_limite.after' => 'Debe ser una fecha futura.',
            'motivo.required' => 'Escribe el motivo.',
            'motivo.min' => 'Escribe el motivo (mínimo 8 caracteres).',
        ];
    }
}
