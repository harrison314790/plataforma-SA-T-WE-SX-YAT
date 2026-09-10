<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sede extends Model
{
    use HasUuids;

    protected $table = 'sedes';

    public $incrementing = false;

    protected $keyType = 'string';

    // Solo tiene created_at (con default now() en Postgres) -- Eloquent
    // no necesita gestionarlo. Mismo criterio en todos los modelos de
    // este proyecto: ver .claude/skills/sistema-academico/references/laravel-postgres.md
    public $timestamps = false;

    protected $fillable = ['nombre', 'tipo', 'vereda', 'sede_padre_id'];

    public function sedePadre(): BelongsTo
    {
        return $this->belongsTo(Sede::class, 'sede_padre_id');
    }

    public function sedesHijas(): HasMany
    {
        return $this->hasMany(Sede::class, 'sede_padre_id');
    }

    public function usuarios(): HasMany
    {
        return $this->hasMany(Usuario::class, 'sede_id');
    }

    public function asignaciones(): HasMany
    {
        return $this->hasMany(Asignacion::class, 'sede_id');
    }

    public function matriculas(): HasMany
    {
        return $this->hasMany(Matricula::class, 'sede_id');
    }
}
