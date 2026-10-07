<?php

namespace App\Http\Requests;

use App\Models\Matricula;
use Illuminate\Validation\Rule;

/**
 * Los motivos son la lista cerrada de `matriculas_motivo_retiro_check`;
 * "Otro" exige decir cuál (`matriculas_otro_con_detalle`). Validarlo acá
 * convierte esos dos checks en mensajes junto al campo, en vez de un 500.
 */
class RetirarMatriculaRequest extends MatriculaRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('detalle'))) {
            $this->merge(['detalle' => trim(preg_replace('/\s+/u', ' ', $this->input('detalle')))]);
        }
    }

    public function rules(): array
    {
        return [
            'motivo' => ['required', Rule::in(Matricula::MOTIVOS_RETIRO)],
            'detalle' => ['nullable', 'required_if:motivo,Otro', 'string', 'max:200'],
        ];
    }

    public function messages(): array
    {
        return [
            'motivo.required' => 'Elige el motivo del retiro.',
            'motivo.in' => 'Elige uno de los motivos de la lista.',
            'detalle.required_if' => 'Escribe brevemente el motivo.',
        ];
    }
}
