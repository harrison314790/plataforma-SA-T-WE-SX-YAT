<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Qué asignaturas le corresponden a cada grado (`07-grado-grupo-malla.sql`).
 *
 * Es una propiedad del GRADO, no del grupo: 9-A y 9-B ven exactamente las
 * mismas materias, por eso la tabla no tiene columna `grupo` -- repetir la
 * malla por grupo sería la misma regla escrita dos veces.
 *
 * Es catálogo de configuración sin dato personal, así que su `id` es
 * `integer generated always as identity` y el modelo NO usa `HasUuids`
 * (ver el esquema mixto de IDs en references/base-datos.md).
 *
 * De quién es esta tabla: la escribe la pantalla de malla curricular, que
 * todavía no existe. El módulo de Asignaciones solo la LEE, para que el
 * selector de asignatura no ofrezca una materia que ese grado no ve.
 */
class MallaCurricular extends Model
{
    protected $table = 'malla_curricular';

    public $timestamps = false;

    protected $fillable = ['grado', 'asignatura_id'];

    protected function casts(): array
    {
        return ['grado' => 'integer'];
    }

    public function asignatura(): BelongsTo
    {
        return $this->belongsTo(Asignatura::class, 'asignatura_id');
    }
}
