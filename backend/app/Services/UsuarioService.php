<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Estudiante;
use App\Models\Profesor;
use App\Models\Recurso;
use App\Models\Rol;
use App\Models\Sede;
use App\Models\Usuario;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Hash;

/**
 * Lógica del módulo de Usuarios: cuentas de profesores y estudiantes, y
 * NADA más. Grado, grupo y sede del estudiante son de Matrículas; las
 * materias del profesor, de Asignaciones.
 *
 * Cada cuenta son DOS filas: la de `usuarios` (identidad y acceso) y la de
 * su extensión (`profesores` o `estudiantes`), que es lo que el resto del
 * sistema referencia. Se crean, activan y borran juntas. No hace falta una
 * transacción propia: todo el request ya corre dentro de la que abre
 * EstablecerUsuarioActual, así que si la segunda fila falla, la primera se
 * deshace con ella.
 *
 * Como en AsignacionService, lo que se chequea acá se adelanta a Postgres
 * para poder explicarlo -- nunca lo reemplaza. Las FK sin cascade y las
 * políticas RLS (19-usuarios-modulo.sql) siguen siendo la garantía.
 */
class UsuarioService
{
    /** Los únicos roles que administra este módulo. */
    public const TIPOS = ['profesor', 'estudiante'];

    /**
     * Todas las cuentas de profesores y estudiantes, en una respuesta.
     *
     * Sin paginar y con los dos tipos juntos, a propósito: la pantalla
     * muestra el conteo de AMBAS pestañas y los conteos de Activos/
     * Inactivos/Todos se recalculan al escribir en el buscador. Con
     * decenas a pocos cientos de cuentas son unos kilobytes, y filtrar en
     * el cliente evita un round-trip por cada tecla con la señal de una
     * vereda.
     */
    public function listar(?string $tipo = null): Collection
    {
        return $this->administrables()
            ->when($tipo, fn (Builder $q) => $q->whereHas('rol', fn (Builder $r) => $r->where('nombre', $tipo)))
            ->orderBy('apellidos')
            ->orderBy('nombres')
            ->get();
    }

    /**
     * Los catálogos del formulario: sedes (solo para profesores), el
     * dominio sugerido para el email de estudiantes, y el rótulo/ícono de
     * las acciones definidos en `recursos` -- mismo patrón que
     * AsignacionService::opciones().
     */
    public function opciones(): array
    {
        return [
            'sedes' => Sede::query()
                ->orderByRaw("tipo <> 'principal'")
                ->orderBy('nombre')
                ->get()
                ->map(fn (Sede $s) => [
                    'id' => $s->id,
                    'nombre' => $s->nombre,
                    'tipo' => $s->tipo,
                    'vereda' => $s->vereda,
                    'esPrincipal' => $s->tipo === 'principal',
                ])->all(),

            'dominioEstudiantes' => config('usuarios.dominio_correo_estudiantes'),

            'acciones' => Recurso::accionesDe('usuarios'),
        ];
    }

    /**
     * Alta: la fila de `usuarios` y su extensión.
     *
     * El rol sale de `tipo`, que el Form Request ya restringió a
     * profesor/estudiante: no hay forma de crear un admin desde acá.
     * La contraseña se guarda con `Hash::make` (bcrypt) y NO vuelve en la
     * respuesta: quien la escribió ya la tiene, y es él quien se la
     * muestra a la persona una sola vez.
     */
    public function crear(array $datos): Usuario
    {
        $rol = Rol::query()->where('nombre', $datos['tipo'])->firstOrFail();

        $usuario = Usuario::create([
            'rol_id' => $rol->id,
            // El estudiante nace sin sede: la suya es la de su matrícula.
            'sede_id' => $datos['tipo'] === 'profesor' ? $datos['sede_id'] : null,
            'nombres' => $datos['nombres'],
            'apellidos' => $datos['apellidos'],
            'documento' => $datos['documento'],
            'email' => $datos['email'],
            'password_hash' => Hash::make($datos['password']),
        ]);

        if ($datos['tipo'] === 'profesor') {
            Profesor::create(['usuario_id' => $usuario->id]);
        } else {
            Estudiante::create(['usuario_id' => $usuario->id]);
        }

        return $this->recargar($usuario);
    }

    /**
     * Edición de datos de identidad y del estado de la cuenta.
     *
     * DESACTIVAR HACE TRES COSAS, Y LAS TRES HACEN FALTA:
     * 1. `usuarios.activo = false` -- el login la rechaza desde ya
     *    (`fn_usuario_para_login` filtra por activo).
     * 2. La extensión (`profesores`/`estudiantes`) también pasa a
     *    inactiva. Es lo que lee Asignaciones para no ofrecer a un
     *    profesor dado de baja en su selector; sin esto, la cuenta
     *    estaría apagada y el profesor seguiría apareciendo para recibir
     *    materias nuevas.
     * 3. Se revocan sus tokens. Sin esto, alguien con la sesión abierta
     *    seguiría trabajando hasta que el token expire: el filtro del
     *    login solo actúa al ENTRAR.
     *
     * Nada de lo que la persona ya hizo se toca: notas, asignaciones y
     * matrículas se conservan.
     */
    public function actualizar(Usuario $usuario, array $datos): Usuario
    {
        $this->exigirAdministrable($usuario);

        $esProfesor = $usuario->rol->nombre === 'profesor';
        $seDesactiva = $usuario->activo && ! $datos['activo'];

        $usuario->update([
            'nombres' => $datos['nombres'],
            'apellidos' => $datos['apellidos'],
            'documento' => $datos['documento'],
            'email' => $datos['email'],
            'activo' => $datos['activo'],
            // La del estudiante no se toca desde acá (ver la regla
            // `prohibited` de UsuarioRequest).
            ...($esProfesor ? ['sede_id' => $datos['sede_id']] : []),
            // Restablecer: el profesor que olvidó su contraseña no tenía
            // ninguna salida. Solo coordinación la cambia, y se entrega en
            // persona (la pantalla la muestra una vez).
            ...(! empty($datos['password']) ? ['password_hash' => Hash::make($datos['password'])] : []),
        ]);

        ($esProfesor ? $usuario->profesor() : $usuario->estudiante())
            ->update(['activo' => $datos['activo']]);

        // Con contraseña nueva también se cierran sus sesiones abiertas:
        // si se restableció porque alguien más la conocía, esa persona no
        // debe seguir adentro con su token anterior.
        if ($seDesactiva || ! empty($datos['password'])) {
            $usuario->tokens()->delete();
        }

        return $this->recargar($usuario);
    }

    /**
     * Borrado definitivo, solo de una cuenta sin ningún dato asociado.
     *
     * Pensado para la cuenta creada por error (documento mal tecleado, la
     * misma persona dos veces). Una cuenta con historia se DESACTIVA.
     *
     * Las mismas dos redes que AsignacionService::eliminar():
     * · FK 23503: si algo apunta a la cuenta, Postgres no la deja borrar.
     *   El controlador ya lo chequeó para responder un 409 con su código
     *   propio; acá se traduce igual por si algo se coló entremedio.
     * · 0 filas afectadas: con RLS, un DELETE sin política no falla, no
     *   borra. Si salta, falta 19-usuarios-modulo.sql en esa base.
     */
    public function eliminar(Usuario $usuario): void
    {
        $this->exigirAdministrable($usuario);

        try {
            $usuario->profesor()->delete();
            $usuario->estudiante()->delete();
            $usuario->tokens()->delete();

            $eliminadas = Usuario::query()->whereKey($usuario->getKey())->delete();
        } catch (QueryException $e) {
            if ($e->getCode() === '23503') {
                throw new ErrorDeNegocio(
                    'Esta cuenta tiene datos asociados y no se puede eliminar. Desactívala en su lugar.'
                );
            }

            throw $e;
        }

        if ($eliminadas === 0) {
            throw new ErrorDeNegocio(
                'No se pudo eliminar la cuenta. Si el problema sigue, avisa a soporte: puede faltar una política de la base de datos.'
            );
        }
    }

    /**
     * La cuenta con todo lo que CuentaUsuarioResource necesita para
     * decidir `vinculado` y `eliminable`. Son subselects de conteo, no
     * N+1: una sola consulta por relación para toda la lista.
     */
    public function consulta(): Builder
    {
        return Usuario::query()
            ->with([
                'rol',
                'sede',
                'profesor' => fn ($q) => $q->withCount(['asignaciones', 'excepcionesPlazo']),
                'estudiante' => fn ($q) => $q->withCount(['matriculas', 'notas', 'documentos', 'acudientes']),
            ])
            ->withCount(['notasRegistradas', 'documentosSubidos']);
    }

    /** Solo las cuentas que este módulo administra: profesores y estudiantes. */
    public function administrables(): Builder
    {
        return $this->consulta()->whereHas('rol', fn (Builder $q) => $q->whereIn('nombre', self::TIPOS));
    }

    /**
     * Este módulo administra profesores y estudiantes, nunca a otro admin
     * ni al super_admin. RLS ya impide tocar un super_admin; esto cierra
     * además el caso de un admin editando a otro admin desde una pantalla
     * que no fue hecha para eso. Responde 404 y no 403: desde este módulo,
     * esas cuentas simplemente no existen.
     */
    private function exigirAdministrable(Usuario $usuario): void
    {
        if (! in_array($usuario->rol?->nombre, self::TIPOS, true)) {
            throw (new ModelNotFoundException())->setModel(Usuario::class, [$usuario->getKey()]);
        }
    }

    private function recargar(Usuario $usuario): Usuario
    {
        // Se relee de la base por lo mismo que el `refresh()` de
        // AsignacionService: `activo` y `created_at` los pone Postgres por
        // default y no existen en el modelo en memoria después de un
        // `create()`. De paso trae los conteos que el Resource necesita.
        return $this->consulta()->whereKey($usuario->getKey())->firstOrFail();
    }
}
