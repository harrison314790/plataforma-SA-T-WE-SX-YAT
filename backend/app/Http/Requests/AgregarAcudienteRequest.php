<?php

namespace App\Http\Requests;

use App\Services\MatriculaService;
use Illuminate\Validation\Rule;

/**
 * Acudiente que matricula: solo madre o padre (lo que pide el formulario
 * de matrícula). Cédula y celular se limpian antes de validar -- se
 * dictan con puntos y espacios ("300 123 4567").
 */
class AgregarAcudienteRequest extends MatriculaRequest
{
    protected function prepareForValidation(): void
    {
        $limpio = fn ($v) => is_string($v) ? trim(preg_replace('/\s+/u', ' ', $v)) : $v;
        $digitos = fn ($v) => is_string($v) ? preg_replace('/\D/', '', $v) : $v;

        $this->merge(array_filter([
            'nombres' => $limpio($this->input('nombres')),
            'apellidos' => $limpio($this->input('apellidos')),
            'documento' => $digitos($this->input('documento')),
            'telefono' => $digitos($this->input('telefono')),
            'parentesco' => is_string($this->input('parentesco')) ? mb_strtolower(trim($this->input('parentesco'))) : null,
        ], fn ($v) => $v !== null));
    }

    public function rules(): array
    {
        return [
            'estudiante_id' => ['required', 'uuid'],
            'parentesco' => ['required', Rule::in(MatriculaService::PARENTESCOS)],
            'nombres' => ['required', 'string', 'min:2', 'max:80'],
            'apellidos' => ['required', 'string', 'min:2', 'max:80'],
            'documento' => ['required', 'regex:/^\d{6,10}$/'],
            'telefono' => ['required', 'regex:/^3\d{9}$/'],
        ];
    }

    public function messages(): array
    {
        return [
            'parentesco.required' => 'Elige si es la madre o el padre.',
            'parentesco.in' => 'Elige si es la madre o el padre.',
            'documento.regex' => 'De 6 a 10 dígitos, sin puntos.',
            'telefono.regex' => '10 dígitos y empieza por 3.',
        ];
    }

    public function attributes(): array
    {
        return [...parent::attributes(), 'documento' => 'cédula', 'telefono' => 'celular'];
    }
}
