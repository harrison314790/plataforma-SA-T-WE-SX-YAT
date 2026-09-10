<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\RegistrarNotaRequest;
use App\Http\Resources\NotaResource;
use App\Models\Nota;
use App\Services\NotaService;
use Illuminate\Http\Request;

/**
 * Delgado a propósito: recibe la request, valida forma (Form Request),
 * llama al service, arma la respuesta (Resource). Ninguna regla de
 * negocio vive acá -- ver NotaService.
 */
class NotaController extends Controller
{
    public function __construct(private readonly NotaService $notaService)
    {
    }

    /**
     * Sin filtro explícito por rol acá: RLS ya devuelve solo las filas
     * que le corresponden a quien está conectado (las suyas si es
     * estudiante, las de sus asignaciones si es profesor, todas si es
     * admin/super_admin) -- ver notas_estudiante_lee_las_suyas /
     * notas_profesor_lee_las_suyas / notas_admin_lee_todo en base-datos.md.
     */
    public function index(Request $request)
    {
        $notas = Nota::query()->orderByDesc('created_at')->get();

        return NotaResource::collection($notas);
    }

    public function store(RegistrarNotaRequest $request)
    {
        $nota = $this->notaService->registrar($request->user(), $request->validated());

        return NotaResource::make($nota)->response()->setStatusCode(201);
    }
}
