<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * El período académico en curso, tal como lo muestra la regla de período
 * de la barra superior.
 *
 * POR QUÉ `diasRestantes` SE CALCULA ACÁ Y NO EN ANGULAR
 * Porque el reloj del navegador no es una fuente confiable en este
 * contexto: los equipos de la escuela son compartidos y varios tienen la
 * fecha mal puesta. Si Angular restara `fechaLimiteNotas - Date.now()`, a
 * un profesor le podría decir que le quedan 12 días para cargar notas
 * cuando el servidor ya cerró el plazo -- y el servidor es quien manda,
 * porque es su `now()` el que evalúa la política RLS
 * `notas_profesor_inserta_dentro_de_plazo`. Mismo criterio con
 * `dentroDePlazo`: se responde con la misma condición que la política, no
 * con una comparación aparte en el cliente.
 *
 * @mixin \App\Models\PeriodoAcademico
 */
class PeriodoActivoResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'nombre' => $this->nombre,
            'anio' => $this->anio,
            'numero' => $this->numero,
            'fechaInicio' => $this->fecha_inicio?->toDateString(),
            'fechaFin' => $this->fecha_fin?->toDateString(),
            'fechaLimiteNotas' => $this->fecha_limite_notas?->toIso8601String(),
            'notasHabilitadas' => $this->notas_habilitadas,

            // Negativo = el plazo ya venció. Se manda con signo en vez de
            // recortar a 0 para que la barra superior pueda decir "cerró
            // hace 3 días", que es información distinta de "cierra hoy".
            // Días COMPLETOS que faltan (13 días y 13 horas = 13), igual que
            // la banda del módulo de Notas. Antes se contaban días de
            // calendario en UTC y la barra decía "Cierra en 14 días" junto
            // a una banda que decía "faltan 13".
            'diasRestantes' => (int) floor(now()->diffInSeconds($this->fecha_limite_notas, false) / 86400),

            // La misma pregunta que responde la política RLS de inserción
            // de notas, contestada con el método del modelo para no
            // reescribir la condición. Un profesor con una excepción de
            // plazo vigente puede seguir cargando aunque esto sea false:
            // esto habla del período, no de un caso particular.
            'dentroDePlazo' => $this->resource->estaDentroDePlazo(),
        ];
    }
}
