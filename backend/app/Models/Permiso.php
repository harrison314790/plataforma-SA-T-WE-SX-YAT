<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Llave primaria compuesta (rol_id, recurso_id) -- Eloquent no soporta
 * bien las PK compuestas nativamente (`find()`, `save()` después de
 * `find()`, etc. no funcionan como con una PK simple). Este modelo se usa
 * casi siempre con `where(...)`/`whereHas(...)` explícitos (ver
 * RequierePermiso), nunca con `Permiso::find()`. No se le puso `HasUuids`
 * a propósito: no hay una sola columna `id` a la que aplicarle.
 */
class Permiso extends Model
{
    protected $table = 'permisos';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = ['rol_id', 'recurso_id', 'habilitado'];

    protected function casts(): array
    {
        return ['habilitado' => 'boolean'];
    }

    public function rol(): BelongsTo
    {
        return $this->belongsTo(Rol::class, 'rol_id');
    }

    public function recurso(): BelongsTo
    {
        return $this->belongsTo(Recurso::class, 'recurso_id');
    }
}
