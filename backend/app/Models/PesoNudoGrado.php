<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * El porcentaje que una materia aporta a la nota de su nudo, para un
 * grado de secundaria (6 a 11) en un año.
 *
 * Por grado y NO por grupo: 6-A y 6-B comparten la misma configuración.
 * Que los porcentajes de un nudo sumen 100 es una regla entre filas que
 * la base no puede imponer -- la valida PorcentajeGradoService antes de
 * guardar. Ver 16-pesos-nudo-por-grado.sql.
 */
class PesoNudoGrado extends Model
{
    protected $table = 'pesos_nudo_grado';

    public $timestamps = false;

    protected $fillable = ['grado', 'asignatura_id', 'anio', 'peso_porcentual', 'actualizado_por', 'updated_at'];

    protected function casts(): array
    {
        return [
            'grado' => 'integer',
            'anio' => 'integer',
            'peso_porcentual' => 'float',
            'updated_at' => 'datetime',
        ];
    }

    public function asignatura(): BelongsTo
    {
        return $this->belongsTo(Asignatura::class, 'asignatura_id');
    }
}
