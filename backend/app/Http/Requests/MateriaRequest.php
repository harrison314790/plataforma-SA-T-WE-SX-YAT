<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Alta o edición de una materia (asignatura) desde Nudos pedagógicos.
 *
 * El código solo se recibe al CREAR: después lo usan las asignaciones, la
 * malla y las notas para identificar la materia, y cambiarlo rompería esa
 * referencia en los reportes. Al editar, `codigo` ni siquiera está en las
 * reglas, así que `validated()` no lo trae aunque el cliente lo mande.
 */
class MateriaRequest extends FormRequest
{
    /** Escribir materias es del nivel admin, igual que la política RLS `asignaturas_admin_escribe`. */
    public function authorize(): bool
    {
        return in_array($this->user()?->rol?->nombre, ['admin', 'super_admin'], true);
    }

    /**
     * Nombre con un solo espacio entre palabras; código en mayúscula. El
     * código se compara en mayúscula porque `asignaturas.codigo` es unique
     * y sensible a mayúsculas: 'dan' y 'DAN' serían dos materias.
     */
    protected function prepareForValidation(): void
    {
        $nombre = $this->input('nombre');
        $codigo = $this->input('codigo');

        $this->merge(array_filter([
            'nombre' => is_string($nombre) ? preg_replace('/\s+/u', ' ', trim($nombre)) : null,
            'codigo' => is_string($codigo) ? mb_strtoupper(trim($codigo)) : null,
        ], fn ($valor) => $valor !== null));
    }

    public function rules(): array
    {
        $materia = $this->route('asignatura');

        $reglas = [
            'nombre' => [
                'required', 'string', 'max:120',
                Rule::unique('asignaturas', 'nombre')->ignore($materia?->id),
            ],
            'nudo_pedagogico_id' => ['present', 'nullable', 'integer', 'exists:nudos_pedagogicos,id'],
        ];

        if ($materia === null) {
            $reglas['codigo'] = ['required', 'string', 'regex:/^[A-Z]{2,6}$/', 'unique:asignaturas,codigo'];
        }

        return $reglas;
    }

    public function messages(): array
    {
        return [
            'nombre.required' => 'Escribe el nombre de la materia.',
            'nombre.unique' => 'Ya existe una materia con ese nombre.',
            'codigo.required' => 'Escribe el código de la materia.',
            'codigo.regex' => 'Usa de 2 a 6 letras, sin tildes ni espacios.',
            'codigo.unique' => 'Ese código ya lo usa otra materia.',
        ];
    }
}
