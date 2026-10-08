<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Asignacion;
use App\Models\Asignatura;
use App\Models\MallaCurricular;
use App\Models\NudoPedagogico;
use App\Models\PeriodoAcademico;
use App\Models\PesoNudoGrado;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * Catálogo de nudos pedagógicos y a qué nudo pertenece cada materia.
 *
 * El nudo es una capa ENCIMA de las asignaciones: nada de lo que pasa
 * acá cambia quién dicta qué ni cómo sube sus notas el profesor. Solo
 * cambia cómo se agrupan esas notas en el boletín.
 */
class NudoPedagogicoService
{
    /**
     * Todo lo que necesita la pantalla en una sola respuesta: los nudos en
     * el orden del boletín y TODAS las materias con su nudo (o null). Con
     * una decena de nudos y unas veinte materias son pocos kilobytes, y
     * la pantalla agrupa sin volver a preguntar.
     */
    public function catalogo(): array
    {
        $anio = $this->anioDeTrabajo();

        // Contexto de cada materia en el año de trabajo: quién la dicta y en
        // qué cursos. Una sola consulta para todas -- con ~20 materias y
        // unas decenas de asignaciones no vale la pena paginar ni agregar
        // en SQL.
        $asignaciones = Asignacion::query()
            ->with(['profesor.usuario', 'sede'])
            ->where('anio', $anio)
            ->where('activo', true)
            ->get()
            ->groupBy('asignatura_id');

        $malla = MallaCurricular::query()->orderBy('grado')->get()->groupBy('asignatura_id');

        // Todas las asignaciones de cada materia, de cualquier año y activas
        // o no: con una sola, la materia ya no se puede eliminar (la FK de
        // `asignaciones` y las notas que cuelgan de ella).
        $asignacionesTotales = Asignacion::query()
            ->selectRaw('asignatura_id, count(*) as total')
            ->groupBy('asignatura_id')
            ->pluck('total', 'asignatura_id');

        // Grados+años con porcentaje cargado para cada materia: el formulario
        // de edición avisa cuáles vuelven a promedio simple si se cambia de nudo.
        $porcentajesDeMateria = PesoNudoGrado::query()
            ->orderByDesc('anio')->orderBy('grado')
            ->get(['asignatura_id', 'grado', 'anio'])
            ->groupBy('asignatura_id');

        // Qué grados ya tienen porcentajes cargados este año, por nudo.
        $pesos = PesoNudoGrado::query()
            ->join('asignaturas', 'asignaturas.id', '=', 'pesos_nudo_grado.asignatura_id')
            ->where('pesos_nudo_grado.anio', $anio)
            ->whereNotNull('asignaturas.nudo_pedagogico_id')
            ->distinct()
            ->get(['asignaturas.nudo_pedagogico_id', 'pesos_nudo_grado.grado'])
            ->groupBy('nudo_pedagogico_id');

        $asignaturas = Asignatura::query()
            ->orderBy('nombre')
            ->get()
            ->map(function (Asignatura $a) use ($asignaciones, $malla, $asignacionesTotales, $porcentajesDeMateria) {
                $suyas = $asignaciones->get($a->id, collect());

                return [
                    'id' => $a->id,
                    'nombre' => $a->nombre,
                    'codigo' => $a->codigo,
                    'nudoId' => $a->nudo_pedagogico_id,
                    // Grados donde la malla curricular la incluye.
                    'gradosMalla' => $malla->get($a->id, collect())->pluck('grado')
                        ->map(fn ($g) => (int) $g)->unique()->values()->all(),
                    // Cursos donde se dicta ESTE año ('6-A', '9-B'...).
                    'cursos' => $suyas
                        ->map(fn (Asignacion $x) => "{$x->grado}-{$x->grupo}")
                        ->unique()->sort(SORT_NATURAL)->values()->all(),
                    'profesores' => $suyas
                        ->map(fn (Asignacion $x) => $x->profesor?->usuario
                            ? trim("{$x->profesor->usuario->nombres} {$x->profesor->usuario->apellidos}")
                            : null)
                        ->filter()->unique()->sort()->values()->all(),
                    'asignaciones' => $suyas->count(),
                    'asignacionesTotales' => (int) ($asignacionesTotales[$a->id] ?? 0),
                    'porcentajes' => $porcentajesDeMateria->get($a->id, collect())
                        ->map(fn (PesoNudoGrado $p) => ['grado' => (int) $p->grado, 'anio' => (int) $p->anio])
                        ->values()->all(),
                ];
            });

        return [
            'anio' => $anio,
            'nudos' => NudoPedagogico::query()
                ->withCount('asignaturas')
                ->orderBy('orden')->orderBy('nombre')
                ->get()
                ->map(function (NudoPedagogico $n) use ($asignaturas, $pesos) {
                    $materias = $asignaturas->where('nudoId', $n->id);

                    return [
                        ...$this->formatear($n),
                        'asignaciones' => $materias->sum('asignaciones'),
                        'profesores' => $materias->pluck('profesores')->flatten()->unique()->count(),
                        'gradosConPorcentaje' => $pesos->get($n->id, collect())->pluck('grado')
                            ->map(fn ($g) => (int) $g)->unique()->sort()->values()->all(),
                    ];
                })
                ->all(),
            'asignaturas' => $asignaturas->values()->all(),
        ];
    }

    /** El año escolar en curso (por fecha): es el que la pantalla describe. */
    private function anioDeTrabajo(): int
    {
        return PeriodoAcademico::anioEscolarActual();
    }

    public function crear(array $datos): array
    {
        return $this->formatear(NudoPedagogico::create($datos)->loadCount('asignaturas'));
    }

    public function actualizar(NudoPedagogico $nudo, array $datos): array
    {
        $nudo->update($datos);

        return $this->formatear($nudo->loadCount('asignaturas'));
    }

    /**
     * Solo se borra un nudo vacío. Con materias adentro, borrarlo las
     * dejaría sin nudo y desaparecerían del boletín en silencio -- primero
     * hay que moverlas a otro.
     */
    public function eliminar(NudoPedagogico $nudo): void
    {
        $materias = $nudo->asignaturas()->count();

        if ($materias > 0) {
            throw new ErrorDeNegocio(
                "Este nudo tiene {$materias} ".($materias === 1 ? 'materia' : 'materias')
                .'. Muévelas a otro nudo antes de eliminarlo, o desaparecerían del boletín.'
            );
        }

        try {
            $eliminadas = NudoPedagogico::query()->whereKey($nudo->getKey())->delete();
        } catch (QueryException $e) {
            if ($e->getCode() === '23503') {
                throw new ErrorDeNegocio('Este nudo está en uso y no se puede eliminar.');
            }

            throw $e;
        }

        // Un DELETE que RLS no deja pasar no falla: borra 0 filas. Mismo
        // chequeo que AsignacionService::eliminar().
        if ($eliminadas === 0) {
            throw new ErrorDeNegocio('No se pudo eliminar el nudo. Si el problema sigue, avisa a soporte.');
        }
    }

    /**
     * Mueve una materia a otro nudo (o la deja sin nudo).
     *
     * Devuelve los grados+años que tenían porcentaje configurado para esa
     * materia: al cambiarla de nudo, los porcentajes del nudo viejo y del
     * nuevo dejan de sumar 100, y esos nudos vuelven a promedio simple
     * hasta que alguien los reconfigure. No se borra nada solo -- se
     * avisa, para que la pantalla diga exactamente qué grados revisar.
     *
     * @return array{asignatura: array, porcentajesAfectados: list<array{grado: int, anio: int}>}
     */
    public function asignarNudo(Asignatura $asignatura, ?int $nudoId): array
    {
        $cambia = $asignatura->nudo_pedagogico_id !== $nudoId;

        $asignatura->update(['nudo_pedagogico_id' => $nudoId]);

        $afectados = $cambia
            ? PesoNudoGrado::query()
                ->where('asignatura_id', $asignatura->id)
                ->orderByDesc('anio')->orderBy('grado')
                ->get(['grado', 'anio'])
                ->map(fn (PesoNudoGrado $p) => ['grado' => $p->grado, 'anio' => $p->anio])
                ->all()
            : [];

        return [
            'asignatura' => $this->formatearMateria($asignatura),
            'porcentajesAfectados' => $afectados,
        ];
    }

    // ── Materias ─────────────────────────────────────────────────────

    /**
     * Materia nueva del catálogo. Queda sin malla curricular: para
     * asignarla a un curso, primero hay que incluirla en la malla del grado
     * (la pantalla de malla todavía no existe; hoy es por SQL).
     */
    public function crearMateria(array $datos): array
    {
        $materia = Asignatura::create([
            'nombre' => $datos['nombre'],
            'codigo' => $datos['codigo'],
            'nudo_pedagogico_id' => $datos['nudo_pedagogico_id'] ?? null,
        ]);

        return $this->formatearMateria($materia);
    }

    /**
     * Cambia el nombre y, si viene distinto, el nudo. El código no se toca
     * (ver MateriaRequest). El cambio de nudo pasa por `asignarNudo()` para
     * devolver los mismos `porcentajesAfectados` que el select de la tabla.
     */
    public function actualizarMateria(Asignatura $materia, array $datos): array
    {
        return DB::transaction(function () use ($materia, $datos) {
            $materia->update(['nombre' => $datos['nombre']]);

            return $this->asignarNudo($materia, $datos['nudo_pedagogico_id'] ?? null);
        });
    }

    /**
     * Solo se borra una materia que nunca se asignó. Con asignaciones (de
     * cualquier año) tiene notas o pudo tenerlas: borrarla rompería
     * boletines ya entregados. Su malla y sus porcentajes, que no son
     * historia de nadie, se van con ella.
     */
    public function eliminarMateria(Asignatura $materia): void
    {
        $asignaciones = $materia->asignaciones()->get(['grado', 'grupo', 'anio']);

        if ($asignaciones->isNotEmpty()) {
            $cursos = $asignaciones->map(fn ($a) => "{$a->anio}-{$a->grado}-{$a->grupo}")->unique()->count();

            throw new ErrorDeNegocio(
                "{$materia->nombre} se dicta en {$cursos} ".($cursos === 1 ? 'curso' : 'cursos')
                .'. Quita sus asignaciones antes de eliminarla.'
            );
        }

        DB::transaction(function () use ($materia) {
            MallaCurricular::query()->where('asignatura_id', $materia->id)->delete();
            PesoNudoGrado::query()->where('asignatura_id', $materia->id)->delete();

            try {
                $eliminadas = Asignatura::query()->whereKey($materia->getKey())->delete();
            } catch (QueryException $e) {
                if ($e->getCode() === '23503') {
                    throw new ErrorDeNegocio('Esta materia está en uso y no se puede eliminar.');
                }

                throw $e;
            }

            // Un DELETE que RLS no deja pasar no falla: borra 0 filas.
            if ($eliminadas === 0) {
                throw new ErrorDeNegocio('No se pudo eliminar la materia. Si el problema sigue, avisa a soporte.');
            }
        });
    }

    private function formatearMateria(Asignatura $materia): array
    {
        return [
            'id' => $materia->id,
            'nombre' => $materia->nombre,
            'codigo' => $materia->codigo,
            'nudoId' => $materia->nudo_pedagogico_id,
        ];
    }

    private function formatear(NudoPedagogico $nudo): array
    {
        return [
            'id' => $nudo->id,
            'nombre' => $nudo->nombre,
            'orden' => $nudo->orden,
            'totalAsignaturas' => (int) ($nudo->asignaturas_count ?? 0),
        ];
    }
}
