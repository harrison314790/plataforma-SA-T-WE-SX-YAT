<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Asignacion;
use App\Models\Estudiante;
use App\Models\Matricula;
use App\Models\NudoPedagogico;
use App\Models\Nota;
use App\Models\OfertaGrado;
use App\Models\PeriodoAcademico;
use App\Models\PesoNudoGrado;
use App\Models\Sede;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * El boletín de un estudiante, agrupado por nudo pedagógico -- el mismo
 * formato del boletín oficial en papel.
 *
 * LA NOTA DEL NUDO NO SE CALCULA ACÁ. La calculan las vistas
 * `vista_boletin_nudo_periodo` y `vista_boletin_nudo_anual`
 * (16-pesos-nudo-por-grado.sql), que son la única fuente de verdad: si
 * este archivo repitiera la fórmula, tarde o temprano las dos versiones
 * dirían cosas distintas. Lo que sí arma este Service es el contexto que
 * las vistas no tienen: qué materias DEBERÍAN tener nota (para marcar un
 * nudo incompleto cuando a un profesor le falta subir la suya), los
 * nombres, y la escala de desempeño.
 *
 * Las vistas tienen `security_invoker`, así que respetan el RLS de quien
 * consulta: un estudiante solo ve lo suyo, admin ve todo.
 */
class BoletinService
{
    private const NOMBRES_GRADO = [
        1 => 'PRIMERO', 2 => 'SEGUNDO', 3 => 'TERCERO', 4 => 'CUARTO', 5 => 'QUINTO',
        6 => 'SEXTO', 7 => 'SÉPTIMO', 8 => 'OCTAVO', 9 => 'NOVENO', 10 => 'DÉCIMO', 11 => 'UNDÉCIMO',
    ];

    /**
     * Escala de la institución, la misma impresa al pie del boletín.
     * Se compara contra la nota YA redondeada a un decimal.
     */
    private const ESCALA = [
        ['desde' => 1.0, 'hasta' => 2.9, 'desempeno' => 'Bajo', 'aprobado' => false],
        ['desde' => 3.0, 'hasta' => 3.9, 'desempeno' => 'Básico', 'aprobado' => true],
        ['desde' => 4.0, 'hasta' => 4.6, 'desempeno' => 'Alto', 'aprobado' => true],
        ['desde' => 4.7, 'hasta' => 5.0, 'desempeno' => 'Superior', 'aprobado' => true],
    ];

    /** Lo que necesita el selector de admin: años, sedes y grados abiertos. */
    public function opciones(): array
    {
        $anios = PeriodoAcademico::query()->distinct()->pluck('anio')
            ->map(fn ($a) => (int) $a)->unique()->sortDesc()->values()->all();

        $activo = PeriodoAcademico::query()->where('activo', true)
            ->orderByDesc('anio')->orderByDesc('numero')->value('anio');

        return [
            'anios' => $anios,
            'anioSugerido' => $activo !== null ? (int) $activo : ($anios[0] ?? null),
            'sedes' => Sede::query()->orderBy('nombre')->get()
                ->map(fn (Sede $s) => ['id' => $s->id, 'nombre' => $s->nombre])->all(),
            'ofertaGrados' => OfertaGrado::query()->where('activo', true)
                ->orderBy('sede_id')->orderBy('grado')->orderBy('grupo')->get()
                ->map(fn (OfertaGrado $o) => ['sedeId' => $o->sede_id, 'grado' => $o->grado, 'grupo' => $o->grupo])
                ->all(),
        ];
    }

    /** Los estudiantes matriculados en un curso ese año, por apellido. */
    public function estudiantes(int $anio, int $sedeId, int $grado, string $grupo): array
    {
        return Matricula::query()
            ->with('estudiante.usuario')
            ->where('sede_id', $sedeId)->where('grado', $grado)->where('grupo', $grupo)
            ->whereHas('periodo', fn ($q) => $q->where('anio', $anio))
            ->get()
            ->unique('estudiante_id')
            ->filter(fn (Matricula $m) => $m->estudiante?->usuario !== null)
            ->map(fn (Matricula $m) => [
                'id' => $m->estudiante_id,
                'nombreCompleto' => mb_strtoupper(trim("{$m->estudiante->usuario->apellidos} {$m->estudiante->usuario->nombres}")),
                'documento' => $m->estudiante->usuario->documento,
            ])
            ->sortBy('nombreCompleto')
            ->values()
            ->all();
    }

    /**
     * Los años en que un estudiante tiene matrícula, del más reciente al
     * más viejo, con el curso y la sede de ese año (la última matrícula
     * del año, la misma que usa `boletin()`): así su selector dice
     * "2024 · 6° A · Sede Principal" y no solo un número. Un estudiante
     * que cambió de sede ve cada año en la sede donde lo cursó.
     */
    public function aniosDe(Estudiante $estudiante): array
    {
        return Matricula::query()
            ->with('sede')
            ->join('periodos_academicos as per', 'per.id', '=', 'matriculas.periodo_id')
            ->where('matriculas.estudiante_id', $estudiante->id)
            ->orderByDesc('per.anio')->orderByDesc('per.numero')
            ->select('matriculas.*', 'per.anio', 'per.activo as periodo_activo')
            ->get()
            ->groupBy('anio')
            ->map(fn (Collection $delAnio) => [
                'anio' => (int) $delAnio->first()->anio,
                'grado' => (int) $delAnio->first()->grado,
                'grupo' => $delAnio->first()->grupo,
                'sede' => $delAnio->first()->sede?->nombre,
                // Hay un período activo ese año: el boletín sigue abierto.
                'enCurso' => $delAnio->contains(fn ($m) => (bool) $m->periodo_activo),
            ])
            ->values()->all();
    }

    public function boletin(Estudiante $estudiante, int $anio): array
    {
        $matricula = Matricula::query()
            ->with('sede')
            ->join('periodos_academicos as per', 'per.id', '=', 'matriculas.periodo_id')
            ->where('matriculas.estudiante_id', $estudiante->id)
            ->where('per.anio', $anio)
            ->orderByDesc('per.numero')
            ->select('matriculas.*')
            ->first();

        if ($matricula === null) {
            throw new ErrorDeNegocio("No hay matrícula de este estudiante en {$anio}, así que no hay boletín que mostrar.");
        }

        $grado = (int) $matricula->grado;

        $periodos = PeriodoAcademico::query()->where('anio', $anio)->orderBy('numero')->get();

        $notas = Nota::query()
            ->join('asignaciones as a', 'a.id', '=', 'notas.asignacion_id')
            ->where('notas.estudiante_id', $estudiante->id)
            ->where('a.anio', $anio)
            ->get(['notas.asignacion_id', 'notas.periodo_id', 'notas.valor', 'a.asignatura_id']);

        // Las materias que el curso tiene ese año: las asignaciones activas
        // de su sede+grado+grupo, más cualquiera (aunque esté desactivada)
        // de la que el estudiante ya tenga nota -- una nota registrada
        // nunca desaparece del boletín.
        $asignaturas = Asignacion::query()
            ->with('asignatura')
            ->where('sede_id', $matricula->sede_id)
            ->where('grado', $grado)
            ->where('grupo', $matricula->grupo)
            ->where('anio', $anio)
            ->where(fn ($q) => $q->where('activo', true)
                ->orWhereIn('id', $notas->pluck('asignacion_id')->unique()->all()))
            ->get()
            ->pluck('asignatura')
            ->filter()
            ->unique('id')
            ->sortBy('nombre')
            ->values();

        $pesos = $grado >= 6
            ? PesoNudoGrado::query()->where('grado', $grado)->where('anio', $anio)
                ->pluck('peso_porcentual', 'asignatura_id')
            : collect();

        $porPeriodo = DB::table('vista_boletin_nudo_periodo')
            ->where('estudiante_id', $estudiante->id)->where('anio', $anio)
            ->get()
            ->groupBy('nudo_pedagogico_id');

        $anual = DB::table('vista_boletin_nudo_anual')
            ->where('estudiante_id', $estudiante->id)->where('anio', $anio)
            ->get()
            ->keyBy('nudo_pedagogico_id');

        $notaDe = fn (int $asignaturaId, int $periodoId) => $notas
            ->first(fn ($n) => (int) $n->asignatura_id === $asignaturaId && (int) $n->periodo_id === $periodoId)
            ?->valor;

        $materiaConNotas = fn ($asignatura) => [
            'id' => $asignatura->id,
            'nombre' => $asignatura->nombre,
            'peso' => isset($pesos[$asignatura->id]) ? (float) $pesos[$asignatura->id] : null,
            'notas' => $periodos->map(function (PeriodoAcademico $p) use ($asignatura, $notaDe) {
                $valor = $notaDe($asignatura->id, $p->id);

                return $valor === null ? null : round((float) $valor, 1);
            })->all(),
        ];

        $nudos = NudoPedagogico::query()->orderBy('orden')->orderBy('nombre')->get()
            ->map(function (NudoPedagogico $nudo) use ($asignaturas, $periodos, $porPeriodo, $anual, $materiaConNotas) {
                $suyas = $asignaturas->where('nudo_pedagogico_id', $nudo->id)->values();

                if ($suyas->isEmpty()) {
                    return null;
                }

                $materias = $suyas->map($materiaConNotas);
                $filas = $porPeriodo->get($nudo->id, collect())->keyBy('periodo_id');
                $total = $anual->get($nudo->id);
                $definitiva = $total !== null && ! $total->es_parcial ? (float) $total->promedio : null;

                return [
                    'id' => $nudo->id,
                    'nombre' => $nudo->nombre,
                    'materias' => $materias->all(),
                    'periodos' => $periodos->values()->map(function (PeriodoAcademico $p, int $i) use ($filas, $materias) {
                        $fila = $filas->get($p->id);
                        $conNota = $materias->filter(fn ($m) => $m['notas'][$i] !== null)->count();

                        return [
                            'nota' => $fila !== null ? (float) $fila->nota_nudo : null,
                            'esPonderado' => $fila !== null && (bool) $fila->es_ponderado,
                            // Hay nota de nudo, pero a alguna materia le
                            // falta la suya: el profesor no la ha subido.
                            'incompleto' => $fila !== null && $conNota < $materias->count(),
                        ];
                    })->all(),
                    'definitiva' => $definitiva,
                    'esParcial' => $total === null || (bool) $total->es_parcial,
                    'desempeno' => $definitiva !== null ? $this->desempeno($definitiva) : null,
                    'aprobado' => $total?->aprobado === null ? null : (bool) $total->aprobado,
                ];
            })
            ->filter()
            ->values();

        return [
            'estudiante' => [
                'id' => $estudiante->id,
                'nombreCompleto' => mb_strtoupper(trim("{$estudiante->usuario?->apellidos} {$estudiante->usuario?->nombres}")),
                'documento' => $estudiante->usuario?->documento,
            ],
            'anio' => $anio,
            'sede' => $matricula->sede?->nombre,
            'grado' => $grado,
            'gradoNombre' => self::NOMBRES_GRADO[$grado] ?? (string) $grado,
            'grupo' => $matricula->grupo,
            'esPrimaria' => $grado <= 5,
            'periodos' => $periodos->map(fn (PeriodoAcademico $p) => [
                'id' => $p->id,
                'numero' => (int) $p->numero,
                'nombre' => $p->nombre,
                'activo' => (bool) $p->activo,
            ])->all(),
            'nudos' => $nudos->all(),
            'promedioGeneral' => $this->promediosGenerales($nudos, $periodos->count()),
            // Materias del curso sin nudo: no entran en ningún nudo ni en
            // el promedio. Se muestran aparte para que no se pierdan.
            'sinNudo' => $asignaturas->whereNull('nudo_pedagogico_id')->values()->map($materiaConNotas)->all(),
            'escala' => self::ESCALA,
        ];
    }

    /**
     * "Promedio general" del boletín impreso: el promedio de las notas de
     * nudo de cada período (un decimal). Null en un período sin notas.
     */
    private function promediosGenerales(Collection $nudos, int $totalPeriodos): array
    {
        return collect(range(0, max($totalPeriodos - 1, 0)))
            ->map(function (int $i) use ($nudos) {
                $notas = $nudos->map(fn ($n) => $n['periodos'][$i]['nota'] ?? null)->filter(fn ($v) => $v !== null);

                return $notas->isEmpty() ? null : round($notas->avg(), 1);
            })
            ->all();
    }

    /** La nota ya viene con un decimal, así que basta con el piso de cada rango. */
    private function desempeno(float $nota): string
    {
        foreach (array_reverse(self::ESCALA) as $rango) {
            if ($nota >= $rango['desde']) {
                return $rango['desempeno'];
            }
        }

        return 'Bajo';
    }
}
