<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Resources\SesionResource;
use App\Services\AutenticacionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Delgado a propósito, igual que NotaController: recibe la request, valida
 * forma (Form Request), llama al service, arma la respuesta (Resource).
 * Ninguna regla vive acá.
 */
class AutenticacionController extends Controller
{
    public function __construct(private readonly AutenticacionService $autenticacionService)
    {
    }

    /**
     * POST /api/v1/autenticacion/login
     *
     * Devuelve el token de Sanctum MÁS la sesión completa (usuario,
     * período, permisos y módulos) en una sola respuesta: con conectividad
     * intermitente, cada round-trip extra es un punto más donde la pantalla
     * se queda a medias. Ver SesionResource.
     */
    public function login(LoginRequest $request): JsonResponse
    {
        ['email' => $email, 'password' => $password] = $request->validated();

        $sesion = $this->autenticacionService->iniciarSesion($email, $password);

        return response()->json([
            'token' => $sesion['token'],
            ...$this->sesion($sesion)->resolve($request),
        ]);
    }

    /**
     * GET /api/v1/autenticacion/yo
     *
     * Rehidrata la sesión cuando Angular recarga la página con un token ya
     * guardado. Devuelve exactamente la misma forma que `login` menos el
     * token -- el cliente ya lo tiene, y volver a emitirlo dejaría tokens
     * huérfanos en `personal_access_tokens` en cada F5.
     *
     * No lleva `requiere.permiso`: preguntar quién soy no es una función
     * del sistema que se habilite por rol, es la condición para saber qué
     * funciones tengo. El middleware `auth.rls` ya garantiza que hay un
     * token válido detrás.
     */
    public function yo(Request $request): JsonResponse
    {
        $sesion = $this->autenticacionService->datosDeSesion($request->user());

        return response()->json($this->sesion($sesion)->resolve($request));
    }

    /**
     * POST /api/v1/autenticacion/cerrar-sesion
     *
     * 204 y no 200 con cuerpo: no hay nada que devolver, y un cuerpo vacío
     * con 200 obligaría al cliente a parsear un JSON inexistente.
     */
    public function cerrarSesion(Request $request): Response
    {
        $this->autenticacionService->cerrarSesion($request->user());

        return response()->noContent();
    }

    /**
     * @param  array{usuario: \App\Models\Usuario, permisos: array<string, bool>, modulos: \Illuminate\Support\Collection<int, array<string, mixed>>, periodoActivo: \App\Models\PeriodoAcademico|null}  $sesion
     */
    private function sesion(array $sesion): SesionResource
    {
        return new SesionResource(
            $sesion['usuario'],
            $sesion['permisos'],
            $sesion['modulos'],
            $sesion['periodoActivo'],
        );
    }
}
