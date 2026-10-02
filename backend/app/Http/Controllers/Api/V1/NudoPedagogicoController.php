<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\AsignarNudoRequest;
use App\Http\Requests\MateriaRequest;
use App\Http\Requests\NudoPedagogicoRequest;
use App\Models\Asignatura;
use App\Models\NudoPedagogico;
use App\Services\NudoPedagogicoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * Nudos pedagógicos: el catálogo y a qué nudo pertenece cada materia.
 *
 * Respuestas sin envoltorio `data`, igual que /asignaciones/opciones: son
 * estructuras armadas por el Service, no un modelo que pase por un
 * Resource.
 */
class NudoPedagogicoController extends Controller
{
    public function __construct(private readonly NudoPedagogicoService $nudos)
    {
    }

    public function index(): JsonResponse
    {
        return response()->json($this->nudos->catalogo());
    }

    public function store(NudoPedagogicoRequest $request): JsonResponse
    {
        return response()->json($this->nudos->crear($request->validated()), Response::HTTP_CREATED);
    }

    public function update(NudoPedagogicoRequest $request, NudoPedagogico $nudo): JsonResponse
    {
        return response()->json($this->nudos->actualizar($nudo, $request->validated()));
    }

    public function destroy(NudoPedagogico $nudo): Response
    {
        $this->nudos->eliminar($nudo);

        return response()->noContent();
    }

    public function asignarNudo(AsignarNudoRequest $request, Asignatura $asignatura): JsonResponse
    {
        $nudoId = $request->validated('nudo_pedagogico_id');

        return response()->json(
            $this->nudos->asignarNudo($asignatura, $nudoId === null ? null : (int) $nudoId)
        );
    }

    public function crearMateria(MateriaRequest $request): JsonResponse
    {
        return response()->json($this->nudos->crearMateria($this->datosMateria($request)), Response::HTTP_CREATED);
    }

    public function actualizarMateria(MateriaRequest $request, Asignatura $asignatura): JsonResponse
    {
        return response()->json($this->nudos->actualizarMateria($asignatura, $this->datosMateria($request)));
    }

    public function eliminarMateria(Asignatura $asignatura): Response
    {
        $this->nudos->eliminarMateria($asignatura);

        return response()->noContent();
    }

    /** `nudo_pedagogico_id` puede llegar como string: se normaliza a int|null. */
    private function datosMateria(MateriaRequest $request): array
    {
        $datos = $request->validated();
        $nudoId = $datos['nudo_pedagogico_id'] ?? null;
        $datos['nudo_pedagogico_id'] = $nudoId === null ? null : (int) $nudoId;

        return $datos;
    }
}
