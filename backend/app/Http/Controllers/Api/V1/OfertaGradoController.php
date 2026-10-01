<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\CambiarEstadoRequest;
use App\Http\Requests\CrearOfertaGradoRequest;
use App\Http\Resources\OfertaGradoResource;
use App\Models\OfertaGrado;
use App\Services\OfertaGradoService;
use Illuminate\Http\Response;

/**
 * El catálogo de qué grado+grupo existe en cada sede (`oferta_grados`).
 *
 * POR QUÉ ES SU PROPIO CONTROLADOR Y NO UN MÉTODO DE AsignacionController
 * Es un recurso distinto con su propio ciclo de vida: una vereda abre
 * quinto en enero y lo cierra dos años después, sin que eso tenga nada
 * que ver con quién dicta qué. Hoy se administra desde la pantalla de
 * Asignaciones porque es la única que existe, pero Matrículas va a usar
 * exactamente la misma tabla -- meterlo dentro del controlador de
 * asignaciones habría atado el catálogo al primer módulo que lo necesitó.
 *
 * Lo que sí es temporal: el permiso de acceso (`vista_asignaciones`, ver
 * routes/api.php). Cuando exista Matrículas habrá que decidir si esto
 * pasa a un módulo de configuración propio.
 */
class OfertaGradoController extends Controller
{
    public function __construct(private readonly OfertaGradoService $oferta)
    {
    }

    /**
     * El catálogo completo, activas e inactivas, con cuánto usa cada
     * fila. Esta es la pantalla donde se administran, así que una fila
     * desactivada tiene que verse para poder reactivarla -- a diferencia
     * del formulario de asignaciones, que solo ofrece las activas.
     */
    public function index()
    {
        return OfertaGradoResource::collection($this->oferta->listar());
    }

    public function store(CrearOfertaGradoRequest $request)
    {
        return OfertaGradoResource::make($this->oferta->crear($request->validated()))
            ->response()
            ->setStatusCode(201);
    }

    public function cambiarEstado(CambiarEstadoRequest $request, OfertaGrado $ofertaGrado)
    {
        return OfertaGradoResource::make(
            $this->oferta->cambiarEstado($ofertaGrado, $request->boolean('activo'))
        );
    }

    /**
     * Borrado definitivo, solo si nunca se usó.
     *
     * Mismo criterio que `AsignacionController::destroy()`: un `codigo`
     * propio y los conteos en `detalles`, para que la pantalla pueda
     * decir "hay 12 matrículas acá" y ofrecer "Desactivar" sin tener que
     * interpretar el texto del mensaje. El sobre de error es el mismo de
     * toda la API.
     */
    public function destroy(OfertaGrado $ofertaGrado)
    {
        $usos = $this->oferta->usos($ofertaGrado);

        if (array_sum($usos) > 0) {
            return response()->json([
                'error' => [
                    'codigo' => 'OFERTA_EN_USO',
                    'mensaje' => $this->explicarUso($ofertaGrado, $usos),
                    'detalles' => $usos,
                ],
            ], Response::HTTP_CONFLICT);
        }

        $this->oferta->eliminar($ofertaGrado);

        return response()->noContent();
    }

    /**
     * El mensaje de "no se puede borrar", nombrando lo que hay adentro.
     *
     * Antes decía "ya se usó en asignaciones o matrículas" para todos
     * los casos. Eso es cierto y no sirve: no dice CUÁNTO ni DE QUÉ, así
     * que quien lo lee no puede decidir si vale la pena ir a limpiar
     * esos registros o si directamente hay que desactivar.
     *
     * El caso que más cambia es el de las notas. Un grado con dos
     * asignaciones vacías es configuración que se puede rehacer en un
     * minuto; uno con notas de estudiantes tiene el trabajo de un
     * profesor y el boletín de alguien adentro, y eso hay que decirlo
     * con esas palabras, no dejarlo sumado dentro de un número.
     */
    private function explicarUso(OfertaGrado $oferta, array $usos): string
    {
        $plural = fn (int $n, string $singular, string $plural) => $n.' '.($n === 1 ? $singular : $plural);

        $partes = [];

        if ($usos['asignaciones'] > 0) {
            $partes[] = $plural($usos['asignaciones'], 'asignación', 'asignaciones');
        }
        if ($usos['matriculas'] > 0) {
            $partes[] = $plural($usos['matriculas'], 'estudiante matriculado', 'estudiantes matriculados');
        }
        if ($usos['notas'] > 0) {
            $partes[] = $plural($usos['notas'], 'nota registrada', 'notas registradas');
        }

        // 'a, b y c' -- la coma de Oxford no se usa en español.
        $ultimo = array_pop($partes);
        $listado = $partes === [] ? $ultimo : implode(', ', $partes).' y '.$ultimo;

        $codigo = "{$oferta->grado}-{$oferta->grupo}";

        $cierre = $usos['notas'] > 0
            ? 'Si se borrara, esas notas quedarían sin materia y se romperían el historial y los boletines.'
            : 'Si se borrara, esos registros quedarían sin referencia.';

        return "El grado {$codigo} de esta sede tiene {$listado}. {$cierre}";
    }
}
