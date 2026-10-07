<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ErrorDeNegocio;
use App\Http\Controllers\Controller;
use App\Models\Estudiante;
use App\Services\BoletinService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Boletín por nudo pedagógico.
 *
 * Dos puertas, con la misma vista detrás:
 * · admin elige año + curso + estudiante (`/boletines/estudiantes/{id}`).
 * · el estudiante ve SOLO el suyo (`/boletines/mio`) -- nunca recibe un
 *   id por parámetro, así que no hay id ajeno que probar.
 *
 * El profesor no entra (sin `vista_boletines`, ver
 * 16-pesos-nudo-por-grado.sql): RLS solo le deja ver las notas de sus
 * materias, y el nudo le saldría calculado con una sola.
 */
class BoletinController extends Controller
{
    public function __construct(private readonly BoletinService $boletines)
    {
    }

    public function opciones(Request $request): JsonResponse
    {
        $this->exigirAdmin($request);

        return response()->json($this->boletines->opciones());
    }

    public function estudiantes(Request $request): JsonResponse
    {
        $this->exigirAdmin($request);

        $datos = $request->validate([
            'anio' => ['required', 'integer', 'between:2000,2100'],
            'sede_id' => ['required', 'integer', 'exists:sedes,id'],
            'grado' => ['required', 'integer', 'between:1,11'],
            'grupo' => ['required', 'string', 'max:10'],
        ]);

        return response()->json($this->boletines->estudiantes(
            (int) $datos['anio'], (int) $datos['sede_id'], (int) $datos['grado'], $datos['grupo'],
        ));
    }

    public function show(Request $request, Estudiante $estudiante): JsonResponse
    {
        $this->exigirAdmin($request);

        return response()->json($this->boletines->boletin($estudiante->load('usuario'), $this->anio($request)));
    }

    /**
     * El boletín propio. `anio` es opcional: sin él, el año más reciente
     * con matrícula. La respuesta trae además los años disponibles, para
     * el selector, en un solo viaje.
     */
    public function mio(Request $request): JsonResponse
    {
        $estudiante = $request->user()->estudiante;

        if ($estudiante === null) {
            throw new AuthorizationException();
        }

        $anios = $this->boletines->aniosDe($estudiante);

        if ($anios === []) {
            throw new ErrorDeNegocio('Todavía no tienes matrícula registrada, así que no hay boletín que mostrar.');
        }

        // Por defecto, el año EN CURSO y no el más reciente: desde que la
        // matrícula es por año (20-matriculas-por-anio.sql), en enero el
        // estudiante ya puede estar matriculado para un año que todavía
        // no tiene períodos -- abrir ese boletín vacío escondería el del
        // año que está terminando.
        $porDefecto = collect($anios)->firstWhere('enCurso', true) ?? $anios[0];
        $anio = $request->filled('anio') ? $this->anio($request) : $porDefecto['anio'];

        return response()->json([
            'anios' => $anios,
            'boletin' => $this->boletines->boletin($estudiante->load('usuario'), $anio),
        ]);
    }

    private function anio(Request $request): int
    {
        return (int) $request->validate(['anio' => ['required', 'integer', 'between:2000,2100']])['anio'];
    }

    /**
     * Ver el boletín de CUALQUIER estudiante es del nivel admin, sin
     * importar lo que diga `permisos`: el estudiante también tiene
     * `vista_boletines` (para el suyo), y sin esta línea esa misma llave
     * le abriría los de todos. RLS igual le devolvería vacío, pero no hay
     * que llegar hasta ahí.
     */
    private function exigirAdmin(Request $request): void
    {
        if (! in_array($request->user()?->rol?->nombre, ['admin', 'super_admin'], true)) {
            throw new AuthorizationException();
        }
    }
}
