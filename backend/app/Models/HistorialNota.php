<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Una corrección de nota hecha por coordinación. Solo LECTURA desde
 * Laravel: la fila la escribe el trigger `fn_auditar_correccion_nota`
 * (21-notas-modulo.sql) dentro del mismo UPDATE que cambia el valor, así
 * que no existe camino para corregir una nota sin dejar huella -- ni
 * siquiera un endpoint futuro que se olvide de este modelo.
 */
class HistorialNota extends Model
{
    use HasUuids;

    protected $table = 'historial_notas';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'valor_anterior' => 'float',
            'valor_nuevo' => 'float',
            'corregido_en' => 'datetime',
        ];
    }

    public function nota(): BelongsTo
    {
        return $this->belongsTo(Nota::class, 'nota_id');
    }

    public function corregidoPor(): BelongsTo
    {
        return $this->belongsTo(Usuario::class, 'corregido_por');
    }
}
