<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Un recurso es una función del sistema que se puede habilitar por rol:
 * un botón ('btn_registrar_nota'), una vista ('vista_notas') o una
 * acción. `codigo` es el hilo conductor de las capas 1 y 2 -- el mismo
 * string que usa *appHasRole en Angular y el middleware RequierePermiso
 * (ver references/permisos.md).
 *
 * Las columnas de navegación (`etiqueta`, `ruta`, `icono`, `orden`) las
 * agregó 05-navegacion.sql y solo tienen sentido para `tipo = 'vista'`:
 * un botón no es una entrada de menú. La base lo garantiza con el check
 * `recursos_vista_tiene_navegacion`, así que una vista sin etiqueta ni
 * ruta no se puede insertar -- no hay que validarlo de nuevo acá.
 *
 * `icono` es un NOMBRE de ícono ('libro', 'personas'...), nunca marcado
 * SVG: Angular lo resuelve contra su propio set, tomado del escudo de la
 * institución. Ver la nota de cabecera de 05-navegacion.sql.
 *
 * @property int $id
 * @property string $codigo
 * @property string $tipo
 * @property string|null $descripcion
 * @property string $modulo
 * @property string|null $etiqueta
 * @property string|null $ruta
 * @property string|null $icono
 * @property int $orden
 */
class Recurso extends Model
{
    protected $table = 'recursos';

    public $timestamps = false;

    protected $fillable = [
        'codigo', 'tipo', 'descripcion', 'modulo',
        'etiqueta', 'ruta', 'icono', 'orden',
    ];

    public function permisos(): HasMany
    {
        return $this->hasMany(Permiso::class, 'recurso_id');
    }

    /** Ver la nota de Modulo::recursos() sobre por qué la FK es por `codigo`. */
    public function modulo(): BelongsTo
    {
        return $this->belongsTo(Modulo::class, 'modulo', 'codigo');
    }

    public function scopeVistas(Builder $query): Builder
    {
        return $query->where('tipo', 'vista');
    }
}
