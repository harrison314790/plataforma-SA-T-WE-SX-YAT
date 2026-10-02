<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Un nudo pedagógico del boletín oficial (16-pesos-nudo-por-grado.sql):
 * el grupo de materias cuya nota se imprime como una sola.
 *
 * Catálogo sin dato personal -> `id integer`, sin `HasUuids`.
 *
 * `orden` es el orden en que el nudo sale en el boletín impreso -- el de
 * la institución, no el alfabético.
 */
class NudoPedagogico extends Model
{
    protected $table = 'nudos_pedagogicos';

    public $timestamps = false;

    protected $fillable = ['nombre', 'orden'];

    protected function casts(): array
    {
        return ['orden' => 'integer'];
    }

    public function asignaturas(): HasMany
    {
        return $this->hasMany(Asignatura::class, 'nudo_pedagogico_id');
    }
}
