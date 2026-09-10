<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Responsabilidad de este Form Request: "¿tiene forma válida este dato?"
 * -- tipos, campos obligatorios, rangos. NO responde "¿le pertenece esta
 * asignación a este profesor?" ni "¿está el estudiante matriculado acá?"
 * -- esas son preguntas de ALCANCE DE DATOS y las resuelve RLS al hacer
 * el insert (ver notas_profesor_inserta_dentro_de_plazo en base-datos.md).
 * Si se duplicara esa verificación acá, tendríamos la misma regla en dos
 * lugares que se pueden desincronizar con el tiempo.
 *
 * `exists:estudiantes,id` / `exists:asignaciones,id` sí corren contra la
 * conexión de Postgres con RLS activo (la app nunca usa el superusuario)
 * -- así que, como efecto colateral correcto, si el profesor manda el id
 * de una asignación que no es suya, esa fila es invisible para su sesión
 * y `exists` la rechaza como "no existe", no como "no te pertenece". Es
 * un mensaje menos preciso pero no filtra si esa asignación es de otro
 * profesor.
 */
class RegistrarNotaRequest extends FormRequest
{
    public function authorize(): bool
    {
        // La capa 2 (¿puede este rol usar btn_registrar_nota?) ya la
        // resolvió el middleware `requiere.permiso` antes de llegar acá.
        return true;
    }

    public function rules(): array
    {
        return [
            'estudiante_id' => ['required', 'uuid', 'exists:estudiantes,id'],
            'asignacion_id' => ['required', 'uuid', 'exists:asignaciones,id'],
            'valor' => ['required', 'numeric', 'between:1.0,5.0'],
        ];
    }

    public function messages(): array
    {
        return [
            'valor.between' => 'La nota debe ser un número entre 1.0 y 5.0.',
        ];
    }
}
