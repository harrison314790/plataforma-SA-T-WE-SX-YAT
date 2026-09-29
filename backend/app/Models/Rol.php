<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Catálogo de roles. `nombre` es el CÓDIGO que leen las políticas RLS
 * (`fn_rol_actual()`), el middleware RequierePermiso y PermisoService:
 * 'super_admin' | 'admin' | 'profesor' | 'estudiante'. `etiqueta` es lo
 * único que se le muestra a una persona ('Docente', 'Administración') --
 * la agregó 05-navegacion.sql.
 *
 * No hay enum de PHP ni check en la base que restrinja `nombre` a esos
 * cuatro valores: hoy esa restricción vive solo en el tipo `Rol` de
 * TypeScript (frontend/src/app/core/interfaces/usuario.interface.ts). Es
 * un hueco conocido de la convención, no de la base -- ver
 * references/permisos.md. Si algún día se agrega un rol, hay que tocar
 * ese tipo a mano.
 *
 * @property int $id
 * @property string $nombre
 * @property string $etiqueta
 */
class Rol extends Model
{
    protected $table = 'roles';

    public $timestamps = false;

    protected $fillable = ['nombre', 'etiqueta'];

    public function usuarios(): HasMany
    {
        return $this->hasMany(Usuario::class, 'rol_id');
    }

    public function permisos(): HasMany
    {
        return $this->hasMany(Permiso::class, 'rol_id');
    }

    public function esSuperAdmin(): bool
    {
        return $this->nombre === 'super_admin';
    }
}
