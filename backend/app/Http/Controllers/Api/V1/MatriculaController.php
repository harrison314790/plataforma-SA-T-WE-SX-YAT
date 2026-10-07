<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\AgregarAcudienteRequest;
use App\Http\Requests\CambiarGrupoRequest;
use App\Http\Requests\MatricularLoteRequest;
use App\Http\Requests\MatricularRequest;
use App\Http\Requests\RetirarMatriculaRequest;
use App\Models\Matricula;
use App\Services\MatriculaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Matrículas: un estudiante en una sede, grado y grupo por año escolar.
 * Delgado, como los demás: valida forma (Form Request), llama al service
 * y devuelve lo que el service arma.
 *
 * Exclusivo del nivel admin por tres lados: el guard de Angular
 * (`vista_matriculas`), el middleware `requiere.permiso` de cada ruta, y
 * las políticas RLS de `matriculas` (insert/update solo `fn_es_admin()`).
 */
class MatriculaController extends Controller
{
    public function __construct(private readonly MatriculaService $matriculas)
    {
    }

    public function opciones(): JsonResponse
    {
        return response()->json($this->matriculas->opciones());
    }

    public function index(Request $request): JsonResponse
    {
        $filtros = $request->validate(['anio' => ['required', 'integer', 'between:2000,2100']]);

        return response()->json($this->matriculas->listar((int) $filtros['anio']));
    }

    public function store(MatricularRequest $request): JsonResponse
    {
        return response()->json($this->matriculas->matricular($request->validated()), 201);
    }

    public function lote(MatricularLoteRequest $request): JsonResponse
    {
        return response()->json($this->matriculas->matricularLote($request->validated()), 201);
    }

    public function cambiarGrupo(CambiarGrupoRequest $request, Matricula $matricula): JsonResponse
    {
        return response()->json($this->matriculas->cambiarGrupo($matricula, $request->validated()));
    }

    public function retirar(RetirarMatriculaRequest $request, Matricula $matricula): JsonResponse
    {
        return response()->json(
            $this->matriculas->retirar($matricula, $request->validated(), $request->user()->getKey())
        );
    }

    public function agregarAcudiente(AgregarAcudienteRequest $request): JsonResponse
    {
        return response()->json($this->matriculas->agregarAcudiente($request->validated()), 201);
    }
}
