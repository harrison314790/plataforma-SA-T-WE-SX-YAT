<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ActualizarUsuarioRequest;
use App\Http\Requests\CrearUsuarioRequest;
use App\Http\Resources\CuentaUsuarioResource;
use App\Models\Usuario;
use App\Services\UsuarioService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Cuentas de profesores y estudiantes. Delgado a propósito, igual que
 * AsignacionController: recibe, valida forma (Form Request), llama al
 * service, arma la respuesta (Resource).
 *
 * Exclusivo del nivel admin por tres lados: el guard de Angular, el
 * middleware `requiere.permiso` de cada ruta, y las políticas RLS de
 * `usuarios`/`profesores`/`estudiantes` (02 y 19).
 */
class UsuarioController extends Controller
{
    public function __construct(private readonly UsuarioService $usuarios)
    {
    }

    public function index(Request $request)
    {
        $filtros = $request->validate([
            'tipo' => ['sometimes', 'in:'.implode(',', UsuarioService::TIPOS)],
        ]);

        return CuentaUsuarioResource::collection($this->usuarios->listar($filtros['tipo'] ?? null));
    }

    /** Catálogos del formulario. Ver UsuarioService::opciones(). */
    public function opciones(): JsonResponse
    {
        return response()->json($this->usuarios->opciones());
    }

    public function store(CrearUsuarioRequest $request)
    {
        return CuentaUsuarioResource::make($this->usuarios->crear($request->validated()))
            ->response()
            ->setStatusCode(201);
    }

    public function update(ActualizarUsuarioRequest $request, Usuario $usuario)
    {
        return CuentaUsuarioResource::make($this->usuarios->actualizar($usuario, $request->validated()));
    }

    /**
     * Borrado definitivo, solo de una cuenta sin datos asociados.
     *
     * 409 con código propio (`USUARIO_CON_DATOS`) y no una ErrorDeNegocio,
     * por lo mismo que AsignacionController::destroy(): el frontend tiene
     * que poder reconocer ESTE caso sin leer prosa, para refrescar la fila
     * y mostrar "Eliminar" deshabilitado con su explicación.
     */
    public function destroy(Usuario $usuario)
    {
        // Desde `administrables()`: un admin o super_admin da 404 acá,
        // antes de mirar sus datos -- este módulo no los administra.
        $cuenta = $this->usuarios->administrables()->whereKey($usuario->getKey())->firstOrFail();

        if ($cuenta->tieneDatosAsociados()) {
            return response()->json([
                'error' => [
                    'codigo' => 'USUARIO_CON_DATOS',
                    'mensaje' => 'No se puede eliminar una cuenta con datos asociados. Desactívala en su lugar: no podrá iniciar sesión, pero sus datos se conservan.',
                ],
            ], Response::HTTP_CONFLICT);
        }

        $this->usuarios->eliminar($cuenta);

        return response()->noContent();
    }
}
