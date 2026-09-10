<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PeriodoAcademico extends Model
{
    use HasUuids;

    protected $table = 'periodos_academicos';

    public $incrementing = false;

    protected $keyType = 'string';

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

    public function asignaciones(): HasMany
    {
        return $this->hasMany(Asignacion::class, 'periodo_id');
    }

    public function matriculas(): HasMany
    {
        return $this->hasMany(Matricula::class, 'periodo_id');
    }

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
