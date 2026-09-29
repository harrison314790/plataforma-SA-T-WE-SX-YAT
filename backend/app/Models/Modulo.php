<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Catálogo del menú lateral: qué módulos existen en esta instalación,
 * cómo se llaman, en qué grupo y en qué orden aparecen. Definido en
 * 05-navegacion.sql.
 *
 * Tabla de catálogo -> llave primaria `integer`, no `uuid`, y por eso NO
 * usa HasUuids ni toca $incrementing/$keyType (ver el esquema mixto de
 * IDs en references/base-datos.md).
 *
 * `activo = false` significa "esta instalación no incluye este módulo"
 * (control por plan, escritura exclusiva de super_admin). Es una
 * pregunta distinta de "¿este rol tiene permiso?", que la responden
 * `recursos`/`permisos`.
 *
 * @property int $id
 * @property string $codigo
 * @property string $etiqueta
 * @property string $grupo
 * @property string $icono
 * @property int $orden
 * @property bool $activo
 */
class Modulo extends Model
{
    protected $table = 'modulos';

    // Sin created_at/updated_at en el esquema -- mismo criterio que el
    // resto de los modelos de este proyecto.
    public $timestamps = false;

    protected $fillable = ['codigo', 'etiqueta', 'grupo', 'icono', 'orden', 'activo'];

    protected function casts(): array
    {
        return ['activo' => 'boolean'];
    }

    /**
     * La relación se apoya en `codigo`, no en `id`: `recursos.modulo` es
     * un text que referencia `modulos.codigo` (así lo sembró
     * 03-datos-prueba.sql antes de que esta tabla existiera, y
     * 05-navegacion.sql lo formalizó con una FK hacia `codigo`). Cambiar
     * `recursos.modulo` a un `modulo_id` entero sería más ortodoxo pero
     * obligaría a reescribir 03 y romper la fuente de verdad de los
     * `.sql`, sin ganar nada: `codigo` ya es unique y es lo que leen las
     * consultas.
     */
    public function recursos(): HasMany
    {
        return $this->hasMany(Recurso::class, 'modulo', 'codigo');
    }

    /** Solo las entradas de menú: un botón no es navegable. */
    public function vistas(): HasMany
    {
        return $this->recursos()->where('tipo', 'vista');
    }

    public function scopeActivos(Builder $query): Builder
    {
        return $query->where('activo', true);
    }
}
