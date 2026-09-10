<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Único lugar que decide qué campos de `Nota` viajan al frontend, y con
 * qué nombre. Las claves son camelCase a propósito: coinciden 1:1 con
 * `frontend/src/app/core/interfaces/nota.interface.ts`, para no tener que
 * traducir de snake_case en Angular. Un cambio de formato de respuesta se
 * hace acá, nunca tocando el controlador.
 *
 * @mixin \App\Models\Nota
 */
class NotaResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'estudianteId' => $this->estudiante_id,
            'asignacionId' => $this->asignacion_id,
            'valor' => (float) $this->valor,
            'enRevision' => $this->en_revision,
            'registradoPor' => $this->registrado_por,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
