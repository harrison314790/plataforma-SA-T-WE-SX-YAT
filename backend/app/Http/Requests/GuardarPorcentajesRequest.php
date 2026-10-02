<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Forma de la entrada al guardar los porcentajes de un grado. Solo la
 * FORMA: que sumen 100 y que las materias sean las del nudo lo valida
 * PorcentajeGradoService, porque necesita cruzar con las asignaciones.
 */
class GuardarPorcentajesRequest extends FormRequest
{
    /** Escribir porcentajes es del nivel admin, igual que la política RLS. */
    public function authorize(): bool
    {
        return in_array($this->user()?->rol?->nombre, ['admin', 'super_admin'], true);
    }

    public function rules(): array
    {
        return [
            'grado' => ['required', 'integer', 'between:6,11'],
            'anio' => ['required', 'integer', 'between:2000,2100'],
            'nudos' => ['required', 'array', 'min:1'],
            'nudos.*.nudo_id' => ['required', 'integer', 'distinct', 'exists:nudos_pedagogicos,id'],
            'nudos.*.pesos' => ['present', 'array'],
            'nudos.*.pesos.*.asignatura_id' => ['required', 'integer'],
            'nudos.*.pesos.*.peso' => ['required', 'numeric', 'gt:0', 'max:100', 'decimal:0,2'],
        ];
    }

    public function messages(): array
    {
        return [
            'grado.between' => 'Los porcentajes solo aplican a secundaria (grados 6 a 11). Primaria siempre usa promedio simple.',
            'nudos.*.pesos.*.peso.gt' => 'Cada porcentaje tiene que ser mayor que 0.',
            'nudos.*.pesos.*.peso.max' => 'Ningún porcentaje puede pasar de 100.',
            'nudos.*.pesos.*.peso.decimal' => 'Los porcentajes admiten hasta dos decimales.',
        ];
    }
}
