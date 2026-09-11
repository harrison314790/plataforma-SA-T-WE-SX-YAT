<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Recurso extends Model
{
    protected $table = 'recursos';

    public $timestamps = false;

    protected $fillable = ['codigo', 'tipo', 'descripcion', 'modulo'];

    public function permisos(): HasMany
    {
        return $this->hasMany(Permiso::class, 'recurso_id');
    }
}
