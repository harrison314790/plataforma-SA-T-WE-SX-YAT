<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * El profesor inserta una nota una sola vez y no puede editarla nunca --
 * no hay política RLS de `update` para el rol `profesor` en esta tabla
 * (ver base-datos.md). Cualquier corrección es en persona con el
 * rector/coordinador, que la edita desde su cuenta admin/super_admin.
 * Este modelo no impone esa regla (no le corresponde a Eloquent hacerlo,
 * es RLS quien la garantiza) -- pero ningún controlador de este proyecto
 * debería exponer una ruta de "editar mi nota" para profesor.
 */
class Nota extends Model
{
    use HasUuids;

    protected $table = 'notas';

    public $incrementing = false;

    protected $keyType = 'string';

    // created_at/updated_at existen en la tabla, pero updated_at lo
    // mantiene un trigger de Postgres (fn_actualizar_updated_at) -- no
    // hace falta que Eloquent también intente gestionarlos.
    public $timestamps = false;

    // periodo_id es propio de la nota desde 09-asignaciones-por-anio.sql
    // -- antes se heredaba indirectamente de asignaciones.periodo_id, que
    // ya no existe porque una asignación ahora cubre los 4 períodos del
    // año. Esto NO cambia el modelo de calificación: sigue habiendo 4
    // notas al año por estudiante+asignación (una por período), sin
    // promediarse a nivel de dato -- ver vista_boletin_anual para el
    // promedio, que se calcula al vuelo, no se guarda acá.
    protected $fillable = ['estudiante_id', 'asignacion_id', 'periodo_id', 'valor', 'en_revision', 'registrado_por'];

    protected function casts(): array
    {
        return [
            'valor' => 'decimal:1',
            'en_revision' => 'boolean',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function estudiante(): BelongsTo
    {
        return $this->belongsTo(Estudiante::class, 'estudiante_id');
    }

    public function asignacion(): BelongsTo
    {
        return $this->belongsTo(Asignacion::class, 'asignacion_id');
    }

    public function periodo(): BelongsTo
    {
        return $this->belongsTo(PeriodoAcademico::class, 'periodo_id');
    }

    public function registradoPor(): BelongsTo
    {
        return $this->belongsTo(Usuario::class, 'registrado_por');
    }
}
