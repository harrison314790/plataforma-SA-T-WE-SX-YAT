<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Asignatura extends Model
{
    protected $table = 'asignaturas';

    public $timestamps = false;

    protected $fillable = ['nombre', 'codigo', 'nudo_pedagogico_id'];

    public function asignaciones(): HasMany
    {
        return $this->hasMany(Asignacion::class, 'asignatura_id');
    }

    /** Null mientras el admin no la haya ubicado en ningún nudo. */
    public function nudo(): BelongsTo
    {
        return $this->belongsTo(NudoPedagogico::class, 'nudo_pedagogico_id');
    }
}
