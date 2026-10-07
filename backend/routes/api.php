<?php

use App\Http\Controllers\Api\V1\AsignacionController;
use App\Http\Controllers\Api\V1\AutenticacionController;
use App\Http\Controllers\Api\V1\BoletinController;
use App\Http\Controllers\Api\V1\MatriculaController;
use App\Http\Controllers\Api\V1\NavegacionController;
use App\Http\Controllers\Api\V1\NotaController;
use App\Http\Controllers\Api\V1\NudoPedagogicoController;
use App\Http\Controllers\Api\V1\OfertaGradoController;
use App\Http\Controllers\Api\V1\PorcentajeGradoController;
use App\Http\Controllers\Api\V1\UsuarioController;
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

        /*
         * NUDOS PEDAGÓGICOS -- catálogo de nudos, catálogo de materias
         * (crear / renombrar / eliminar) y a qué nudo pertenece cada una. Capa encima de asignaciones: no cambia quién dicta
         * qué ni cómo sube sus notas el profesor.
         *
         * `/asignaturas/{asignatura}` tiene un segmento más que
         * `/{nudo}`, así que no se pisan -- pero va primero igual, para
         * que el orden no dependa de contar segmentos.
         */
        Route::prefix('nudos')
            ->middleware('requiere.permiso:vista_nudos_pedagogicos')
            ->group(function () {
                Route::get('/', [NudoPedagogicoController::class, 'index']);

                Route::middleware('requiere.permiso:btn_gestionar_nudos')->group(function () {
                    Route::post('/asignaturas', [NudoPedagogicoController::class, 'crearMateria']);
                    Route::put('/asignaturas/{asignatura}', [NudoPedagogicoController::class, 'actualizarMateria']);
                    Route::patch('/asignaturas/{asignatura}', [NudoPedagogicoController::class, 'asignarNudo']);
                    Route::delete('/asignaturas/{asignatura}', [NudoPedagogicoController::class, 'eliminarMateria']);
                    Route::post('/', [NudoPedagogicoController::class, 'store']);
                    Route::put('/{nudo}', [NudoPedagogicoController::class, 'update']);
                    Route::delete('/{nudo}', [NudoPedagogicoController::class, 'destroy']);
                });
            });

        /*
         * PORCENTAJES POR GRADO -- cuánto pesa cada materia en su nudo,
         * por grado de secundaria (6 a 11) y año. Una sola configuración
         * por grado: 6-A y 6-B comparten. La suma de 100 por nudo la
         * valida PorcentajeGradoService, no solo Angular.
         */
        Route::prefix('porcentajes')
            ->middleware('requiere.permiso:vista_porcentajes_grado')
            ->group(function () {
                Route::get('/opciones', [PorcentajeGradoController::class, 'opciones']);
                Route::get('/', [PorcentajeGradoController::class, 'show']);
                Route::put('/', [PorcentajeGradoController::class, 'update'])
                    ->middleware('requiere.permiso:btn_guardar_porcentajes');
            });

        /*
         * BOLETINES -- por nudo, como el boletín impreso. `vista_boletines`
         * la tienen admin y estudiante; quién ve el boletín de QUIÉN lo
         * decide BoletinController (admin: cualquiera; estudiante: solo
         * `/mio`), y RLS lo respalda.
         */
        Route::prefix('boletines')
            ->middleware('requiere.permiso:vista_boletines')
            ->group(function () {
                Route::get('/mio', [BoletinController::class, 'mio']);
                Route::get('/opciones', [BoletinController::class, 'opciones']);
                Route::get('/estudiantes', [BoletinController::class, 'estudiantes']);
                Route::get('/estudiantes/{estudiante}', [BoletinController::class, 'show']);
            });

        /*
         * USUARIOS -- cuentas de profesores y estudiantes: identidad y
         * acceso, nada de matrícula ni de asignaciones.
         *
         * Mismo esquema que asignaciones: `vista_admin_usuarios` es la
         * puerta de todo el grupo (incluidas las escrituras), y cada
         * acción tiene su `btn_*`. Activar/desactivar va dentro de editar
         * (el toggle "Cuenta activa" del formulario), así que no tiene
         * código propio. Ver 19-usuarios-modulo.sql.
         *
         * `whereUuid`: un id que no es uuid da 404 en la ruta, en vez de
         * llegar a Postgres y volver como un 500 de sintaxis de uuid.
         */
        Route::prefix('usuarios')
            ->middleware('requiere.permiso:vista_admin_usuarios')
            ->group(function () {
                Route::get('/opciones', [UsuarioController::class, 'opciones']);
                Route::get('/', [UsuarioController::class, 'index']);

                Route::post('/', [UsuarioController::class, 'store'])
                    ->middleware('requiere.permiso:btn_crear_usuario');

                Route::put('/{usuario}', [UsuarioController::class, 'update'])
                    ->whereUuid('usuario')
                    ->middleware('requiere.permiso:btn_editar_usuario');

                Route::delete('/{usuario}', [UsuarioController::class, 'destroy'])
                    ->whereUuid('usuario')
                    ->middleware('requiere.permiso:btn_eliminar_usuario');
            });

        /*
         * MATRÍCULAS -- un estudiante en una sede+grado+grupo por AÑO
         * (20-matriculas-por-anio.sql).
         *
         * Mismo esquema que asignaciones y usuarios: `vista_matriculas`
         * es la puerta de todo el grupo y cada acción tiene su `btn_*`.
         * Agregar un acudiente va con `btn_matricular_estudiante`: se
         * hace desde el formulario de matricular, no es una acción suelta.
         *
         * No hay DELETE: una matrícula se retira (queda 'retirada' con su
         * motivo), nunca se borra -- tampoco hay política RLS de delete.
         */
        Route::prefix('matriculas')
            ->middleware('requiere.permiso:vista_matriculas')
            ->group(function () {
                Route::get('/opciones', [MatriculaController::class, 'opciones']);
                Route::get('/', [MatriculaController::class, 'index']);

                Route::middleware('requiere.permiso:btn_matricular_estudiante')->group(function () {
                    Route::post('/', [MatriculaController::class, 'store']);
                    Route::post('/lote', [MatriculaController::class, 'lote']);
                    Route::post('/acudientes', [MatriculaController::class, 'agregarAcudiente']);
                });

                Route::patch('/{matricula}/grupo', [MatriculaController::class, 'cambiarGrupo'])
                    ->whereUuid('matricula')
                    ->middleware('requiere.permiso:btn_cambiar_grupo');

                Route::patch('/{matricula}/retiro', [MatriculaController::class, 'retirar'])
                    ->whereUuid('matricula')
                    ->middleware('requiere.permiso:btn_retirar_matricula');
            });

        // Los próximos módulos (sedes, asignaturas, períodos,
        // recursos/permisos) van acá, con el mismo patrón:
        // dentro de este grupo 'auth.rls', y con
        // 'requiere.permiso:codigo' o 'requiere.superadmin' según
        // corresponda -- ver permisos.md para qué código usa cada uno.
    });
});
