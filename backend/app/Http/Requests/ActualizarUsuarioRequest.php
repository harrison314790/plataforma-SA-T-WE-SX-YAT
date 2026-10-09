<?php

namespace App\Http\Requests;

use App\Models\Usuario;

/**
 * Edición de una cuenta. Lo que cambia respecto del alta:
 *
 * · El tipo NO se edita: sale de la fila. Convertir un profesor en
 *   estudiante no es "corregir un dato", es otra persona en el sistema
 *   (otra tabla de extensión, otro historial).
 * · No hay contraseña. Este formulario no la muestra ni la cambia.
 * · Lleva `activo`, el toggle "Cuenta activa".
 */
class ActualizarUsuarioRequest extends UsuarioRequest
{
    protected function usuarioActual(): ?Usuario
    {
        $usuario = $this->route('usuario');

        return $usuario instanceof Usuario ? $usuario : null;
    }

    protected function tipo(): ?string
    {
        return $this->usuarioActual()?->rol?->nombre;
    }

    public function rules(): array
    {
        return [
            ...parent::rules(),
            'activo' => ['required', 'boolean'],

            // Restablecer la contraseña: opcional. Si no viene, la actual no
            // se toca. Mismos límites que al crear (8 a 72: bcrypt ignora
            // lo que pase de 72 bytes).
            'password' => ['sometimes', 'nullable', 'string', 'min:8', 'max:72'],
        ];
    }

    public function messages(): array
    {
        return [
            ...parent::messages(),
            'password.min' => 'Mínimo 8 caracteres. Usa “Generar” si prefieres.',
        ];
    }
}
