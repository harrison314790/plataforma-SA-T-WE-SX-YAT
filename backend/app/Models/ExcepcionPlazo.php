<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
    ];

    protected function casts(): array
    {
        return ['fecha_limite_extendida' => 'datetime'];
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

    public function estaVigente(): bool
    {
        return now()->lessThanOrEqualTo($this->fecha_limite_extendida);
    }
}
