<?php

namespace App\Services;

use App\Models\Permiso;
use App\Models\Recurso;

/**
 * Capa 2 de seguridad, en un solo lugar: "¿este ROL puede usar esta
 * función del sistema?" -- una pregunta de feature, resuelta contra
 * `recursos`/`permisos`. La pregunta distinta, "¿esta FILA le pertenece a
 * este usuario?", no se responde acá nunca: eso es RLS
 * (references/permisos.md, sección "La regla de oro, y su matiz real").
 *
 * POR QUÉ EXISTE ESTA CLASE Y NO ESTÁ INLINE EN CADA CONSUMIDOR
 * El bypass de `super_admin` es la única regla de permisos que no vive en
 * la base, y tiene tres consumidores: el middleware RequierePermiso, el
 * mapa que recibe Angular al iniciar sesión, y el armado del menú
 * (NavegacionService). Escrito tres veces, alcanza con olvidarlo en uno
 * para que super_admin quede fuera de su propio sistema -- que es
 * exactamente el bug que tenía el login antes de esta clase: el mapa de
 * permisos salía VACÍO para super_admin (no hay filas suyas en
 * `permisos`, a propósito), así que *appHasRole ocultaba todos los
 * botones y el menú no mostraba ni un módulo a Harrison.
 */
class PermisoService
{
    /**
     * Mapa `codigo => habilitado` que Angular cachea al iniciar sesión y
     * que lee *appHasRole, sin volver a consultar el backend por cada
     * chequeo.
     *
     * Para `super_admin` devuelve TODOS los recursos en `true` sin
     * consultar `permisos`: es el mismo criterio del bypass total que ya
     * tiene en RLS (`for all using (fn_es_super_admin())`, sin excepción
     * en ninguna tabla). Si en vez de esto se exigiera una fila sembrada,
     * alcanzaría con olvidar sembrarla para un recurso nuevo y el
     * operador del producto quedaría sin acceso a algo que la base sí le
     * permite -- una contradicción entre capas.
     *
     * @return array<string, bool>
     */
    public function mapaPara(string $rol): array
    {
        if ($this->esSuperAdmin($rol)) {
            return Recurso::query()
                ->pluck('codigo')
                ->mapWithKeys(fn (string $codigo) => [$codigo => true])
                ->all();
        }

        return Permiso::query()
            ->whereHas('rol', fn ($q) => $q->where('nombre', $rol))
            ->with('recurso:id,codigo')
            ->get()
            ->mapWithKeys(fn (Permiso $permiso) => [$permiso->recurso->codigo => $permiso->habilitado])
            ->all();
    }

    /**
     * Chequeo puntual de un solo código, para el middleware de ruta. No
     * reutiliza mapaPara() a propósito: traer el mapa completo para
     * responder por un solo código sería leer todos los permisos del rol
     * en cada request.
     */
    public function puede(string $rol, string $codigo): bool
    {
        if ($this->esSuperAdmin($rol)) {
            return true;
        }

        return (bool) Permiso::query()
            ->whereHas('recurso', fn ($q) => $q->where('codigo', $codigo))
            ->whereHas('rol', fn ($q) => $q->where('nombre', $rol))
            ->value('habilitado');
    }

    /**
     * Los códigos de recurso habilitados, sin el valor booleano. Es lo
     * que necesita NavegacionService para filtrar vistas, y evita que
     * tenga que recorrer el mapa entero descartando los `false`.
     *
     * @return list<string>
     */
    public function codigosHabilitadosPara(string $rol): array
    {
        return array_keys(array_filter($this->mapaPara($rol)));
    }

    private function esSuperAdmin(string $rol): bool
    {
        return $rol === 'super_admin';
    }
}
