<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Una combinación sede+grado+grupo del catálogo `oferta_grados`.
 *
 * Claves en camelCase, espejo de `OfertaGradoOpcion` en
 * `frontend/src/app/core/interfaces/asignacion.interface.ts`.
 *
 * `usos` NO es una columna: es cuántas asignaciones y matrículas
 * dependen de esta fila. Viaja con el catálogo porque es lo que decide
 * si el botón de la pantalla dice "Eliminar" o "Desactivar" -- la llave
 * foránea compuesta de 08-oferta-grados-por-sede.sql bloquea el DELETE
 * de cualquier fila con historial, y averiguarlo recién al pulsar el
 * botón significaría mostrar un error donde podía mostrarse la opción
 * correcta desde el principio.
 *
 * @mixin \App\Models\OfertaGrado
 */
class OfertaGradoResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sedeId' => $this->sede_id,
            'grado' => (int) $this->grado,
            'grupo' => $this->grupo,
            'activo' => (bool) $this->activo,

            // Los tres por separado y no una suma: "4 matrículas", "1
            // asignación" y "2 notas" mandan a lugares distintos si hay
            // que limpiarlos, y un total de 7 no dice a cuál. `notas` es
            // además el que cambia el tono del mensaje -- una
            // combinación con notas tiene trabajo de un profesor
            // adentro, no solo configuración.
            'usos' => [
                'asignaciones' => (int) ($this->asignaciones_count ?? 0),
                'matriculas' => (int) ($this->matriculas_count ?? 0),
                'notas' => (int) ($this->notas_count ?? 0),
            ],
        ];
    }
}
