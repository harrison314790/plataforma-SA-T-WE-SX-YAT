<?php

namespace App\Http\Requests;

use App\Models\OfertaGrado;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Alta de un grado+grupo en una sede (`oferta_grados`).
 *
 * A diferencia del formulario de asignaciones, acá SÍ se pide la sede:
 * no hay un profesor del que deducirla, y decidir que La Laguna abre
 * quinto es precisamente una decisión sobre una sede concreta.
 */
class CrearOfertaGradoRequest extends FormRequest
{
    /**
     * Acentos que se quitan del grupo, y los que NO.
     *
     * Las cinco vocales tildadas y la diéresis se normalizan porque son
     * marcas de acento: 'ÚNICO' y 'UNICO' son la misma palabra escrita
     * por dos personas distintas, y la diferencia es invisible en una
     * tabla.
     *
     * La Ñ NO está en esta lista, y es deliberado: no es una vocal con
     * tilde, es una letra propia del español. Convertirla a N cambiaría
     * la palabra, no su ortografía.
     */
    private const SIN_TILDE = [
        'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ü' => 'U',
        'À' => 'A', 'È' => 'E', 'Ì' => 'I', 'Ò' => 'O', 'Ù' => 'U',
    ];

    /** Mismo criterio que AsignacionRequest -- ver su docblock. */
    public function authorize(): bool
    {
        $rol = $this->user()?->rol?->nombre;

        return in_array($rol, ['admin', 'super_admin'], true);
    }

    /**
     * El grupo se normaliza ANTES de validar: sin espacios, en MAYÚSCULA
     * y SIN TILDE.
     *
     * No es cosmético. La unicidad de la tabla es
     * `unique (sede_id, grado, grupo)` y Postgres compara cadenas byte a
     * byte, así que 'a', 'A', 'único' y 'UNICO' son cuatro grupos
     * distintos para la base. Sin normalizar, la misma aula se da de
     * alta varias veces sin que nadie lo note, y después media
     * institución queda matriculada en '9-A' y la otra media en '9-a',
     * sin que ninguna consulta las junte. Arreglar eso después es migrar
     * datos; evitarlo acá son tres líneas.
     *
     * El caso que lo vuelve urgente es 'ÚNICO', que es la convención de
     * este proyecto para una escuela de vereda con un aula por grado
     * (ver 08-oferta-grados-por-sede.sql): es una palabra con tilde que
     * la mitad de la gente va a escribir con acento y la otra mitad no.
     */
    protected function prepareForValidation(): void
    {
        $grupo = $this->input('grupo');

        if (is_string($grupo)) {
            $this->merge(['grupo' => strtr(mb_strtoupper(trim($grupo)), self::SIN_TILDE)]);
        }
    }

    public function rules(): array
    {
        return [
            'sede_id' => ['required', 'integer', 'exists:sedes,id'],
            'grado' => ['required', 'integer', 'between:1,11'],
            'grupo' => [
                'required',
                'string',
                // 10 caracteres alcanzan para 'A' y para 'UNICO'.
                'max:10',
                // Solo letras y números, sin espacios: el grupo se pinta en
                // "9-B" y se compara letra por letra con matrículas y
                // asignaciones. Antes entraba "B C!".
                'regex:/^[A-Z0-9]+$/',
                $this->reglaDeDuplicado(),
            ],
        ];
    }

    /**
     * Rechaza un duplicado, con un mensaje distinto según el estado del
     * que ya existe.
     *
     * Es una regla propia y no `Rule::unique`, y la diferencia importa:
     * `unique` solo sabe decir "ya está registrado", y eso deja a la
     * persona sin saber qué hacer en el caso más confuso -- el grupo
     * existe pero está DESACTIVADO, así que no aparece en los
     * selectores de asignaciones y parece que no existiera. El mensaje
     * genérico la mandaría a buscar un duplicado que no ve. Este le dice
     * exactamente dónde está y qué hacer.
     *
     * La normalización de `prepareForValidation` ya corrió cuando esto
     * se evalúa, así que buscar 'unico' encuentra la fila 'UNICO' que ya
     * estaba -- que es justamente el duplicado que hay que atajar.
     */
    private function reglaDeDuplicado(): Closure
    {
        return function (string $atributo, mixed $valor, Closure $fallar): void {
            $existente = OfertaGrado::query()
                ->where('sede_id', $this->input('sede_id'))
                ->where('grado', $this->input('grado'))
                ->where('grupo', $valor)
                ->first();

            if ($existente === null) {
                return;
            }

            $fallar(
                $existente->activo
                    ? "Esa sede ya tiene el grado {$existente->grado} grupo {$existente->grupo} dado de alta. Aparece en la lista de abajo."
                    : "Esa sede ya tiene el grado {$existente->grado} grupo {$existente->grupo}, pero está DESACTIVADO. Reactivalo desde la lista de abajo en vez de crearlo de nuevo: así el historial de asignaciones y matrículas que ya tiene sigue sirviendo."
            );
        };
    }

    public function messages(): array
    {
        return [
            'grupo.regex' => 'El grupo lleva solo letras o números, sin espacios: A, B, UNICO…',
        ];
    }
}
