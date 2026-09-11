<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Permiso;
use App\Models\Usuario;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Login es un caso especial: corre ANTES de que exista sesión de
 * Sanctum, así que el middleware `auth.rls` (que necesita
 * `$request->user()` ya resuelto) todavía no puede aplicarse. Esta clase
 * hace su propia versión puntual de "establecer quién es el usuario"
 * -- ver [[laravel-postgres]] para el porqué de `fn_usuario_para_login`.
 */
class AutenticacionService
{
    public function iniciarSesion(string $email, string $password): array
    {
        $fila = DB::selectOne('select * from fn_usuario_para_login(?)', [$email]);

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

            $usuario = Usuario::with('rol')->findOrFail($fila->id);
            $token = $usuario->createToken('sesion-web')->plainTextToken;

            return [
                'token' => $token,
                'rol' => $usuario->rol->nombre,
                'permisos' => $this->permisosPara($usuario->rol->nombre),
            ];
        });
    }

    public function permisosPara(string $rolNombre): array
    {
        return Permiso::whereHas('rol', fn ($q) => $q->where('nombre', $rolNombre))
            ->with('recurso')
            ->get()
            ->mapWithKeys(fn (Permiso $permiso) => [$permiso->recurso->codigo => $permiso->habilitado])
            ->all();
    }
}
