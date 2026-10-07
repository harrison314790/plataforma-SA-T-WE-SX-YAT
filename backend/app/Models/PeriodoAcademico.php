<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PeriodoAcademico extends Model
{
    protected $table = 'periodos_academicos';

    public $timestamps = false;

    protected $fillable = [
        'nombre', 'anio', 'numero', 'fecha_inicio', 'fecha_fin',
        'fecha_limite_notas', 'notas_habilitadas', 'activo',
    ];

    protected function casts(): array
    {
        return [
            'fecha_inicio' => 'date',
            'fecha_fin' => 'date',
            'fecha_limite_notas' => 'datetime',
            'notas_habilitadas' => 'boolean',
            'activo' => 'boolean',
        ];
    }

    // No hay asignaciones(): HasMany acá -- desde
    // 09-asignaciones-por-anio.sql, `asignaciones` ya no tiene
    // `periodo_id` (tiene `anio`), así que "las asignaciones de este
    // período" dejó de ser una relación 1:N bien definida -- las mismas
    // asignaciones son compartidas por los 4 períodos de su año. Ver
    // Asignacion::matriculasCorrespondientes() para el cruce real
    // (por `anio`, no por `periodo_id`). Tampoco hay matriculas(): desde
    // 20-matriculas-por-anio.sql la matrícula también es por año.

    public function excepcionesPlazo(): HasMany
    {
        return $this->hasMany(ExcepcionPlazo::class, 'periodo_id');
    }

    /**
     * "¿Sigue habilitado y dentro de fecha?" -- la misma pregunta que
     * responde la política RLS `notas_profesor_inserta_dentro_de_plazo`.
     * Repetirla acá es a propósito (ver NotaService) para poder devolver
     * un mensaje de error claro ANTES de chocar contra RLS -- no
     * reemplaza la política, RLS sigue siendo la autoridad final.
     */
    public function estaDentroDePlazo(): bool
    {
        return $this->notas_habilitadas && now()->lessThanOrEqualTo($this->fecha_limite_notas);
    }
}
