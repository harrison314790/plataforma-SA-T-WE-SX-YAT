<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Asignatura extends Model
{
    use HasUuids;

    protected $table = 'asignaturas';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = ['nombre', 'codigo'];

    public function asignaciones(): HasMany
    {
        return $this->hasMany(Asignacion::class, 'asignatura_id');
    }
}
