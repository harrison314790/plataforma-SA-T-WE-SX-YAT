<?php

namespace App\Http\Requests;

use App\Models\Profesor;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Base común de crear/editar una asignación. Las dos operaciones
 * comparten todas las reglas menos dos matices (la unicidad se ignora a
 * sí misma al editar, y la oferta de grados se relaja si la combinación
 * no cambió), así que la forma se escribe UNA vez acá y las subclases
 * solo declaran esos matices -- ver CrearAsignacionRequest /
 * ActualizarAsignacionRequest.
 *
 * DÓNDE TERMINA LA RESPONSABILIDAD DE ESTE ARCHIVO
 * La regla del proyecto (references/laravel-postgres.md) es que un Form
 * Request responde "¿tiene forma válida este dato?" y nunca "¿le
 * pertenece esta fila a este usuario?" -- eso último es alcance de datos
 * y lo resuelve RLS.
 *
 * Las tres reglas cruzadas de acá (malla curricular, oferta de grados,
 * unicidad anual) no rompen esa línea: las tres son restricciones de
 * INTEGRIDAD que Postgres ya impone por su cuenta (dos llaves foráneas y
 * una restricción `unique`, ver 08 y 09). Si no estuvieran acá, el
 * usuario vería un 500 con un error crudo de FK en vez de "Matemáticas
 * no está en la malla de grado 3". No sustituyen al control de la base:
 * lo traducen.
 *
 * `authorize()` SÍ hace algo acá, a diferencia del resto de Form
 * Requests del proyecto -- ver el docblock del método.
 */
abstract class AsignacionRequest extends FormRequest
{
    /**
     * Módulo exclusivo del nivel admin, verificado tres veces a propósito:
     * el guard de Angular (capa 1), el middleware `requiere.permiso` de la
     * ruta (capa 2) y las políticas RLS de `asignaciones`, que solo dejan
     * escribir a `fn_es_admin()` (capa 3).
     *
     * Este chequeo es una cuarta red, y no contradice la convención de
     * "authorize() devuelve true porque ya lo resolvió el middleware": el
     * middleware compara contra la tabla `permisos`, que es CONFIGURABLE
     * -- un super_admin puede habilitarle `btn_crear_asignacion` a otro
     * rol sin desplegar. Esta línea dice algo que no es configurable: sin
     * importar qué diga `permisos`, escribir asignaciones es del nivel
     * admin, igual que lo dice RLS. Si algún día el negocio decide lo
     * contrario, hay que cambiar las dos (esta y la política), no una.
     */
    public function authorize(): bool
    {
        $rol = $this->user()?->rol?->nombre;

        return in_array($rol, ['admin', 'super_admin'], true);
    }

    /**
     * La sede NO se pide en el formulario: se deduce del profesor.
     *
     * Cada profesor pertenece a una sola sede (`usuarios.sede_id`), así
     * que preguntarla aparte solo abriría la puerta a una asignación con
     * una sede distinta a la del profesor que la dicta -- un dato
     * imposible de interpretar después. Lo que mande el cliente en
     * `sede_id` se descarta acá: `merge()` pisa el valor recibido.
     */
    protected function prepareForValidation(): void
    {
        $profesor = Profesor::with('usuario:id,sede_id')->find($this->input('profesor_id'));

        $this->merge(['sede_id' => $profesor?->usuario?->sede_id]);
    }

    public function rules(): array
    {
        $grado = $this->input('grado');

        // Las reglas que CONSULTAN la base con grado/año/sede (oferta,
        // malla, unicidad) solo se agregan si esos valores son enteros.
        // Si no, Postgres recibía `grado = 'nueve'` y respondía un 500
        // antes de que la regla `integer` alcanzara a decir que el dato
        // está mal. Con tipos inválidos, el error sale de esa regla.
        $consultable = $this->esEntero('grado') && $this->esEntero('anio') && $this->esEntero('sede_id');

        return [
            'profesor_id' => ['required', 'uuid', 'exists:profesores,id'],

            // Derivada en prepareForValidation(), nunca del cliente. Se
            // valida igual porque puede llegar nula: `usuarios.sede_id` es
            // nullable en el esquema y un profesor sin sede adscrita no
            // puede recibir una asignación (la FK compuesta contra
            // oferta_grados no tendría contra qué validarse).
            'sede_id' => ['required', 'integer', 'exists:sedes,id'],

            'anio' => ['required', 'integer', 'between:2000,2100'],

            'grado' => ['required', 'integer', 'between:1,11'],

            // Contra oferta_grados: la sede tiene que tener ese grado+grupo
            // dado de alta. Es la traducción legible de la llave foránea
            // compuesta (sede_id, grado, grupo) de 08.
            'grupo' => array_filter(['required', 'string', 'max:10', $consultable ? $this->reglaDeOferta() : null]),

            // Contra malla_curricular: solo las materias que ese grado ve.
            // Nunca una combinación libre grado+materia (ver sección 9 de
            // references/base-datos.md).
            'asignatura_id' => array_filter([
                'required',
                'integer',
                'exists:asignaturas,id',
                $consultable ? Rule::exists('malla_curricular', 'asignatura_id')->where('grado', $grado) : null,
                $consultable ? $this->reglaDeUnicidad() : null,
            ]),
        ];
    }

    private function esEntero(string $campo): bool
    {
        return filter_var($this->input($campo), FILTER_VALIDATE_INT) !== false;
    }

    /**
     * La restricción real es `unique (asignatura_id, sede_id, grado, grupo,
     * anio)` -- SIN el profesor desde 24-correcciones-auditoria.sql: una
     * materia de un curso la dicta un solo docente por año. Con el
     * profesor en la llave, Matemáticas 9-B podía tener a dos docentes, cada
     * uno subía su nota y el nudo del boletín promediaba las dos. Sin esta regla,
     * repetir una asignación sube como un 500 con el error crudo de
     * Postgres -- justo lo que el formato de errores del proyecto no debe
     * dejar salir.
     *
     * Cuelga de `asignatura_id` y no de un campo inventado porque el
     * frontend muestra el primer `detalles` del 422 al lado del campo: que
     * el mensaje aparezca junto a la asignatura es lo más cercano a "esto
     * ya existe" sin inventar una clave que no es un campo del formulario.
     */
    protected function reglaDeUnicidad(): object
    {
        return Rule::unique('asignaciones', 'asignatura_id')
            ->where('sede_id', $this->input('sede_id'))
            ->where('grado', $this->input('grado'))
            ->where('grupo', $this->input('grupo'))
            ->where('anio', $this->input('anio'));
    }

    /**
     * Crear exige `activo = true`: una combinación que la sede cerró no se
     * ofrece para trabajo nuevo. Editar lo relaja cuando la combinación no
     * cambió -- ver ActualizarAsignacionRequest.
     */
    protected function reglaDeOferta(): object
    {
        return Rule::exists('oferta_grados', 'grupo')
            ->where('sede_id', $this->input('sede_id'))
            ->where('grado', $this->input('grado'))
            ->where('activo', true);
    }

    public function messages(): array
    {
        return [
            // El `exists` genérico ("El grupo seleccionado no existe") no
            // explica nada acá: el grupo existe, lo que no existe es la
            // combinación con esa sede. Mismo criterio para la malla.
            'grupo.exists' => 'La sede de este profesor no tiene abierto ese grado y grupo. Si hace falta, primero hay que darlo de alta en la oferta de grados de la sede.',
            'asignatura_id.exists' => 'Esa asignatura no está en la malla curricular del grado elegido.',
            'asignatura_id.unique' => 'Esa materia ya tiene profesor en este curso para el año elegido. Si cambia el docente, edita la asignación existente.',
            'sede_id.required' => 'El profesor elegido no tiene una sede asignada, así que no se le puede dar una asignación. Hay que corregir su ficha de usuario primero.',
        ];
    }
}
