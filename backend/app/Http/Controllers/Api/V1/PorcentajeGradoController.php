<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\GuardarPorcentajesRequest;
use App\Services\PorcentajeGradoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Porcentajes por grado: cuánto aporta cada materia a la nota de su nudo,
 * para un grado de secundaria en un año. Pantalla propia, independiente
 * de Asignaciones -- ver PorcentajeGradoService.
 */
class PorcentajeGradoController extends Controller
{
    public function __construct(private readonly PorcentajeGradoService $porcentajes)
    {
    }

    public function opciones(): JsonResponse
    {
        return response()->json($this->porcentajes->opciones());
    }

    public function show(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'grado' => ['required', 'integer', 'between:6,11'],
            'anio' => ['required', 'integer', 'between:2000,2100'],
        ], [
            'grado.between' => 'Los porcentajes solo aplican a secundaria (grados 6 a 11). Primaria siempre usa promedio simple.',
        ]);

        return response()->json($this->porcentajes->configuracion((int) $datos['grado'], (int) $datos['anio']));
    }

    public function update(GuardarPorcentajesRequest $request): JsonResponse
    {
        $datos = $request->validated();

        return response()->json($this->porcentajes->guardar(
            $request->user(),
            (int) $datos['grado'],
            (int) $datos['anio'],
            $datos['nudos'],
        ));
    }
}
