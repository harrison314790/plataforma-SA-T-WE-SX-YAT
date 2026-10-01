<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ActualizarAsignacionRequest;
use App\Http\Requests\CambiarEstadoRequest;
use App\Http\Requests\CrearAsignacionRequest;
use App\Http\Resources\AsignacionResource;
use App\Models\Asignacion;
use App\Services\AsignacionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Delgado a propósito, igual que NotaController: recibe, valida forma
 * (Form Request), llama al service, arma la respuesta (Resource).
 *
 * Por dominio y no por rol: este mismo controlador serviría a cualquier
 * rol que `permisos` habilitara, porque RLS ya acota las filas. Que hoy
 * sea exclusivo del nivel admin lo dicen las políticas de `asignaciones`
 * y el middleware de la ruta, no una carpeta `Admin/`.
 */
class AsignacionController extends Controller
{
    public function __construct(private readonly AsignacionService $asignaciones)
    {
    }

    /**
     * Listado filtrable. Los filtros son independientes entre sí: `grado`
     * sin `grupo` devuelve todo ese grado, en todos los grupos y todas las
     * sedes -- ver el docblock de AsignacionService::listar().
     *
     * Ningún filtro es obligatorio, ni siquiera `anio`: el frontend
     * arranca con el año sugerido, pero "todos los años" tiene que ser
     * una respuesta posible para poder revisar el histórico.
     */
    public function index(Request $request)
    {
        $filtros = $request->validate([
            'anio' => ['sometimes', 'integer', 'between:2000,2100'],
            'sede_id' => ['sometimes', 'integer', 'exists:sedes,id'],
            'grado' => ['sometimes', 'integer', 'between:1,11'],
            'grupo' => ['sometimes', 'string', 'max:10'],
            'profesor_id' => ['sometimes', 'uuid', 'exists:profesores,id'],
            'asignatura_id' => ['sometimes', 'integer', 'exists:asignaturas,id'],
            'activo' => ['sometimes', 'boolean'],
        ]);

        return AsignacionResource::collection($this->asignaciones->listar($filtros));
    }

    /**
     * Catálogos del formulario en una sola respuesta (profesores con su
     * sede, asignaturas, sedes, oferta de grados activa, malla curricular
     * y años). Ver el porqué de que vaya todo junto en
     * AsignacionService::opciones().
     *
     * No lleva Resource propio: no es una entidad del dominio, es un
     * paquete de listas ya armadas campo por campo en el service -- que
     * es la garantía que da un Resource. Nunca sale de acá un modelo
     * crudo.
     */
    public function opciones(): JsonResponse
    {
        return response()->json($this->asignaciones->opciones());
    }

    public function store(CrearAsignacionRequest $request)
    {
        $asignacion = $this->asignaciones->crear($request->user(), $request->validated());

        return AsignacionResource::make($asignacion)->response()->setStatusCode(201);
    }

    public function update(ActualizarAsignacionRequest $request, Asignacion $asignacion)
    {
        return AsignacionResource::make(
            $this->asignaciones->actualizar($asignacion, $request->validated())
        );
    }

    /**
     * Desactivar o reactivar una asignación.
     *
     * NO es una acción de la tabla: no hay un botón de "Desactivar" en
     * la fila. Se llega acá por una sola puerta -- el diálogo de
     * eliminar, cuando la asignación tiene notas y el borrado es
     * imposible -- y ahí es la alternativa que se ofrece, no algo que se
     * elija de entrada.
     *
     * Por eso va con `btn_editar_asignacion` (ver routes/api.php) y no
     * con un permiso propio: es parte de modificar una asignación, y
     * darle un código aparte habría implicado que existe como acción
     * suelta en alguna pantalla, que es justo lo que no pasa.
     */
    public function cambiarEstado(CambiarEstadoRequest $request, Asignacion $asignacion)
    {
        return AsignacionResource::make(
            $this->asignaciones->cambiarEstado($asignacion, $request->boolean('activo'))
        );
    }

    /**
     * Borrado definitivo, solo si no tiene notas.
     *
     * POR QUÉ ESTE 409 SE ARMA ACÁ Y NO CON UNA ErrorDeNegocio
     * `ErrorDeNegocio` siempre sale como 422 con
     * `codigo: 'ERROR_DE_NEGOCIO'` (ver bootstrap/app.php). Ese código
     * genérico obligaría al frontend a adivinar, leyendo el TEXTO del
     * mensaje, si este caso concreto admite la alternativa de desactivar
     * -- y un cambio de redacción rompería la pantalla en silencio.
     *
     * Con un `codigo` propio y el conteo en `detalles`, el diálogo puede
     * decir "ya tiene 12 notas" y ofrecer "Desactivar" sin interpretar
     * prosa. El sobre de error es exactamente el mismo del resto de la
     * API (`{ error: { codigo, mensaje, detalles } }`), así que no hay un
     * segundo formato que mantener; lo único distinto es el código y el
     * 409, que es literalmente "conflicto con el estado actual del
     * recurso".
     *
     * El service repite el chequeo por su cuenta -- ver su docblock.
     */
    public function destroy(Asignacion $asignacion)
    {
        $notas = $asignacion->notas()->count();

        if ($notas > 0) {
            return response()->json([
                'error' => [
                    'codigo' => 'ASIGNACION_CON_NOTAS',
                    'mensaje' => 'Esta asignación ya tiene notas registradas. Si se borrara, esas notas quedarían sin asignación y se romperían el historial y los boletines.',
                    'detalles' => ['notas' => $notas],
                ],
            ], Response::HTTP_CONFLICT);
        }

        $this->asignaciones->eliminar($asignacion);

        return response()->noContent();
    }
}
