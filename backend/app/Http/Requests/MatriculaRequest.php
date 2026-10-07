<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Base de los Form Requests de Matrículas: solo la autorización, que es
 * la misma para todas las acciones. Mismo criterio que UsuarioRequest:
 * `permisos` es configurable, pero escribir en `matriculas` es del nivel
 * admin pase lo que pase, igual que lo dicen sus políticas RLS.
 *
 * Cada subclase valida solo la FORMA de la entrada; las reglas que
 * cruzan datos (ya matriculado, graduado, grupo cerrado) son de
 * MatriculaService, que puede explicarlas con nombres.
 */
abstract class MatriculaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->rol?->nombre, ['admin', 'super_admin'], true);
    }

    /** Las reglas del destino (sede, grado, grupo), compartidas por matricular y lote. */
    protected function reglasDeCurso(): array
    {
        return [
            'anio' => ['required', 'integer', 'between:2000,2100'],
            'sede_id' => ['required', 'integer', 'exists:sedes,id'],
            'grado' => ['required', 'integer', 'between:1,11'],
            'grupo' => ['required', 'string', 'max:20'],
        ];
    }

    public function attributes(): array
    {
        return [
            'estudiante_id' => 'estudiante',
            'estudiante_ids' => 'estudiantes',
            'sede_id' => 'sede',
            'acudiente_id' => 'acudiente',
        ];
    }
}
