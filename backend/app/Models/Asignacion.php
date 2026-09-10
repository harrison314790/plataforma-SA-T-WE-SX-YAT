<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Asignacion extends Model
{
    use HasUuids;

    protected $table = 'asignaciones';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = ['profesor_id', 'asignatura_id', 'sede_id', 'grado', 'periodo_id'];

    public function profesor(): BelongsTo
    {
        return $this->belongsTo(Profesor::class, 'profesor_id');
    }

    public function asignatura(): BelongsTo
    {
        return $this->belongsTo(Asignatura::class, 'asignatura_id');
    }

    public function sede(): BelongsTo
    {
        return $this->belongsTo(Sede::class, 'sede_id');
    }

    public function periodo(): BelongsTo
    {
        return $this->belongsTo(PeriodoAcademico::class, 'periodo_id');
    }

    public function notas(): HasMany
    {
        return $this->hasMany(Nota::class, 'asignacion_id');
    }

    public function excepcionesPlazo(): HasMany
    {
        return $this->hasMany(ExcepcionPlazo::class, 'asignacion_id');
    }

    /**
     * Matrículas del mismo sede/grado/período que esta asignación -- los
     * estudiantes que "le corresponden" a este profesor acá. Misma
     * relación que usa la política RLS `notas_profesor_inserta_dentro_de_plazo`
     * para validar que un estudiante es suyo.
     */
    public function matriculasCorrespondientes()
    {
        return Matricula::where('sede_id', $this->sede_id)
            ->where('grado', $this->grado)
            ->where('periodo_id', $this->periodo_id);
    }
}
