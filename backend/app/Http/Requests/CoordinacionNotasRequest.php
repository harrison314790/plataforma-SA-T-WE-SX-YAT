<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Base de los Form Requests de coordinación en el módulo de notas (plazo,
 * prórrogas, correcciones, iniciar período). Mismo criterio que
 * MatriculaRequest: los `btn_*` son configurables por super_admin, pero
 * escribir en `periodos_academicos`, `excepciones_plazo` o corregir
 * `notas` es del nivel admin pase lo que pase -- igual que lo dicen sus
 * políticas RLS (`fn_es_admin()`).
 */
abstract class CoordinacionNotasRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->rol?->nombre, ['admin', 'super_admin'], true);
    }

    /** Recorta y colapsa espacios del motivo: una fila de espacios no cuenta como texto. */
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('motivo'))) {
            $this->merge(['motivo' => trim(preg_replace('/\s+/u', ' ', $this->input('motivo')))]);
        }
    }
}
