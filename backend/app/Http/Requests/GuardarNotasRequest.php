<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * "Revisar y guardar": varias notas de UNA asignación y UN período, todo o
 * nada (ver NotaService::registrarLote).
 *
 * Responsabilidad de este Form Request: "¿tiene forma válida?" -- tipos,
 * rangos, que no venga dos veces el mismo estudiante. NO responde "¿esta
 * asignación es tuya?" ni "¿el estudiante está en el curso?": eso es
 * ALCANCE DE DATOS y lo resuelve RLS al insertar (y NotaService antes,
 * para dar un mensaje legible).
 *
 * `exists:asignaciones,id` corre bajo RLS (la app nunca usa el
 * superusuario): si el profesor manda una asignación ajena, para su sesión
 * esa fila no existe y se rechaza como "no existe", sin revelar de quién
 * es.
 *
 * El valor llega ya normalizado por Angular (45 -> 4.5), pero se valida
 * igual el decimal único: la base guarda `numeric` sin escala fija y un
 * 4.55 entraría tal cual.
 */
class GuardarNotasRequest extends FormRequest
{
    public function authorize(): bool
    {
        // La capa 2 (¿este rol puede usar btn_registrar_nota?) ya la
        // resolvió el middleware `requiere.permiso`.
        return true;
    }

    public function rules(): array
    {
        return [
            'asignacion_id' => ['required', 'uuid', 'exists:asignaciones,id'],
            'periodo_id' => ['required', 'integer', 'exists:periodos_academicos,id'],
            'notas' => ['required', 'array', 'min:1', 'max:80'],
            'notas.*.estudiante_id' => ['required', 'uuid', 'distinct'],
            'notas.*.valor' => ['required', 'numeric', 'between:1,5', 'decimal:0,1'],
        ];
    }

    public function messages(): array
    {
        return [
            'notas.required' => 'Escribe al menos una nota.',
            'notas.*.valor.between' => 'Cada nota debe estar entre 1,0 y 5,0.',
            'notas.*.valor.decimal' => 'Cada nota lleva como máximo un decimal.',
            'notas.*.estudiante_id.distinct' => 'Un estudiante aparece dos veces.',
        ];
    }
}
