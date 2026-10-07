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

    // `anio`, no `periodo_id`: desde 09-asignaciones-por-anio.sql, una
    // asignación es un acto anual (quién dicta qué), no uno por período --
    // cubre los 4 períodos del año a la vez. `periodo_id` vive ahora en
    // `Nota` (la calificación sí es por período).
    // `activo`, `creado_por` y `created_at` los agrega
    // 11-asignaciones-modulo.sql: la tabla no tenía estado ni auditoría
    // porque hasta ahora no se escribía desde ningún endpoint -- las
    // filas venían sembradas por 03-datos-prueba.sql. `creado_por` lo
    // pone AsignacionService con el usuario de la sesión, nunca el
    // cliente; `created_at` lo pone Postgres (default now()), por eso
    // `$timestamps` sigue en false como en el resto de los modelos.
    protected $fillable = [
        'profesor_id', 'asignatura_id', 'sede_id', 'grado', 'grupo', 'anio',
        'activo', 'creado_por',
    ];

    protected function casts(): array
    {
        return [
            'grado' => 'integer',
            'anio' => 'integer',
            'activo' => 'boolean',
            'created_at' => 'datetime',
        ];
    }

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

    public function creadoPor(): BelongsTo
    {
        return $this->belongsTo(Usuario::class, 'creado_por');
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
     * Matrículas del mismo sede/grado/grupo que esta asignación, en SU
     * año -- los estudiantes que "le corresponden" a este profesor acá.
     * Misma relación que usa la política RLS
     * `notas_profesor_inserta_dentro_de_plazo` para validar que un
     * estudiante es suyo.
     *
     * Asignación y matrícula son las dos por año (09 y
     * 20-matriculas-por-anio.sql), así que el cruce es `anio` contra
     * `anio`. Incluye las retiradas: quien llama decide si las muestra
     * (la política de inserción de notas sí exige `estado = 'activa'`).
     *
     * `grupo` es parte de la comparación a propósito, no un descuido: desde
     * que `grado`/`grupo` se separaron en columnas propias
     * (07-grado-grupo-malla.sql), comparar solo `grado` haría que una
     * asignación en 9°-A "correspondiera" también a estudiantes de 9°-B
     * (mismo grado, grupo distinto).
     */
    public function matriculasCorrespondientes()
    {
        return Matricula::where('sede_id', $this->sede_id)
            ->where('grado', $this->grado)
            ->where('grupo', $this->grupo)
            ->where('anio', $this->anio);
    }
}
