<?php

use App\Http\Controllers\Api\V1\AutenticacionController;
use App\Http\Controllers\Api\V1\NavegacionController;
use App\Http\Controllers\Api\V1\NotaController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API versionada desde el arranque
|--------------------------------------------------------------------------
|
| Prefijo /v1 aunque hoy no exista una v2 -- es mucho más barato empezar
| versionado que migrar después. Ver
| .claude/skills/sistema-academico/references/laravel-postgres.md
|
*/

Route::prefix('v1')->group(function () {

    // Login es el único endpoint de autenticación que NO usa 'auth.rls' --
    // todavía no hay sesión de Sanctum que resolver. Ver AutenticacionService.
    Route::post('/autenticacion/login', [AutenticacionController::class, 'login']);

    // 'auth.rls' = [EstablecerUsuarioActual::class, 'auth:sanctum'] (ver
    // bootstrap/app.php). NINGUNA ruta protegida debería usar
    // 'auth:sanctum' suelto -- si un módulo nuevo arranca sin pasar por
    // 'auth.rls', Postgres nunca sabe quién es el usuario y ninguna
    // política RLS que dependa de fn_usuario_id_actual() lo va a dejar
    // pasar (fallará en silencio, no es un agujero de seguridad, pero sí
    // un bug confuso de detectar).
    Route::middleware('auth.rls')->group(function () {

        /*
         * Identidad de la sesión.
         *
         * Ninguna de las dos lleva 'requiere.permiso', y es deliberado:
         * "¿quién soy y qué puedo hacer?" no es una función del sistema que
         * se habilite por rol, es la condición previa para saber qué
         * funciones tengo. Exigir un permiso acá sería circular. El token
         * válido que ya verificó 'auth.rls' es toda la autorización que
         * corresponde, y RLS acota igual lo que cada uno puede leer.
         */
        Route::get('/autenticacion/yo', [AutenticacionController::class, 'yo']);
        Route::post('/autenticacion/cerrar-sesion', [AutenticacionController::class, 'cerrarSesion']);

        /*
         * Menú del usuario conectado. La respuesta del login ya trae los
         * módulos, así que Angular normalmente no necesita pedir esto: el
         * endpoint existe para poder refrescar el menú sin cerrar sesión
         * cuando super_admin habilita o apaga un módulo.
         */
        Route::get('/navegacion/modulos', [NavegacionController::class, 'index']);

        Route::get('/notas', [NotaController::class, 'index']);
        Route::post('/notas', [NotaController::class, 'store'])
            ->middleware('requiere.permiso:btn_registrar_nota');

        // Los próximos módulos (usuarios, sedes, asignaturas, períodos,
        // asignaciones, matrículas, recursos/permisos) van acá, con el
        // mismo patrón: dentro de este grupo 'auth.rls', y con
        // 'requiere.permiso:codigo' o 'requiere.superadmin' según
        // corresponda -- ver permisos.md para qué código usa cada uno.
    });
});
