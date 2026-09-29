<?php

namespace App\Services;

use App\Models\Modulo;
use App\Models\Recurso;
use Illuminate\Support\Collection;

/**
 * Arma el menú que le corresponde a un rol cruzando dos cosas:
 *
 *   1. `modulos` -- qué módulos existe y trae habilitados ESTA instalación
 *      (control por plan, escritura exclusiva de super_admin).
 *   2. `recursos`/`permisos` -- a cuáles de sus vistas puede entrar ESTE
 *      rol (delegado en PermisoService, que es quien conoce el bypass de
 *      super_admin).
 *
 * Devuelve TODOS los módulos activos, no solo los permitidos, cada uno con
 * su bandera `disponible`. Es deliberado: el escritorio los muestra
 * atenuados con el motivo, en vez de esconderlos. Un módulo que
 * simplemente no aparece se lee como "el sistema no lo tiene" y genera la
 * llamada al soporte; uno atenuado que dice "no habilitado para tu rol"
 * ya responde la pregunta. Es la misma razón por la que el proyecto
 * distingue el estado "sin permiso" del estado "vacío"
 * (references/diseno-ui.md). El menú lateral, en cambio, solo lista lo
 * disponible -- ahí un ítem que no se puede abrir no informa, estorba.
 *
 * Lo que este service NO sabe, y no debería: si la pantalla del módulo ya
 * está construida en Angular. Eso no es configuración, es estado del
 * código, y lo resuelve el frontend
 * (core/navegacion/modulos-construidos.ts).
 */
class NavegacionService
{
    public function __construct(private readonly PermisoService $permisoService)
    {
    }

    /**
     * @return Collection<int, array{
     *     codigo: string, etiqueta: string, grupo: string, icono: string,
     *     orden: int, disponible: bool, vistas: list<array<string, mixed>>
     * }>
     */
    public function modulosPara(string $rol): Collection
    {
        $habilitados = $this->permisoService->codigosHabilitadosPara($rol);

        // Un solo round-trip por tabla: los módulos activos y todas sus
        // vistas, en vez de una consulta de vistas por módulo. Con 7
        // módulos es indiferente, pero el N+1 crece con el catálogo y esta
        // consulta corre en cada login.
        $vistasPorModulo = Recurso::query()
            ->vistas()
            ->orderBy('orden')
            ->orderBy('etiqueta')
            ->get()
            ->groupBy('modulo');

        return Modulo::query()
            ->activos()
            ->orderBy('orden')
            ->get()
            ->map(function (Modulo $modulo) use ($vistasPorModulo, $habilitados): array {
                $vistas = $vistasPorModulo->get($modulo->codigo, collect())
                    ->filter(fn (Recurso $vista) => in_array($vista->codigo, $habilitados, true))
                    ->values();

                return [
                    'codigo' => $modulo->codigo,
                    'etiqueta' => $modulo->etiqueta,
                    'grupo' => $modulo->grupo,
                    'icono' => $modulo->icono,
                    'orden' => $modulo->orden,
                    // Un módulo está disponible si el rol puede entrar al
                    // menos a una de sus vistas. No se deriva del permiso
                    // de sus botones: Marta tiene `btn_registrar_nota`,
                    // pero lo que la deja entrar al módulo es
                    // `vista_notas`.
                    'disponible' => $vistas->isNotEmpty(),
                    'vistas' => $vistas->map(fn (Recurso $vista) => [
                        'codigo' => $vista->codigo,
                        'etiqueta' => $vista->etiqueta,
                        'ruta' => $vista->ruta,
                        'icono' => $vista->icono ?? $modulo->icono,
                        'descripcion' => $vista->descripcion,
                    ])->all(),
                ];
            })
            ->values();
    }
}
