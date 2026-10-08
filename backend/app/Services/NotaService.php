<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Asignacion;
use App\Models\ExcepcionPlazo;
use App\Models\HistorialNota;
use App\Models\Nota;
use App\Models\PeriodoAcademico;
use App\Models\Usuario;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Las notas en sí: lo que ve y guarda el profesor ("Registro de notas"),
 * el detalle de una asignación que abre coordinación, y la corrección.
 *
 * Los chequeos de acá (plazo, nota repetida, estudiante del curso) se
 * adelantan a Postgres para devolver un mensaje que se pueda leer -- la
 * autoridad sigue siendo RLS (`notas_profesor_inserta_dentro_de_plazo`)
 * y la restricción `notas_unicidad_por_periodo`. Ver la decisión sobre
 * capa de Services en references/laravel-postgres.md.
 *
 * Regla de mirror obligatoria: el chequeo de plazo se aplica SOLO al rol
 * `profesor`, igual que la política RLS. Si se le aplicara a admin, este
 * service bloquearía lo que la base sí permite.
 */
class NotaService
{
    public function __construct(private readonly NotaPeriodoService $periodos)
    {
    }

    // ─────────────────────────────────────────────────────────────
    // Profesor: "Registro de notas"
    // ─────────────────────────────────────────────────────────────

    /**
     * Todo lo que la pantalla del profesor necesita para un período, en
     * una respuesta: sus asignaciones del año, los estudiantes de cada
     * una, la nota de cada estudiante en ese período (o ninguna) y su
     * prórroga si la tiene.
     *
     * Las asignaciones se filtran por el profesor de la SESIÓN, no solo
     * por RLS: un admin que abriera esta ruta vería las de todo el
     * colegio mezcladas como si fueran suyas.
     */
    public function registroDelProfesor(Usuario $usuario, ?int $periodoId): array
    {
        $periodo = $this->periodos->resolver($periodoId);
        $profesorId = $usuario->profesor?->id;

        $asignaciones = $profesorId === null ? collect() : Asignacion::query()
            ->with(['asignatura', 'sede'])
            ->where('profesor_id', $profesorId)
            ->where('anio', $periodo->anio)
            ->where('activo', true)
            ->get()
            ->sortBy(fn (Asignacion $a) => [$a->asignatura?->nombre, $a->grado, $a->grupo])
            ->values();

        $notas = $this->notasDe($asignaciones->pluck('id'), $periodo);
        $corregidas = HistorialNota::query()
            ->whereIn('nota_id', $notas->flatten()->pluck('id'))
            ->get(['nota_id', 'corregido_en'])
            ->groupBy('nota_id')
            ->map(fn (Collection $h) => $h->max('corregido_en'));
        $prorrogas = $this->periodos->prorrogasDe($periodo);

        return [
            'ahora' => now()->toIso8601String(),
            'periodos' => $this->periodos->periodosDelAnio($periodo->anio),
            'periodo' => $this->periodos->periodoParaPantalla($periodo),
            'asignaciones' => $asignaciones->map(function (Asignacion $a) use ($notas, $corregidas, $prorrogas) {
                $suyas = $notas->get($a->id, collect())->keyBy('estudiante_id');

                return [
                    'id' => $a->id,
                    'materia' => $a->asignatura?->nombre,
                    'grado' => $a->grado,
                    'grupo' => $a->grupo,
                    'sede' => ['id' => $a->sede_id, 'nombre' => $a->sede?->nombre],
                    'prorroga' => $prorrogas->get($a->id),
                    'estudiantes' => $this->estudiantesDe($a, $suyas)->map(fn ($e) => [
                        ...$e,
                        'nota' => ($n = $suyas->get($e['id'])) ? [
                            'id' => $n->id,
                            'valor' => (float) $n->valor,
                            'registradaEn' => $n->created_at?->toIso8601String(),
                            'corregidaEn' => $corregidas->get($n->id)?->toIso8601String(),
                        ] : null,
                    ])->all(),
                ];
            })->all(),
        ];
    }

    /**
     * Guarda varias notas de una asignación, TODO O NADA: corre dentro de
     * la transacción del request (EstablecerUsuarioActual), así que si la
     * tercera falla las dos primeras no quedan. Para el profesor es
     * importante: el modal le dijo "vas a guardar 5 notas", y guardar 2
     * de 5 sin decirle cuáles sería peor que no guardar ninguna.
     */
    public function registrarLote(Usuario $usuario, array $datos): array
    {
        $asignacion = Asignacion::findOrFail($datos['asignacion_id']);
        $periodo = PeriodoAcademico::findOrFail($datos['periodo_id']);

        if ($periodo->anio !== $asignacion->anio) {
            throw new ErrorDeNegocio('Ese período no es del año de la asignación.');
        }

        if ($usuario->rol->nombre === 'profesor') {
            $this->verificarPlazoParaProfesor($usuario, $asignacion, $periodo);
        }

        $ids = collect($datos['notas'])->pluck('estudiante_id');

        $yaTienen = Nota::query()
            ->where('asignacion_id', $asignacion->id)
            ->where('periodo_id', $periodo->id)
            ->whereIn('estudiante_id', $ids)
            ->count();

        if ($yaTienen > 0) {
            throw new ErrorDeNegocio(
                'Alguna de estas notas ya estaba registrada (quizá desde otro equipo). Recarga la página para ver las guardadas.'
            );
        }

        $activos = $this->estudiantesDe($asignacion, collect())
            ->where('retirado', false)
            ->pluck('id')
            ->flip();

        if ($ids->contains(fn ($id) => ! $activos->has($id))) {
            throw new ErrorDeNegocio('Uno de los estudiantes no está matriculado en este curso (o se retiró).');
        }

        $creadas = collect($datos['notas'])->map(fn (array $n) => Nota::create([
            'estudiante_id' => $n['estudiante_id'],
            'asignacion_id' => $asignacion->id,
            'periodo_id' => $periodo->id,
            'valor' => round((float) $n['valor'], 1),
            'registrado_por' => $usuario->id,
        ])->refresh());

        return $creadas->map(fn (Nota $n) => [
            'estudianteId' => $n->estudiante_id,
            'nota' => [
                'id' => $n->id,
                'valor' => (float) $n->valor,
                'registradaEn' => $n->created_at?->toIso8601String(),
                'corregidaEn' => null,
            ],
        ])->all();
    }

    /**
     * El plazo se evalúa contra el PERÍODO que se califica (una asignación
     * cubre los 4 del año), y la prórroga tiene que ser de ESE período y
     * no estar revocada -- la misma condición que la política RLS.
     */
    private function verificarPlazoParaProfesor(Usuario $usuario, Asignacion $asignacion, PeriodoAcademico $periodo): void
    {
        if (! $periodo->activo) {
            throw new ErrorDeNegocio("El período {$periodo->nombre} no está activo: sus notas ya no se pueden registrar.");
        }

        if ($periodo->estaDentroDePlazo()) {
            return;
        }

        $tieneProrroga = ExcepcionPlazo::query()
            ->where('asignacion_id', $asignacion->id)
            ->where('profesor_id', $usuario->profesor?->id)
            ->where('periodo_id', $periodo->id)
            ->vivas()
            ->get()
            ->contains(fn (ExcepcionPlazo $e) => $e->estaVigente());

        if (! $tieneProrroga) {
            throw new ErrorDeNegocio(
                'La carga de notas está cerrada y no tienes una prórroga vigente para este curso. Comunícate con coordinación.'
            );
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Coordinación: "Ver notas" y "Corregir"
    // ─────────────────────────────────────────────────────────────

    /** Los estudiantes de una asignación con su nota del período, quién la puso y sus correcciones. */
    public function detalleAsignacion(Asignacion $asignacion, ?int $periodoId): array
    {
        $periodo = $this->periodos->resolver($periodoId);

        $notas = Nota::query()
            ->with(['registradoPor', 'historial.corregidoPor'])
            ->where('asignacion_id', $asignacion->id)
            ->where('periodo_id', $periodo->id)
            ->get()
            ->keyBy('estudiante_id');

        return [
            'periodoId' => $periodo->id,
            'estudiantes' => $this->estudiantesDe($asignacion, $notas)
                ->map(fn (array $e) => [...$e, 'nota' => ($n = $notas->get($e['id'])) ? $this->notaDetalle($n) : null])
                ->all(),
        ];
    }

    /**
     * Cambia el valor y nada más. El historial lo escribe el trigger
     * `fn_auditar_correccion_nota`, que lee el motivo de la variable de
     * sesión `app.motivo_correccion` -- `true` = local a esta transacción,
     * igual que `app.usuario_id`. Sin esa variable, Postgres rechaza el
     * UPDATE: no hay forma de corregir sin decir por qué.
     */
    public function corregir(Nota $nota, array $datos): array
    {
        $valor = round((float) $datos['valor'], 1);

        if (abs($valor - (float) $nota->valor) < 0.01) {
            throw new ErrorDeNegocio('El valor nuevo es igual al anterior.');
        }

        DB::statement("select set_config('app.motivo_correccion', ?, true)", [trim($datos['motivo'])]);

        $nota->update(['valor' => $valor]);

        return $this->notaDetalle($nota->refresh()->load(['registradoPor', 'historial.corregidoPor']));
    }

    private function notaDetalle(Nota $n): array
    {
        return [
            'id' => $n->id,
            'valor' => (float) $n->valor,
            'registradaEn' => $n->created_at?->toIso8601String(),
            'registradaPor' => $this->periodos->nombreDe($n->registradoPor),
            'historial' => $n->historial->map(fn (HistorialNota $h) => [
                'antes' => $h->valor_anterior,
                'despues' => $h->valor_nuevo,
                'motivo' => $h->motivo,
                'por' => $this->periodos->nombreDe($h->corregidoPor),
                'en' => $h->corregido_en?->toIso8601String(),
            ])->all(),
        ];
    }

    // ─────────────────────────────────────────────────────────────

    /** @return Collection<string, Collection<int, Nota>> por asignación */
    private function notasDe(Collection $asignacionIds, PeriodoAcademico $periodo): Collection
    {
        return Nota::query()
            ->whereIn('asignacion_id', $asignacionIds)
            ->where('periodo_id', $periodo->id)
            ->get()
            ->groupBy('asignacion_id');
    }

    /**
     * Los estudiantes del curso de una asignación, por apellido. Salen de
     * `fn_estudiantes_de_asignacion` porque el profesor no puede leer
     * `usuarios` (21-notas-modulo.sql): la función le da nombre y
     * documento, y nada más.
     *
     * Un retirado solo aparece si alcanzó a tener nota (en `$conNota`):
     * su nota se sigue mostrando, pero ya no se le pide una nueva.
     */
    private function estudiantesDe(Asignacion $asignacion, Collection $conNota): Collection
    {
        return collect(DB::select('select * from fn_estudiantes_de_asignacion(?)', [$asignacion->id]))
            ->filter(fn ($e) => $e->estado_matricula === 'activa' || $conNota->has($e->estudiante_id))
            ->unique('estudiante_id')
            ->sortBy(fn ($e) => Str::ascii(mb_strtolower("{$e->apellidos} {$e->nombres}")))
            ->map(fn ($e) => [
                'id' => $e->estudiante_id,
                'nombres' => $e->nombres,
                'apellidos' => $e->apellidos,
                'documento' => $e->documento,
                'retirado' => $e->estado_matricula !== 'activa',
            ])
            ->values();
    }
}
