<?php

namespace App\Http\Requests;

use App\Models\Usuario;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Base común de crear/editar una cuenta de profesor o estudiante. La forma
 * se escribe UNA vez acá; las subclases solo declaran lo que cambia (crear
 * pide `tipo` y contraseña, editar pide `activo`) -- mismo esquema que
 * AsignacionRequest.
 *
 * Las reglas de unicidad (documento, email) son la traducción legible de
 * los `unique` que Postgres ya impone en `usuarios`: sin ellas, repetir un
 * documento sube como un 500 con el error crudo de la base. Nombran a la
 * persona dueña del dato ("Ya hay una cuenta con este documento: Marta
 * Ríos") porque eso es lo que le dice a la secretaria si es un error de
 * tipeo o la misma persona registrada dos veces.
 */
abstract class UsuarioRequest extends FormRequest
{
    /**
     * Mismo criterio que AsignacionRequest: `permisos` es configurable,
     * pero escribir en `usuarios` es del nivel admin pase lo que pase, igual
     * que lo dicen las políticas RLS de la tabla.
     */
    public function authorize(): bool
    {
        $rol = $this->user()?->rol?->nombre;

        return in_array($rol, ['admin', 'super_admin'], true);
    }

    /**
     * Limpieza antes de validar: espacios repetidos en los nombres (se
     * copian de documentos escaneados con dobles espacios), el email en
     * minúsculas (Postgres compara `unique` con mayúsculas incluidas, y
     * `Marta.Rios@` y `marta.rios@` serían dos cuentas distintas) y el
     * documento sin puntos ni espacios ("10.612.233" se escribe así en la
     * cédula).
     */
    protected function prepareForValidation(): void
    {
        $limpio = fn ($v) => is_string($v) ? trim(preg_replace('/\s+/u', ' ', $v)) : $v;

        $this->merge(array_filter([
            'nombres' => $limpio($this->input('nombres')),
            'apellidos' => $limpio($this->input('apellidos')),
            'email' => is_string($this->input('email')) ? mb_strtolower(trim($this->input('email'))) : $this->input('email'),
            'documento' => is_string($this->input('documento'))
                ? preg_replace('/[\s.\-]/', '', $this->input('documento'))
                : $this->input('documento'),
        ], fn ($v) => $v !== null));
    }

    /** El tipo de cuenta: al crear viene del body; al editar, de la fila. */
    abstract protected function tipo(): ?string;

    /** La fila que se está editando, para que la unicidad se ignore a sí misma. */
    protected function usuarioActual(): ?Usuario
    {
        return null;
    }

    public function rules(): array
    {
        return [
            'nombres' => ['required', 'string', 'max:100'],
            'apellidos' => ['required', 'string', 'max:100'],

            // De 6 a 11 dígitos: cédula (hasta 10), NUIP/registro civil
            // (10) y la tarjeta de identidad vieja (11). Solo números,
            // porque así se busca después desde la tabla.
            'documento' => ['required', 'string', 'regex:/^\d{6,11}$/', $this->reglaUnica('documento')],

            'email' => ['required', 'string', 'email', 'max:150', $this->reglaUnica('email')],

            // La sede es del PROFESOR. La del estudiante sale de su
            // matrícula (módulo Matrículas), no de la cuenta, así que acá
            // se prohíbe en vez de ignorarse en silencio.
            'sede_id' => $this->tipo() === 'profesor'
                ? ['required', 'integer', 'exists:sedes,id']
                : ['prohibited'],
        ];
    }

    /**
     * Unicidad con nombre propio. Una regla `unique` de Laravel no puede
     * decir de QUIÉN es el dato repetido; esta sí.
     */
    private function reglaUnica(string $columna): Closure
    {
        return function (string $atributo, mixed $valor, Closure $fallar) use ($columna) {
            $duenio = Usuario::query()
                ->where($columna, $valor)
                ->when($this->usuarioActual(), fn ($q, Usuario $u) => $q->whereKeyNot($u->getKey()))
                ->first(['nombres', 'apellidos']);

            if ($duenio === null) {
                return;
            }

            $nombre = trim("{$duenio->nombres} {$duenio->apellidos}");

            $fallar($columna === 'documento'
                ? "Ya hay una cuenta con este documento: {$nombre}."
                : "Este email ya lo usa {$nombre}.");
        };
    }

    public function messages(): array
    {
        return [
            'nombres.required' => 'Escribe los nombres.',
            'apellidos.required' => 'Escribe los apellidos.',
            'documento.required' => 'Escribe el número de documento.',
            'documento.regex' => 'Solo números, de 6 a 11 dígitos.',
            'email.required' => 'Escribe el email.',
            'email.email' => 'Escribe un email válido, por ejemplo nombre@dominio.edu.co.',
            'sede_id.required' => 'Elige la sede.',
            'sede_id.exists' => 'Esa sede no existe.',
            'sede_id.prohibited' => 'La sede del estudiante se asigna en Matrículas, no en su cuenta.',
        ];
    }
}
