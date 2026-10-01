<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Qué combinaciones sede+grado+grupo existen de verdad
 * (`08-oferta-grados-por-sede.sql`). Es lo que responde "Escuela La
 * Laguna llega hasta grado 5, un grupo por grado" sin que esa regla viva
 * escondida en código PHP.
 *
 * No es una tabla de configuración más: `asignaciones` y `matriculas`
 * tienen una LLAVE FORÁNEA COMPUESTA (sede_id, grado, grupo) contra ella,
 * así que Postgres rechaza por su cuenta cualquier asignación en una
 * combinación que esa sede no dio de alta -- sin depender de que la
 * validación de Laravel esté bien escrita. La validación del Form Request
 * existe para dar un mensaje legible ANTES de ese error, no para
 * reemplazarlo.
 *
 * Catálogo sin dato personal -> `id integer`, sin `HasUuids`.
 *
 * Quién la escribe: la pantalla de "Grados y grupos" del módulo de
 * Asignaciones (OfertaGradoController), que es hoy la única que la
 * administra. Matrículas va a leer la misma tabla cuando exista.
 *
 * NO tiene un scope `activas()`, y es deliberado: el filtro por `activo`
 * se hace del lado del cliente, porque las dos pantallas que consumen
 * este catálogo necesitan cosas distintas de la MISMA respuesta -- el
 * formulario de asignaciones solo las abiertas, la pantalla de gestión
 * todas (si no, una combinación desactivada no se podría reactivar
 * nunca). Un scope acá invitaría a filtrar en el servidor y volver a
 * partir esa respuesta en dos consultas.
 */
class OfertaGrado extends Model
{
    protected $table = 'oferta_grados';

    public $timestamps = false;

    protected $fillable = ['sede_id', 'grado', 'grupo', 'activo'];

    protected function casts(): array
    {
        return [
            'grado' => 'integer',
            'activo' => 'boolean',
        ];
    }

    public function sede(): BelongsTo
    {
        return $this->belongsTo(Sede::class, 'sede_id');
    }
}
