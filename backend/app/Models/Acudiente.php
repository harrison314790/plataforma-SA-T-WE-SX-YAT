<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Acudiente extends Model
{
    use HasUuids;

    protected $table = 'acudientes';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = ['nombres', 'apellidos', 'documento', 'telefono', 'email', 'usuario_id'];

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(Usuario::class, 'usuario_id');
    }

    public function estudiantes(): BelongsToMany
    {
        return $this->belongsToMany(Estudiante::class, 'estudiante_acudientes', 'acudiente_id', 'estudiante_id')
            ->withPivot('parentesco', 'es_principal');
    }
}
