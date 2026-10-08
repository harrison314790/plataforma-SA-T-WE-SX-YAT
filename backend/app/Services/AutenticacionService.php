<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\PeriodoAcademico;
use App\Models\Usuario;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Login es un caso especial: corre ANTES de que exista sesión de Sanctum,
 * así que el middleware `auth.rls` (que necesita `$request->user()` ya
 * resuelto) todavía no puede aplicarse. Esta clase hace su propia versión
 * puntual de "establecer quién es el usuario" -- ver
 * references/laravel-postgres.md para el porqué de `fn_usuario_para_login`.
 */
class AutenticacionService
{
    public function __construct(
        private readonly PermisoService $permisoService,
        private readonly NavegacionService $navegacionService,
    ) {
    }

    /**
     * @return array{token: string, usuario: Usuario, permisos: array<string, bool>, modulos: \Illuminate\Support\Collection<int, array<string, mixed>>, periodoActivo: PeriodoAcademico|null}
     */
    public function iniciarSesion(string $email, string $password): array
    {
        $fila = DB::selectOne('select * from fn_usuario_para_login(?)', [$email]);

        // Un solo mensaje para los dos casos (email que no existe y
        // contraseña incorrecta), a propósito: distinguirlos le confirmaría
        // a un atacante qué correos están registrados en la institución.
        if (! $fila || ! Hash::check($password, $fila->password_hash)) {
            throw new ErrorDeNegocio('Correo o contraseña incorrectos');
        }

        return DB::transaction(function () use ($fila) {
            // A partir de acá SÍ hay identidad conocida -- se puede
            // establecer el contexto RLS para el resto de este método,
            // igual que hace el middleware EstablecerUsuarioActual en
            // cualquier otro request ya autenticado.
            // set_config() es una función normal (acepta bind params);
            // `SET LOCAL app.usuario_id = ?` no es válido en Postgres --
            // el comando SET solo admite literales, no parámetros.
            DB::statement("select set_config('app.usuario_id', ?, true)", [$fila->id]);

            $usuario = Usuario::with(['rol', 'sede'])->findOrFail($fila->id);

            return [
                'token' => $usuario->createToken('sesion-web')->plainTextToken,
                ...$this->datosDeSesion($usuario),
            ];
        });
    }

    /**
     * Los datos de sesión de un usuario ya autenticado, sin token: es lo
     * que devuelve GET /autenticacion/yo cuando Angular recarga la página
     * y necesita rehidratar la sesión que tenía guardada.
     *
     * Es el mismo método que usa el login, no una copia: si algún día la
     * sesión suma un dato (digamos, las asignaciones del profesor), aparece
     * de una vez en los dos endpoints y no se pueden desincronizar.
     *
     * @return array{usuario: Usuario, permisos: array<string, bool>, modulos: \Illuminate\Support\Collection<int, array<string, mixed>>, periodoActivo: PeriodoAcademico|null}
     */
    public function datosDeSesion(Usuario $usuario): array
    {
        $usuario->loadMissing(['rol', 'sede']);
        $rol = $usuario->rol->nombre;

        return [
            'usuario' => $usuario,
            'permisos' => $this->permisoService->mapaPara($rol),
            'modulos' => $this->navegacionService->modulosPara($rol),
            'periodoActivo' => $this->periodoActivo(),
        ];
    }

    /**
     * Revoca ÚNICAMENTE el token con el que vino esta petición, no todos
     * los del usuario: los computadores de la escuela son compartidos y una
     * misma persona puede tener sesión abierta en el aula y en la
     * secretaría. Cerrar sesión en un equipo no debe tumbar la del otro.
     */
    public function cerrarSesion(Usuario $usuario): void
    {
        $usuario->currentAccessToken()?->delete();
    }

    /**
     * La época en curso, por fecha (22-epocas-por-fecha.sql). Puede no
     * haber ninguna (receso entre épocas o entre años), y eso no es un
     * error: la barra superior sabe mostrar ese caso.
     */
    private function periodoActivo(): ?PeriodoAcademico
    {
        return PeriodoAcademico::actual();
    }
}
