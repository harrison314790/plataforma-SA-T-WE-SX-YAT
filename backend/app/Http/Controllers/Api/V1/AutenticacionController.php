<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Services\AutenticacionService;

class AutenticacionController extends Controller
{
    public function __construct(private readonly AutenticacionService $autenticacionService)
    {
    }

    public function login(LoginRequest $request)
    {
        $datos = $request->validated();

        $resultado = $this->autenticacionService->iniciarSesion($datos['email'], $datos['password']);

        return response()->json($resultado);
    }
}
