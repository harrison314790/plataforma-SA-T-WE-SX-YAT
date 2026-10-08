<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Asignacion;
use App\Models\ExcepcionPlazo;
use App\Models\Matricula;
use App\Models\Nota;
use App\Models\PeriodoAcademico;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * El lado de COORDINACIÓN del módulo de notas: el calendario de épocas,
 * el plazo de carga de la época activa, las prórrogas individuales y el
 * avance de todas las asignaciones ("Seguimiento de notas").
 *
 * LA ÉPOCA ACTIVA SALE DE LAS FECHAS (22-epocas-por-fecha.sql):
 * coordinación escribe el calendario una vez al año y la época cambia
 * sola. No hay "iniciar el siguiente período".
 *
 * EL RELOJ ES EL DEL SERVIDOR. Cada respuesta lleva `ahora`, y Angular
 * calcula cuentas regresivas y "por vencer" contra ese instante, no
 * contra `Date.now()`: los equipos de las escuelas son compartidos y
 * varios tienen la hora mal puesta, y quien decide si una nota entra es
 * el `now()` de Postgres en la política RLS. Mismo criterio que
 * PeriodoActivoResource.
 *
 * Todo corre dentro de la transacción de EstablecerUsuarioActual: guardar
 * el calendario (4 updates) es atómico sin un DB::transaction propio.
 */
class NotaPeriodoService
{
    // ─────────────────────────────────────────────────────────────
    // Períodos: cómo los ve la pantalla
    // ─────────────────────────────────────────────────────────────

    /**
     * El período pedido, o el activo si no se pide ninguno. En receso (hoy
     * no cae en ninguna época) cae a la última que ya empezó -- la que
     * acaba de cerrar --, y si el año ni ha empezado, a la primera que
     * viene: la pantalla tiene que poder consultar aunque no haya carga.
     */
    public function resolver(?int $periodoId): PeriodoAcademico
    {
        if ($periodoId !== null) {
            return PeriodoAcademico::findOrFail($periodoId);
        }

        $hoy = PeriodoAcademico::hoy();

        return PeriodoAcademico::actual()
            ?? PeriodoAcademico::query()->whereDate('fecha_inicio', '<=', $hoy)->orderByDesc('fecha_inicio')->first()
            ?? PeriodoAcademico::query()->orderBy('fecha_inicio')->firstOrFail();
    }

    /** Las cuatro épocas del año: el selector del profesor y el calendario de coordinación. */
    public function periodosDelAnio(int $anio): array
    {
        return PeriodoAcademico::query()
            ->where('anio', $anio)
            ->orderBy('numero')
            ->get()
            ->map(fn (PeriodoAcademico $p) => $this->periodoParaPantalla($p))
            ->all();
    }

    public function periodoParaPantalla(PeriodoAcademico $p): array
    {
        return [
            'id' => $p->id,
            'nombre' => $p->nombre,
            'anio' => $p->anio,
            'numero' => $p->numero,
            'epoca' => $p->epoca(),
            'epocaNasa' => $p->epocaNasa(),
            'fechaInicio' => $p->inicio(),
            'fechaFin' => $p->fin(),
            'estado' => $this->estadoDe($p),
            'notasHabilitadas' => $p->notas_habilitadas,
            'fechaLimiteNotas' => $p->fecha_limite_notas?->toIso8601String(),
            // La misma respuesta que daría la política RLS de inserción
            // para un profesor SIN prórroga.
            'cargaAbierta' => $p->estaDentroDePlazo(),
        ];
    }

    /** 'cerrado' (ya terminó, solo consulta), 'activo' (hoy cae adentro) o 'futuro' (aún no empieza). */
    private function estadoDe(PeriodoAcademico $p): string
    {
        $hoy = PeriodoAcademico::hoy();

        return match (true) {
            $p->fin() < $hoy => 'cerrado',
            $p->inicio() > $hoy => 'futuro',
            default => 'activo',
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Seguimiento: el avance de todas las asignaciones
    // ─────────────────────────────────────────────────────────────

    /**
     * Una fila por asignación activa del año del período, con cuántos
     * estudiantes tiene, cuántos ya tienen nota en ESTE período, cuándo
     * fue la última carga y si tiene prórroga.
     *
     * Cuatro consultas en total, sin importar cuántas asignaciones haya:
     * asignaciones, matrículas del año, notas del período y prórrogas. El
     * cruce se hace en memoria; con unos cientos de estudiantes son pocos
     * kilobytes, y los filtros y el orden se recalculan en el cliente sin
     * un round-trip por clic (mismo criterio que Usuarios y Matrículas).
     */
    public function seguimiento(?int $periodoId): array
    {
        $periodo = $this->resolver($periodoId);

        $asignaciones = Asignacion::query()
            ->with(['profesor.usuario', 'asignatura', 'sede'])
            ->where('anio', $periodo->anio)
            ->where('activo', true)
            ->get();

        $notas = Nota::query()
            ->where('periodo_id', $periodo->id)
            ->whereIn('asignacion_id', $asignaciones->pluck('id'))
            ->get(['asignacion_id', 'estudiante_id', 'created_at'])
            ->groupBy('asignacion_id');

        $matriculas = Matricula::query()
            ->where('anio', $periodo->anio)
            ->get(['estudiante_id', 'sede_id', 'grado', 'grupo', 'estado'])
            ->groupBy(fn (Matricula $m) => "{$m->sede_id}|{$m->grado}|{$m->grupo}");

        $prorrogas = $this->prorrogasDe($periodo);

        $filas = $asignaciones->map(function (Asignacion $a) use ($notas, $matriculas, $prorrogas) {
            $delCurso = $matriculas->get("{$a->sede_id}|{$a->grado}|{$a->grupo}", collect());
            $suyas = $notas->get($a->id, collect());
            $conNota = $suyas->pluck('estudiante_id')->flip();

            // Los retirados cuentan solo si alcanzaron a tener nota en
            // este período: a quien ya no está no se le pueden pedir.
            $total = $delCurso
                ->filter(fn (Matricula $m) => $m->estado === 'activa' || $conNota->has($m->estudiante_id))
                ->count();

            return [
                'id' => $a->id,
                'profesor' => [
                    'id' => $a->profesor_id,
                    'nombre' => $this->nombreDe($a->profesor?->usuario),
                ],
                'materia' => $a->asignatura?->nombre,
                'grado' => $a->grado,
                'grupo' => $a->grupo,
                'sede' => ['id' => $a->sede_id, 'nombre' => $a->sede?->nombre],
                'total' => $total,
                'conNota' => $conNota->count(),
                'ultimaCarga' => $suyas->max('created_at')?->toIso8601String(),
                'prorroga' => $prorrogas->get($a->id),
            ];
        })->values()->all();

        return [
            'ahora' => now()->toIso8601String(),
            // La fecha de hoy EN EL COLEGIO: la que decide qué época está
            // activa. Angular la usa para "Día 23 de 82" en el calendario.
            'hoy' => PeriodoAcademico::hoy(),
            'periodos' => $this->periodosDelAnio($periodo->anio),
            'periodo' => $this->periodoParaPantalla($periodo),
            'hayEpocaActiva' => PeriodoAcademico::actual() !== null,
            'asignaciones' => $filas,
        ];
    }

    /**
     * Las prórrogas vivas (no revocadas) del período, por asignación. Por
     * `fn_prorrogas_del_periodo` y no por Eloquent: el profesor no puede
     * leer el nombre de quien autorizó (RLS de `usuarios`), y la función
     * devuelve solo ese dato. Para admin da lo mismo, y así hay un solo
     * camino.
     *
     * @return Collection<string, array>
     */
    public function prorrogasDe(PeriodoAcademico $periodo): Collection
    {
        return collect(DB::select('select * from fn_prorrogas_del_periodo(?)', [$periodo->id]))
            ->mapWithKeys(fn ($p) => [$p->asignacion_id => [
                'id' => $p->id,
                'hasta' => Carbon::parse($p->fecha_limite_extendida)->toIso8601String(),
                'motivo' => $p->motivo,
                'autorizadoPor' => $p->autorizado_por_nombre,
                'autorizadaEn' => Carbon::parse($p->autorizada_en)->toIso8601String(),
            ]]);
    }

    // ─────────────────────────────────────────────────────────────
    // Control del plazo
    // ─────────────────────────────────────────────────────────────

    /**
     * Abrir/cerrar la carga y mover la fecha límite. Solo sobre el período
     * activo: abrir la carga de uno cerrado sería reabrir la puerta a
     * notas que ya se dieron por terminadas, y para eso están las
     * correcciones.
     *
     * Una fecha pasada SÍ se acepta (la pantalla avisa que deja la carga
     * cerrada): es la forma legítima de cerrar ya mismo sin apagar el
     * interruptor.
     */
    public function cambiarPlazo(PeriodoAcademico $periodo, array $datos): array
    {
        if (! $periodo->activo) {
            throw new ErrorDeNegocio("La época {$periodo->nombre} no está activa hoy: su plazo solo se cambia mientras está en curso.");
        }

        if (array_key_exists('notas_habilitadas', $datos)) {
            $periodo->notas_habilitadas = (bool) $datos['notas_habilitadas'];
        }

        if (array_key_exists('fecha_limite_notas', $datos)) {
            $periodo->fecha_limite_notas = $this->instante($datos['fecha_limite_notas']);
        }

        $periodo->save();

        return $this->periodoParaPantalla($periodo->refresh());
    }

    // ─────────────────────────────────────────────────────────────
    // Calendario de épocas
    // ─────────────────────────────────────────────────────────────

    /**
     * Guarda las fechas de inicio y cierre de las épocas de un año.
     *
     * Se valida acá con un mensaje por época (lo que la ventana pinta al
     * lado de cada fila) y la base lo vuelve a garantizar: cierre después
     * del inicio, fechas dentro del año y sin cruces (`periodos_sin_cruces`,
     * verificada al COMMIT).
     *
     * Acá además se exige el ORDEN: la Segunda empieza después de que
     * cierra la Primera, y así. La base no lo expresa con una restricción
     * simple, y una Tercera antes que la Segunda dejaría el boletín con
     * las épocas en un orden que no pasó.
     *
     * Cambiar las fechas puede cambiar la época activa (o dejar al colegio
     * en receso): es lo que se quiere, y la ventana lo avisa antes. No
     * borra notas ni toca el plazo de carga, que se maneja aparte.
     *
     * @param  array{anio: int, epocas: array<int, array{periodo_id: int, fecha_inicio: string, fecha_fin: string}>}  $datos
     */
    public function guardarCalendario(array $datos): array
    {
        $anio = (int) $datos['anio'];
        $periodos = PeriodoAcademico::query()->where('anio', $anio)->orderBy('numero')->get();
        $fechas = collect($datos['epocas'])->keyBy(fn ($e) => (int) $e['periodo_id']);
        // Los errores van por la POSICIÓN en la lista enviada
        // (`epocas.1`), igual que los del Form Request: la ventana los
        // pinta en la fila que corresponde sin traducir ids.
        $posicion = collect($datos['epocas'])->mapWithKeys(fn ($e, $i) => [(int) $e['periodo_id'] => $i]);

        $esperados = $periodos->pluck('id')->sort()->values()->all();
        $recibidos = $fechas->keys()->sort()->values()->all();

        if ($periodos->isEmpty() || $esperados !== $recibidos) {
            throw new ErrorDeNegocio("Hay que enviar las fechas de todas las épocas de {$anio}, y solo de ese año.");
        }

        $errores = [];
        $cierreAnterior = null;
        $nombreAnterior = null;

        foreach ($periodos as $p) {
            $f = $fechas->get($p->id);
            $ini = $f['fecha_inicio'];
            $fin = $f['fecha_fin'];
            $clave = "epocas.{$posicion[$p->id]}";

            if ($fin < $ini) {
                $errores[$clave] = ['El cierre debe ser después del inicio.'];
            } elseif (! str_starts_with($ini, "{$anio}-") || ! str_starts_with($fin, "{$anio}-")) {
                $errores[$clave] = ["Las fechas deben estar dentro del año escolar {$anio}."];
            } elseif ($cierreAnterior !== null && $ini <= $cierreAnterior) {
                $errores[$clave] = ["Debe empezar después del cierre de la {$nombreAnterior} Época."];
            }

            $cierreAnterior = $fin;
            $nombreAnterior = $p->epoca();
        }

        if ($errores) {
            throw ValidationException::withMessages($errores);
        }

        foreach ($periodos as $p) {
            $f = $fechas->get($p->id);
            $p->update(['fecha_inicio' => $f['fecha_inicio'], 'fecha_fin' => $f['fecha_fin']]);
        }

        $activa = PeriodoAcademico::actual();

        return [
            'periodos' => $this->periodosDelAnio($anio),
            'activa' => $activa ? $this->periodoParaPantalla($activa) : null,
        ];
    }

    // ─────────────────────────────────────────────────────────────
    // Prórrogas
    // ─────────────────────────────────────────────────────────────

    /**
     * Dar una prórroga, o modificar la que ya tiene esa asignación en el
     * período activo (hay una sola viva por asignación y período:
     * índice `excepciones_una_viva_por_asignacion`).
     *
     * `profesor_id` sale de la asignación, nunca del cliente: la política
     * RLS de inserción de notas compara contra el profesor de la sesión,
     * y una prórroga con otro profesor no le serviría a nadie.
     */
    public function guardarProrroga(array $datos, string $usuarioId): array
    {
        $periodo = PeriodoAcademico::actual()
            ?? throw new ErrorDeNegocio('Hoy no hay ninguna época activa (receso): no hay plazo que prorrogar.');

        $asignacion = Asignacion::findOrFail($datos['asignacion_id']);

        if ($asignacion->anio !== $periodo->anio || ! $asignacion->activo) {
            throw new ErrorDeNegocio('Esa asignación no está vigente en el período activo.');
        }

        $hasta = $this->instante($datos['fecha_limite']);

        // Una prórroga que vence antes del cierre general no le da nada
        // al profesor: mientras la carga general esté abierta, ya puede
        // subir hasta esa fecha.
        if ($periodo->estaDentroDePlazo() && $hasta->lessThanOrEqualTo($periodo->fecha_limite_notas)) {
            throw new ErrorDeNegocio(
                'La prórroga tiene que ir más allá del cierre general ('.$this->fechaLegible($periodo->fecha_limite_notas).').'
            );
        }

        $existente = ExcepcionPlazo::query()
            ->where('asignacion_id', $asignacion->id)
            ->where('periodo_id', $periodo->id)
            ->vivas()
            ->first();

        if ($existente) {
            $existente->update([
                'fecha_limite_extendida' => $hasta,
                'motivo' => $datos['motivo'],
                'autorizado_por' => $usuarioId,
                'actualizada_en' => now(),
            ]);
        } else {
            ExcepcionPlazo::create([
                'profesor_id' => $asignacion->profesor_id,
                'asignacion_id' => $asignacion->id,
                'periodo_id' => $periodo->id,
                'fecha_limite_extendida' => $hasta,
                'autorizado_por' => $usuarioId,
                'motivo' => $datos['motivo'],
            ]);
        }

        return $this->prorrogasDe($periodo)->get($asignacion->id);
    }

    /** "Quitar": queda revocada, no borrada -- el rastro de que existió se conserva. */
    public function quitarProrroga(ExcepcionPlazo $prorroga, string $usuarioId): void
    {
        if ($prorroga->revocada_en !== null) {
            throw new ErrorDeNegocio('Esa prórroga ya se había quitado.');
        }

        $prorroga->update(['revocada_en' => now(), 'revocada_por' => $usuarioId]);
    }

    // ─────────────────────────────────────────────────────────────

    public function nombreDe(?\App\Models\Usuario $u): string
    {
        return $u ? trim("{$u->nombres} {$u->apellidos}") : '—';
    }

    /**
     * Angular manda la hora local de quien eligió la fecha, con su offset
     * ("2026-10-20T23:00:00-05:00"). Hay que pasarla a UTC ANTES de
     * guardarla: Eloquent formatea el datetime sin zona ("Y-m-d H:i:s"),
     * así que sin esto Postgres recibía "23:00" y lo leía como 23:00 UTC
     * -- cinco horas antes de lo que la coordinadora eligió.
     */
    private function instante(string $fecha): Carbon
    {
        return Carbon::parse($fecha)->utc();
    }

    /** Para los mensajes de error, que se leen tal cual en la pantalla. */
    private function fechaLegible(CarbonInterface $fecha): string
    {
        return $fecha->copy()->setTimezone('America/Bogota')->format('d/m/Y g:i a');
    }
}
