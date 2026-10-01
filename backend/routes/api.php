<?php

use App\Http\Controllers\Api\V1\AsignacionController;
use App\Http\Controllers\Api\V1\AutenticacionController;
use App\Http\Controllers\Api\V1\NavegacionController;
use App\Http\Controllers\Api\V1\NotaController;
use App\Http\Controllers\Api\V1\OfertaGradoController;
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

        /*
         * ASIGNACIONES -- quién dicta qué, por grado, grupo y AÑO.
         *
         * `vista_asignaciones` se exige en TODO el grupo, incluidas las
         * escrituras: el permiso de vista es la puerta del módulo, y los
         * códigos de botón (`btn_*`) son el permiso fino de cada acción
         * dentro de él. Sin esto, un rol al que se le quitara la vista
         * pero le quedara un `btn_*` habilitado por olvido podría seguir
         * escribiendo por API en un módulo que ya no puede abrir.
         *
         * `/opciones` va ANTES de `/{asignacion}` y no es un detalle de
         * estilo: con el orden invertido, Laravel intentaría resolver la
         * palabra "opciones" como el id de una asignación.
         *
         * Los tres códigos de botón son distintos a propósito -- crear y
         * editar son reversibles, eliminar no. Ver el paso 6 de
         * 11-asignaciones-modulo.sql.
         */
        Route::prefix('asignaciones')
            ->middleware('requiere.permiso:vista_asignaciones')
            ->group(function () {
                Route::get('/opciones', [AsignacionController::class, 'opciones']);
                Route::get('/', [AsignacionController::class, 'index']);

                Route::post('/', [AsignacionController::class, 'store'])
                    ->middleware('requiere.permiso:btn_crear_asignacion');

                Route::put('/{asignacion}', [AsignacionController::class, 'update'])
                    ->middleware('requiere.permiso:btn_editar_asignacion');

                // Desactivar/reactivar va con `btn_editar_asignacion`, no
                // con `btn_eliminar_asignacion`: es reversible y no
                // destruye nada. Tampoco tiene código propio, porque no
                // es una acción suelta de ninguna pantalla -- se llega
                // solo desde el diálogo de eliminar, como la alternativa
                // cuando la asignación tiene notas.
                Route::patch('/{asignacion}/activo', [AsignacionController::class, 'cambiarEstado'])
                    ->middleware('requiere.permiso:btn_editar_asignacion');

                Route::delete('/{asignacion}', [AsignacionController::class, 'destroy'])
                    ->middleware('requiere.permiso:btn_eliminar_asignacion');
            });

        /*
         * OFERTA DE GRADOS -- qué grado+grupo existe en cada sede.
         *
         * Recurso propio y no un sub-recurso de `asignaciones`: la misma
         * tabla la va a usar Matrículas, y anidarlo bajo /asignaciones
         * habría atado el catálogo al primer módulo que lo necesitó.
         *
         * La puerta es `vista_asignaciones` y eso SÍ es temporal: hoy es
         * la única pantalla desde donde se administra. Cuando exista
         * Matrículas hay que decidir si esto pasa a un módulo de
         * configuración con su propio código de vista, en vez de heredar
         * este por inercia.
         *
         * Un solo `btn_gestionar_grados` para crear, desactivar y
         * eliminar -- el porqué (la FK compuesta ya impide borrar lo que
         * está en uso) está en 12-gestion-oferta-grados.sql.
         */
        Route::prefix('oferta-grados')
            ->middleware('requiere.permiso:vista_asignaciones')
            ->group(function () {
                Route::get('/', [OfertaGradoController::class, 'index']);

                Route::post('/', [OfertaGradoController::class, 'store'])
                    ->middleware('requiere.permiso:btn_gestionar_grados');

                Route::patch('/{ofertaGrado}/activo', [OfertaGradoController::class, 'cambiarEstado'])
                    ->middleware('requiere.permiso:btn_gestionar_grados');

                Route::delete('/{ofertaGrado}', [OfertaGradoController::class, 'destroy'])
                    ->middleware('requiere.permiso:btn_gestionar_grados');
            });

        // Los próximos módulos (usuarios, sedes, asignaturas, períodos,
        // matrículas, recursos/permisos) van acá, con el mismo patrón:
        // dentro de este grupo 'auth.rls', y con
        // 'requiere.permiso:codigo' o 'requiere.superadmin' según
        // corresponda -- ver permisos.md para qué código usa cada uno.
    });
});
