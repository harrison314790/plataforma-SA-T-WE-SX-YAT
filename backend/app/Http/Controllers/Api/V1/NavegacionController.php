<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\NavegacionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Un solo controlador para el menú, sin variantes por rol: el rol lo
 * resuelve Sanctum y NavegacionService filtra con él. Organizar esto por
 * rol (Controllers/Admin, Controllers/Profesor...) duplicaría el mismo
 * endpoint tres veces -- ver references/laravel-postgres.md, "Organización
 * de Controllers".
 */
class NavegacionController extends Controller
{
    public function __construct(private readonly NavegacionService $navegacionService)
    {
    }

    /**
     * GET /api/v1/navegacion/modulos
     *
     * El login ya devuelve estos módulos, así que Angular no necesita
     * llamar acá al entrar. Este endpoint es para refrescar el menú en
     * caliente cuando super_admin habilita o apaga un módulo, sin obligar a
     * todo el mundo a cerrar y volver a abrir sesión.
     */
    public function index(Request $request): JsonResponse
    {
        $modulos = $this->navegacionService->modulosPara($request->user()->rol->nombre);

        return response()->json(['modulos' => $modulos]);
    }
}
