<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\CalendarioEpocasRequest;
use App\Http\Requests\CorregirNotaRequest;
use App\Http\Requests\GuardarNotasRequest;
use App\Http\Requests\PlazoNotasRequest;
use App\Http\Requests\ProrrogaRequest;
use App\Models\Asignacion;
use App\Models\ExcepcionPlazo;
use App\Models\Nota;
use App\Models\PeriodoAcademico;
use App\Services\NotaPeriodoService;
use App\Services\NotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Notas: el registro del profesor y el seguimiento de coordinación.
 * Delgado a propósito: valida forma (Form Request), llama al service y
 * devuelve lo que el service arma. Ninguna regla de negocio vive acá.
 *
 * Las tres capas, para cada acción: el `btn_*` lo exige la ruta
 * (`requiere.permiso`), el Form Request de coordinación exige nivel admin,
 * y RLS respalda cada fila (`notas_profesor_inserta_dentro_de_plazo`,
 * `notas_admin_gestiona`, `excepciones_admin_*`, `periodos_admin_escribe`).
 */
class NotaController extends Controller
{
    public function __construct(
        private readonly NotaService $notas,
        private readonly NotaPeriodoService $periodos,
    ) {
    }

    /** Pantalla del profesor: sus asignaciones del período, con estudiantes y notas. */
    public function registro(Request $request): JsonResponse
    {
        return response()->json(
            $this->notas->registroDelProfesor($request->user(), $this->periodoPedido($request))
        );
    }

    public function guardarLote(GuardarNotasRequest $request): JsonResponse
    {
        return response()->json($this->notas->registrarLote($request->user(), $request->validated()), 201);
    }

    /** Pantalla de coordinación: el avance de todas las asignaciones. */
    public function seguimiento(Request $request): JsonResponse
    {
        return response()->json($this->periodos->seguimiento($this->periodoPedido($request)));
    }

    public function detalleAsignacion(Request $request, Asignacion $asignacion): JsonResponse
    {
        return response()->json($this->notas->detalleAsignacion($asignacion, $this->periodoPedido($request)));
    }

    public function corregir(CorregirNotaRequest $request, Nota $nota): JsonResponse
    {
        return response()->json($this->notas->corregir($nota, $request->validated()));
    }

    public function cambiarPlazo(PlazoNotasRequest $request, PeriodoAcademico $periodo): JsonResponse
    {
        return response()->json($this->periodos->cambiarPlazo($periodo, $request->validated()));
    }

    /** "Editar fechas": el calendario de épocas del año. La época activa sale de ahí. */
    public function guardarCalendario(CalendarioEpocasRequest $request): JsonResponse
    {
        return response()->json($this->periodos->guardarCalendario($request->validated()));
    }

    public function guardarProrroga(ProrrogaRequest $request): JsonResponse
    {
        return response()->json($this->periodos->guardarProrroga($request->validated(), $request->user()->getKey()));
    }

    public function quitarProrroga(Request $request, ExcepcionPlazo $prorroga): JsonResponse
    {
        // Sin Form Request (no hay cuerpo que validar), pero el mismo
        // requisito de nivel admin que las demás acciones de coordinación.
        abort_unless(in_array($request->user()->rol->nombre, ['admin', 'super_admin'], true), 403);

        $this->periodos->quitarProrroga($prorroga, $request->user()->getKey());

        return response()->json(null, 204);
    }

    private function periodoPedido(Request $request): ?int
    {
        $datos = $request->validate(['periodo_id' => ['nullable', 'integer', 'exists:periodos_academicos,id']]);

        return isset($datos['periodo_id']) ? (int) $datos['periodo_id'] : null;
    }
}
