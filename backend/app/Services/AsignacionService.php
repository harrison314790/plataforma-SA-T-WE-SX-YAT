<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Asignacion;
use App\Models\Asignatura;
use App\Models\MallaCurricular;
use App\Models\OfertaGrado;
use App\Models\PeriodoAcademico;
use App\Models\Profesor;
use App\Models\Recurso;
use App\Models\Sede;
use App\Models\Usuario;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\QueryException;

/**
 * Lógica del módulo de Asignaciones que no pertenece a un solo modelo:
 * el armado del listado filtrado, el catálogo que alimenta el
 * formulario, y las dos operaciones que pueden fallar por una razón que
 * hay que EXPLICAR y no solo rechazar (eliminar con notas, y el borrado
 * que RLS deja pasar sin borrar nada).
 *
 * Igual que NotaService, esto corre ANTES de chocar contra Postgres para
 * poder devolver un mensaje legible -- nunca en vez de Postgres. La
 * llave foránea compuesta contra `oferta_grados`, la restricción de
 * unicidad anual y las políticas RLS siguen siendo las que garantizan el
 * dato; este archivo solo se adelanta a traducirlas.
 */
class AsignacionService
{
    /**
     * Listado filtrado.
     *
     * LOS FILTROS SON INDEPENDIENTES ENTRE SÍ, Y ESO ES EL PUNTO.
     * Cada uno es un `where` suelto: filtrar por `grado = 3` devuelve
     * TODAS las asignaciones de tercero, del grupo que sea, en todas las
     * sedes. Combinarlos acota, pero ninguno depende de otro -- no hay
     * un "grado+grupo" que haya que elegir junto. Es la diferencia entre
     * "¿quién dicta en tercero?" (una pregunta real de coordinación) y
     * "¿quién dicta en 3-A?".
     *
     * Sin filtro de sede/año/etc., devuelve todo lo que RLS deje ver --
     * que para admin es la tabla completa. El módulo es exclusivo del
     * nivel admin, así que no hay un caso "profesor con 400 filas"; si
     * algún día lo hubiera, acá es donde entraría la paginación.
     */
    public function listar(array $filtros): Collection
    {
        return Asignacion::query()
            // El join es solo para poder ORDENAR por el nombre de la
            // asignatura desde SQL; las columnas que viajan siguen siendo
            // las de `asignaciones` (de ahí el select explícito, que
            // además evita que `asignaturas.id` pise a `asignaciones.id`).
            // Ordenar en memoria con sortBy() no servía: reordena toda la
            // colección y se lleva por delante el orden por grado/grupo.
            ->select('asignaciones.*')
            ->join('asignaturas', 'asignaturas.id', '=', 'asignaciones.asignatura_id')
            ->with(['profesor.usuario', 'asignatura', 'sede'])
            // El conteo va en la consulta del listado y no en una
            // petición aparte al abrir el diálogo de borrado: es un
            // subselect, no un N+1, y ahorra un round-trip en el momento
            // exacto en que la persona está esperando una respuesta.
            ->withCount('notas')
            ->when(isset($filtros['anio']), fn ($q) => $q->where('asignaciones.anio', $filtros['anio']))
            ->when(isset($filtros['sede_id']), fn ($q) => $q->where('asignaciones.sede_id', $filtros['sede_id']))
            ->when(isset($filtros['grado']), fn ($q) => $q->where('asignaciones.grado', $filtros['grado']))
            ->when(isset($filtros['grupo']), fn ($q) => $q->where('asignaciones.grupo', $filtros['grupo']))
            ->when(isset($filtros['profesor_id']), fn ($q) => $q->where('asignaciones.profesor_id', $filtros['profesor_id']))
            ->when(isset($filtros['asignatura_id']), fn ($q) => $q->where('asignaciones.asignatura_id', $filtros['asignatura_id']))
            ->when(isset($filtros['activo']), fn ($q) => $q->where('asignaciones.activo', $filtros['activo']))
            // Ordenado por grado y grupo, no por fecha de creación: la
            // pregunta que se le hace a esta tabla es "¿cómo está armado
            // tercero?", no "¿qué se cargó último".
            ->orderBy('asignaciones.anio', 'desc')
            ->orderBy('asignaciones.grado')
            ->orderBy('asignaciones.grupo')
            ->orderBy('asignaturas.nombre')
            ->get();
    }

    /**
     * Todo lo que el formulario necesita para armarse, en UNA respuesta.
     *
     * Podrían ser cinco endpoints (profesores, asignaturas, sedes,
     * oferta, años) y sería más "REST", pero cada round-trip extra es un
     * punto más donde la pantalla se queda a medias con la conectividad
     * de una vereda -- el mismo criterio por el que el login ya manda
     * usuario+permisos+módulos junto. Son catálogos chicos (decenas de
     * filas, no miles).
     *
     * La malla y la oferta viajan COMPLETAS, no filtradas por el grado
     * que el usuario todavía no eligió: así el formulario recalcula sus
     * selectores al vuelo, sin pedirle nada al servidor cada vez que
     * cambia el grado. Con 11 grados y una decena de materias por grado
     * son unos pocos kilobytes.
     */
    public function opciones(): array
    {
        $profesores = Profesor::query()
            ->with('usuario.sede')
            ->where('activo', true)
            ->get()
            ->filter(fn (Profesor $p) => $p->usuario !== null)
            ->sortBy(fn (Profesor $p) => mb_strtolower($p->usuario->apellidos.' '.$p->usuario->nombres))
            ->values();

        return [
            'profesores' => $profesores->map(fn (Profesor $p) => [
                'id' => $p->id,
                'nombreCompleto' => trim("{$p->usuario->nombres} {$p->usuario->apellidos}"),
                // La sede del profesor ES la sede de sus asignaciones: el
                // formulario la muestra en cuanto se elige el profesor,
                // sin preguntar nada más.
                'sede' => $p->usuario->sede === null ? null : [
                    'id' => $p->usuario->sede->id,
                    'nombre' => $p->usuario->sede->nombre,
                    'tipo' => $p->usuario->sede->tipo,
                    'vereda' => $p->usuario->sede->vereda,
                    'esPrincipal' => $p->usuario->sede->tipo === 'principal',
                ],
            ])->all(),

            'asignaturas' => Asignatura::query()
                ->orderBy('nombre')
                ->get()
                ->map(fn (Asignatura $a) => [
                    'id' => $a->id,
                    'nombre' => $a->nombre,
                    'codigo' => $a->codigo,
                ])->all(),

            'sedes' => Sede::query()
                ->orderBy('nombre')
                ->get()
                ->map(fn (Sede $s) => [
                    'id' => $s->id,
                    'nombre' => $s->nombre,
                    'tipo' => $s->tipo,
                    'vereda' => $s->vereda,
                    'esPrincipal' => $s->tipo === 'principal',
                ])->all(),

            // Viaja COMPLETA, activas e inactivas, con su `activo` al
            // lado. Antes se filtraba acá con `->activas()`, y eso dejaba
            // sin datos a la pantalla de gestión de grados: para poder
            // reactivar una combinación hay que verla primero. Quien arma
            // un selector de "dónde asignar" filtra por `activo` del lado
            // del cliente; quien administra el catálogo, no. Una sola
            // consulta sirve a los dos.
            'ofertaGrados' => OfertaGrado::query()
                ->orderBy('sede_id')->orderBy('grado')->orderBy('grupo')
                ->get()
                ->map(fn (OfertaGrado $o) => [
                    'id' => $o->id,
                    'sedeId' => $o->sede_id,
                    'grado' => $o->grado,
                    'grupo' => $o->grupo,
                    'activo' => $o->activo,
                ])->all(),

            'malla' => MallaCurricular::query()
                ->orderBy('grado')->orderBy('asignatura_id')
                ->get()
                ->map(fn (MallaCurricular $m) => [
                    'grado' => $m->grado,
                    'asignaturaId' => $m->asignatura_id,
                ])->all(),

            'anios' => $this->aniosDisponibles(),

            // Las acciones de la tabla, definidas en la base -- ver
            // 14-acciones-de-tabla.sql.
            'acciones' => $this->accionesDelModulo(),
        ];
    }

    /**
     * El rótulo y el ícono de cada acción del módulo, leídos de
     * `recursos`.
     *
     * QUÉ RESUELVE Y QUÉ NO. Renombrar "Eliminar" a "Borrar" o cambiarle
     * el ícono pasa a ser un `update` en la base, sin desplegar; y quién
     * ve cada acción ya era configuración (`permisos`). Lo que NO viaja
     * acá es el comportamiento: qué hace cada botón y cuándo aplica vive
     * en Angular, y una fila nueva en `recursos` no inventa una acción
     * -- si el código no conoce ese `codigo`, simplemente no aparece. Es
     * la misma línea que separa `modulos` (qué trae la instalación) de
     * `modulos-construidos.ts` (qué pantalla existe de verdad).
     *
     * NO filtra por permiso, y es deliberado: esto es el CATÁLOGO de
     * acciones, no lo que esta persona puede hacer. Quién ve qué lo
     * resuelve `*appHasRole` con el mapa de permisos que ya llegó en el
     * login, sin que este endpoint tenga que repetir esa lógica (y
     * poder desincronizarse de ella).
     *
     * @return array<string, array{etiqueta: string, icono: string|null}>
     */
    private function accionesDelModulo(): array
    {
        return Recurso::query()
            ->where('modulo', 'asignaciones')
            ->where('tipo', 'boton')
            ->orderBy('orden')
            ->orderBy('codigo')
            ->get()
            ->mapWithKeys(fn (Recurso $r) => [
                $r->codigo => [
                    // El respaldo no es decorativo: `etiqueta` es
                    // nullable en el esquema (solo las vistas la tienen
                    // obligatoria por `check`), así que un botón nuevo
                    // sembrado sin rótulo mostraría su código crudo en
                    // pantalla en vez de romperse.
                    'etiqueta' => $r->etiqueta ?? $r->codigo,
                    'icono' => $r->icono,
                ],
            ])
            ->all();
    }

    /**
     * Los años que tienen sentido elegir: los que existen en
     * `periodos_academicos` más los que ya tienen asignaciones cargadas.
     *
     * Los dos conjuntos, no uno: un año viejo puede haber quedado sin
     * períodos vigentes y sus asignaciones seguir ahí (y hay que poder
     * filtrarlas), y el año siguiente puede tener períodos creados antes
     * de que exista una sola asignación (y hay que poder crearlas).
     *
     * `anioSugerido` es el del período activo, que es lo que el
     * formulario propone por defecto -- el año calendario del servidor
     * no sirve: en enero el período activo todavía puede ser del año
     * escolar anterior.
     */
    private function aniosDisponibles(): array
    {
        $dePeriodos = PeriodoAcademico::query()->distinct()->pluck('anio');
        $deAsignaciones = Asignacion::query()->distinct()->pluck('anio');

        $anios = $dePeriodos->merge($deAsignaciones)
            ->map(fn ($anio) => (int) $anio)
            ->unique()
            ->sortDesc()
            ->values()
            ->all();

        $activo = PeriodoAcademico::query()
            ->where('activo', true)
            ->orderByDesc('anio')->orderByDesc('numero')
            ->value('anio');

        return [
            'disponibles' => $anios,
            'anioSugerido' => $activo !== null ? (int) $activo : ($anios[0] ?? null),
        ];
    }

    /**
     * `sede_id` viene resuelta desde el profesor por el Form Request, no
     * del cliente. `creado_por` lo pone este método con el usuario de la
     * sesión -- nunca un campo del body, que sería falsificable.
     */
    public function crear(Usuario $usuario, array $datos): Asignacion
    {
        $asignacion = Asignacion::create([
            'profesor_id' => $datos['profesor_id'],
            'asignatura_id' => $datos['asignatura_id'],
            'sede_id' => $datos['sede_id'],
            'grado' => $datos['grado'],
            'grupo' => $datos['grupo'],
            'anio' => $datos['anio'],
            'creado_por' => $usuario->id,
        ]);

        return $this->conRelaciones($asignacion);
    }

    public function actualizar(Asignacion $asignacion, array $datos): Asignacion
    {
        $asignacion->update([
            'profesor_id' => $datos['profesor_id'],
            'asignatura_id' => $datos['asignatura_id'],
            'sede_id' => $datos['sede_id'],
            'grado' => $datos['grado'],
            'grupo' => $datos['grupo'],
            'anio' => $datos['anio'],
        ]);

        return $this->conRelaciones($asignacion);
    }

    /**
     * Desactivar/reactivar. No borra nada y no toca las notas: las que ya
     * existen siguen contando en `vista_boletin_anual`, que consulta
     * `notas`, no el estado de la asignación.
     */
    public function cambiarEstado(Asignacion $asignacion, bool $activo): Asignacion
    {
        $asignacion->update(['activo' => $activo]);

        return $this->conRelaciones($asignacion);
    }

    /**
     * Borrado definitivo, con las dos redes que el borrado necesita.
     *
     * RED 1 -- notas asociadas. `notas.asignacion_id` no tiene
     * `on delete cascade` a propósito, así que el DELETE fallaría con el
     * error 23503 de Postgres. Se chequea antes para que el error sea uno
     * que se le puede mostrar a una persona. El controlador hace el mismo
     * chequeo para poder responder con un código propio que el frontend
     * traduce en "¿querés desactivarla en su lugar?"; acá se repite igual
     * porque un service no debe depender de que su único llamador de hoy
     * se acuerde de validar -- si mañana lo llama un comando de consola,
     * la regla tiene que seguir en pie.
     *
     * RED 2 -- el borrado que no borra. Con RLS activo, un DELETE sin
     * política aplicable no falla: afecta 0 filas y se ve como éxito. Por
     * eso se mira el número de filas afectadas y no solo la ausencia de
     * excepción. Si esto salta, lo más probable es que
     * `11-asignaciones-modulo.sql` (que crea la política de delete que
     * faltaba) no esté aplicado en esa base.
     */
    public function eliminar(Asignacion $asignacion): void
    {
        if ($asignacion->notas()->exists()) {
            throw new ErrorDeNegocio(
                'Esta asignación ya tiene notas registradas y no se puede eliminar. Se puede desactivar en su lugar.'
            );
        }

        try {
            $eliminadas = Asignacion::query()->whereKey($asignacion->getKey())->delete();
        } catch (QueryException $e) {
            // 23503 = foreign_key_violation. Puede llegar acá si algo
            // apunta a la asignación además de `notas` -- hoy,
            // `excepciones_plazo`.
            if ($e->getCode() === '23503') {
                throw new ErrorDeNegocio(
                    'Esta asignación está referenciada por otros registros del sistema y no se puede eliminar. Se puede desactivar en su lugar.'
                );
            }

            throw $e;
        }

        if ($eliminadas === 0) {
            throw new ErrorDeNegocio(
                'No se pudo eliminar la asignación. Si el problema sigue, avisá a soporte: puede faltar una política de la base de datos.'
            );
        }
    }

    /**
     * Deja la asignación lista para el Resource después de escribirla.
     *
     * `refresh()` PRIMERO, y hace falta de verdad (se vio al probar el
     * POST contra Postgres real): `activo` y `created_at` los pone la
     * base por default, así que después de un `create()` no existen en
     * el modelo en memoria -- la respuesta del alta salía con
     * `"activo": false` y `"createdAt": null` mientras la fila en la
     * tabla estaba perfecta. El frontend, que pinta la fila nueva con lo
     * que devuelve el POST, la habría mostrado como "Inactiva" recién
     * creada.
     *
     * `loadCount` va aparte de `load` porque `withCount` no sobrevive a
     * un `create()`/`update()` -- sin esto, `cantidadNotas` saldría en 0
     * en la respuesta de una edición aunque la asignación tenga notas, y
     * el frontend ofrecería el borrado por error.
     */
    private function conRelaciones(Asignacion $asignacion): Asignacion
    {
        return $asignacion
            ->refresh()
            ->load(['profesor.usuario', 'asignatura', 'sede'])
            ->loadCount('notas');
    }
}
