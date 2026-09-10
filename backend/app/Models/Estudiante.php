<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Estudiante extends Model
{
    use HasUuids;

    protected $table = 'estudiantes';

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

    public function matriculas(): HasMany
    {
        return $this->hasMany(Matricula::class, 'estudiante_id');
    }

    public function notas(): HasMany
    {
        return $this->hasMany(Nota::class, 'estudiante_id');
    }

    public function documentos(): HasMany
    {
        return $this->hasMany(Documento::class, 'estudiante_id');
    }

    public function acudientes(): BelongsToMany
    {
        return $this->belongsToMany(Acudiente::class, 'estudiante_acudientes', 'estudiante_id', 'acudiente_id')
            ->withPivot('parentesco', 'es_principal');
    }
}
