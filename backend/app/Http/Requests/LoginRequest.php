<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        // No hay nada que autorizar todavía -- es el propio login.
        return true;
    }

    /**
     * Los correos se guardan en minúsculas (UsuarioRequest). Sin esto, el
     * teclado del celular -- que pone la primera letra en mayúscula -- hacía
     * fallar el login con "Correo o contraseña incorrectos".
     */
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge(['email' => mb_strtolower(trim($this->input('email')))]);
        }
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ];
    }
}
