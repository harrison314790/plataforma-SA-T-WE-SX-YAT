<?php

namespace App\Http\Requests;

class MatricularRequest extends MatriculaRequest
{
    public function rules(): array
    {
        return [
            ...$this->reglasDeCurso(),
            'estudiante_id' => ['required', 'uuid'],
            'acudiente_id' => ['nullable', 'uuid'],
        ];
    }

    public function messages(): array
    {
        return ['estudiante_id.required' => 'Busca y elige al estudiante.'];
    }
}
