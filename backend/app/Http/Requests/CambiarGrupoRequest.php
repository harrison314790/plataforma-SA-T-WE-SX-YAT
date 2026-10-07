<?php

namespace App\Http\Requests;

/** El grado no viaja: cambiar de grupo nunca cambia el grado. */
class CambiarGrupoRequest extends MatriculaRequest
{
    public function rules(): array
    {
        return [
            'sede_id' => ['required', 'integer', 'exists:sedes,id'],
            'grupo' => ['required', 'string', 'max:20'],
        ];
    }

    public function messages(): array
    {
        return ['grupo.required' => 'Elige el grupo nuevo.'];
    }
}
