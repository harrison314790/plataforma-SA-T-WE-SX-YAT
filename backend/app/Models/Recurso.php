<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Recurso extends Model
{
    use HasUuids;

    protected $table = 'recursos';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = ['codigo', 'tipo', 'descripcion', 'modulo'];

    public function permisos(): HasMany
    {
        return $this->hasMany(Permiso::class, 'recurso_id');
    }
}
