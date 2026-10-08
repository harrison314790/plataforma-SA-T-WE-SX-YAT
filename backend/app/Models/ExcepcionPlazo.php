<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * La prórroga individual de una asignación en un período. "Quitarla" no
 * borra la fila: la marca revocada (21-notas-modulo.sql), y un índice
 * único parcial deja una sola viva por asignación y período.
 */
class ExcepcionPlazo extends Model
{
    use HasUuids;

    protected $table = 'excepciones_plazo';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'profesor_id', 'asignacion_id', 'periodo_id',
        'fecha_limite_extendida', 'autorizado_por', 'motivo',
        'actualizada_en', 'revocada_en', 'revocada_por',
    ];

    protected function casts(): array
    {
        return [
            'fecha_limite_extendida' => 'datetime',
            'created_at' => 'datetime',
            'actualizada_en' => 'datetime',
            'revocada_en' => 'datetime',
        ];
    }

    public function profesor(): BelongsTo
    {
        return $this->belongsTo(Profesor::class, 'profesor_id');
    }

    public function asignacion(): BelongsTo
    {
        return $this->belongsTo(Asignacion::class, 'asignacion_id');
    }

    public function periodo(): BelongsTo
    {
        return $this->belongsTo(PeriodoAcademico::class, 'periodo_id');
    }

    public function autorizadoPor(): BelongsTo
    {
        return $this->belongsTo(Usuario::class, 'autorizado_por');
    }

    /** Las no revocadas -- vencidas o no. */
    public function scopeVivas(Builder $query): Builder
    {
        return $query->whereNull('revocada_en');
    }

    /** Misma condición que la rama de prórroga de `notas_profesor_inserta_dentro_de_plazo`. */
    public function estaVigente(): bool
    {
        return $this->revocada_en === null && now()->lessThanOrEqualTo($this->fecha_limite_extendida);
    }
}
