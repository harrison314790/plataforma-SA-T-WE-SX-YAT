<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Profesor extends Model
{
    use HasUuids;

    protected $table = 'profesores';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = ['usuario_id', 'activo'];

    protected function casts(): array
    {
        return ['activo' => 'boolean'];
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(Usuario::class, 'usuario_id');
    }

    public function asignaciones(): HasMany
    {
        return $this->hasMany(Asignacion::class, 'profesor_id');
    }

    public function excepcionesPlazo(): HasMany
    {
        return $this->hasMany(ExcepcionPlazo::class, 'profesor_id');
    }
}
