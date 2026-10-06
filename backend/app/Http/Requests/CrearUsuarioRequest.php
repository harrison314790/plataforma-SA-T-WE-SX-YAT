<?php

namespace App\Http\Requests;

/**
 * Alta de una cuenta. Lo que agrega a la base común: el `tipo` (solo
 * profesor o estudiante -- este módulo no crea admins ni super_admins, y
 * no hay forma de pedirlo por el body) y la contraseña inicial.
 */
class CrearUsuarioRequest extends UsuarioRequest
{
    protected function tipo(): ?string
    {
        $tipo = $this->input('tipo');

        return is_string($tipo) ? $tipo : null;
    }

    public function rules(): array
    {
        return [
            'tipo' => ['required', 'in:profesor,estudiante'],
            ...parent::rules(),

            // Mínimo 8. Máximo 72 porque bcrypt ignora en silencio todo lo
            // que pase de 72 bytes: una contraseña más larga "funcionaría"
            // con cualquier sufijo, que es peor que rechazarla.
            'password' => ['required', 'string', 'min:8', 'max:72'],
        ];
    }

    public function messages(): array
    {
        return [
            ...parent::messages(),
            'tipo.in' => 'Solo se pueden crear cuentas de profesor o de estudiante.',
            'password.required' => 'Escribe la contraseña inicial, o usa “Generar”.',
            'password.min' => 'Mínimo 8 caracteres. Usa “Generar” si prefieres.',
            'password.max' => 'Máximo 72 caracteres.',
        ];
    }
}
