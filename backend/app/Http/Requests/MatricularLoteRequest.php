<?php

namespace App\Http\Requests;

/**
 * El tope de 200 no es una regla de negocio: es un freno a un body
 * desproporcionado. Un curso real tiene decenas de estudiantes.
 */
class MatricularLoteRequest extends MatriculaRequest
{
    public function rules(): array
    {
        return [
            ...$this->reglasDeCurso(),
            'estudiante_ids' => ['required', 'array', 'min:1', 'max:200'],
            'estudiante_ids.*' => ['required', 'uuid'],
        ];
    }

    public function messages(): array
    {
        return ['estudiante_ids.required' => 'Selecciona al menos un estudiante.'];
    }
}
