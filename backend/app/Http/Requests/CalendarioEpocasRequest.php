<?php

namespace App\Http\Requests;

/**
 * "Editar fechas" del calendario de épocas: las fechas de inicio y cierre
 * de cada época de un año. Acá solo la FORMA (fechas válidas, cierre no
 * antes del inicio); el orden entre épocas, que estén dentro del año y
 * que se envíen todas las del año los valida NotaPeriodoService, que
 * puede decir el mensaje por época. La base lo garantiza al final
 * (22-epocas-por-fecha.sql).
 */
class CalendarioEpocasRequest extends CoordinacionNotasRequest
{
    public function rules(): array
    {
        return [
            'anio' => ['required', 'integer', 'between:2000,2100'],
            'epocas' => ['required', 'array', 'min:1', 'max:4'],
            'epocas.*.periodo_id' => ['required', 'integer', 'distinct', 'exists:periodos_academicos,id'],
            'epocas.*.fecha_inicio' => ['required', 'date_format:Y-m-d'],
            'epocas.*.fecha_fin' => ['required', 'date_format:Y-m-d', 'after_or_equal:epocas.*.fecha_inicio'],
        ];
    }

    public function messages(): array
    {
        return [
            'epocas.*.fecha_inicio.required' => 'Escribe la fecha de inicio y la de cierre.',
            'epocas.*.fecha_fin.required' => 'Escribe la fecha de inicio y la de cierre.',
            'epocas.*.fecha_inicio.date_format' => 'Escribe la fecha de inicio y la de cierre.',
            'epocas.*.fecha_fin.date_format' => 'Escribe la fecha de inicio y la de cierre.',
            'epocas.*.fecha_fin.after_or_equal' => 'El cierre debe ser después del inicio.',
        ];
    }
}
