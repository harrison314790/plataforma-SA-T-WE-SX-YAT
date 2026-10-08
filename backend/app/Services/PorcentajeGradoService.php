<?php

namespace App\Services;

use App\Models\Asignacion;
use App\Models\NudoPedagogico;
use App\Models\PeriodoAcademico;
use App\Models\PesoNudoGrado;
use App\Models\Usuario;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Porcentajes de cada materia dentro de su nudo, por grado de secundaria
 * y año (`pesos_nudo_grado`).
 *
 * Se configura UNA VEZ POR GRADO al iniciar el año: 6-A y 6-B comparten
 * la misma configuración. Primaria (1 a 5) nunca usa porcentajes.
 *
 * La regla que solo vive acá: los porcentajes de un nudo tienen que sumar
 * exactamente 100. La base no la puede imponer (es entre filas) y la
 * vista del boletín, si no suman 100, cae en silencio a promedio simple
 * -- así que si este Service dejara pasar un 85%, el admin creería haber
 * configurado algo que el boletín ignora.
 */
class PorcentajeGradoService
{
    /** Tolerancia para comparar sumas de `numeric(5,2)` que viajan como float. */
    private const TOLERANCIA = 0.01;

    /**
     * Los años elegibles: los de los períodos y los que ya tienen
     * asignaciones. `anioSugerido` es el del período activo -- en enero el
     * año calendario todavía puede no ser el año escolar.
     */
    public function opciones(): array
    {
        $anios = PeriodoAcademico::query()->distinct()->pluck('anio')
            ->merge(Asignacion::query()->distinct()->pluck('anio'))
            ->map(fn ($anio) => (int) $anio)
            ->unique()->sortDesc()->values()->all();

        return [
            'grados' => range(6, 11),
            'anios' => $anios,
            'anioSugerido' => $anios ? PeriodoAcademico::anioEscolarActual() : null,
        ];
    }

    /**
     * Lo que la pantalla muestra para un grado+año: las materias que ese
     * grado tiene asignadas ese año (cualquier grupo, cualquier sede),
     * agrupadas por nudo, con su porcentaje actual.
     */
    public function configuracion(int $grado, int $anio): array
    {
        $materias = $this->materiasAsignadas($grado, $anio);

        $pesos = PesoNudoGrado::query()
            ->where('grado', $grado)->where('anio', $anio)
            ->pluck('peso_porcentual', 'asignatura_id');

        $nudos = NudoPedagogico::query()->orderBy('orden')->orderBy('nombre')->get();

        $porNudo = $nudos
            ->map(function (NudoPedagogico $nudo) use ($materias, $pesos) {
                $suyas = $materias->where('nudoId', $nudo->id)->values();

                if ($suyas->isEmpty()) {
                    return null;
                }

                $conPeso = $suyas->map(fn (array $m) => [
                    ...$m,
                    'peso' => isset($pesos[$m['id']]) ? (float) $pesos[$m['id']] : null,
                ]);

                return [
                    'id' => $nudo->id,
                    'nombre' => $nudo->nombre,
                    'configurable' => $suyas->count() > 1,
                    'estado' => $this->estado($conPeso),
                    'materias' => $conPeso->all(),
                ];
            })
            ->filter()
            ->values()
            ->all();

        return [
            'grado' => $grado,
            'anio' => $anio,
            'nudos' => $porNudo,
            // Asignadas a este grado pero sin nudo: no entran en ningún
            // cálculo del boletín. Se muestran para que no se pierdan.
            'sinNudo' => $materias->whereNull('nudoId')->values()->all(),
        ];
    }

    /**
     * Guarda los porcentajes de los nudos enviados (los demás no se tocan).
     *
     * Un nudo con `pesos` vacío vuelve a promedio simple: se borran sus
     * porcentajes. Todos los errores se juntan y se devuelven a la vez,
     * uno por nudo, para que la pantalla los pinte al lado de cada uno --
     * corregir de a un error por intento sería desesperante con 5 nudos.
     *
     * @param  list<array{nudo_id: int, pesos: list<array{asignatura_id: int, peso: float}>}>  $nudosEnviados
     */
    public function guardar(Usuario $usuario, int $grado, int $anio, array $nudosEnviados): array
    {
        $materias = $this->materiasAsignadas($grado, $anio);
        $nudos = NudoPedagogico::query()->get()->keyBy('id');

        $errores = [];
        $aGuardar = [];
        $aLimpiar = [];

        foreach ($nudosEnviados as $enviado) {
            $nudoId = (int) $enviado['nudo_id'];
            $clave = "nudos.{$nudoId}";
            $nombreNudo = $nudos[$nudoId]->nombre ?? "#{$nudoId}";
            $delNudo = $materias->where('nudoId', $nudoId)->keyBy('id');
            $pesos = collect($enviado['pesos'] ?? []);

            // Las materias del nudo (todas, no solo las asignadas hoy) se
            // limpian siempre: así no queda un porcentaje viejo de una
            // materia que ya no se dicta en este grado sumando por detrás.
            $aLimpiar = [...$aLimpiar, ...$this->idsDelNudo($nudoId)];

            if ($pesos->isEmpty()) {
                continue;
            }

            if ($delNudo->count() < 2) {
                $errores[$clave][] = "El nudo {$nombreNudo} tiene una sola materia en {$grado}° este año: su nota es la de esa materia, no lleva porcentajes.";

                continue;
            }

            $ajenas = $pesos->pluck('asignatura_id')->map(fn ($id) => (int) $id)
                ->reject(fn (int $id) => $delNudo->has($id));

            if ($ajenas->isNotEmpty()) {
                $errores[$clave][] = "Hay materias que no pertenecen al nudo {$nombreNudo} o no están asignadas a {$grado}° en {$anio}. Recarga la pantalla.";

                continue;
            }

            $faltan = $delNudo->keys()->diff($pesos->pluck('asignatura_id')->map(fn ($id) => (int) $id));

            if ($faltan->isNotEmpty()) {
                $nombres = $this->enumerar($faltan->map(fn ($id) => $delNudo[$id]['nombre']));
                $errores[$clave][] = "Falta el porcentaje de {$nombres}. Todas las materias del nudo llevan porcentaje, o ninguna (promedio simple).";

                continue;
            }

            $suma = round($pesos->sum(fn ($p) => (float) $p['peso']), 2);

            if (abs($suma - 100) > self::TOLERANCIA) {
                $nombres = $this->enumerar($delNudo->pluck('nombre'));
                $errores[$clave][] = "Los porcentajes de {$nombres} deben sumar 100%, hoy suman {$this->porcentaje($suma)}.";

                continue;
            }

            foreach ($pesos as $p) {
                $aGuardar[] = [
                    'grado' => $grado,
                    'asignatura_id' => (int) $p['asignatura_id'],
                    'anio' => $anio,
                    'peso_porcentual' => round((float) $p['peso'], 2),
                    'actualizado_por' => $usuario->id,
                    'updated_at' => now(),
                ];
            }
        }

        if ($errores !== []) {
            throw ValidationException::withMessages($errores);
        }

        // Borrar y volver a insertar, en una transacción: un nudo nunca
        // queda a medio configurar (con unas materias del porcentaje nuevo
        // y otras del viejo).
        DB::transaction(function () use ($grado, $anio, $aLimpiar, $aGuardar) {
            PesoNudoGrado::query()
                ->where('grado', $grado)->where('anio', $anio)
                ->whereIn('asignatura_id', array_unique($aLimpiar))
                ->delete();

            if ($aGuardar !== []) {
                PesoNudoGrado::insert($aGuardar);
            }
        });

        return $this->configuracion($grado, $anio);
    }

    /**
     * Las materias que el grado tiene asignadas ese año, sin repetir: si
     * 6-A y 6-B tienen Ética con profesores distintos, Ética aparece una
     * vez (el porcentaje es del grado, no del grupo). Solo asignaciones
     * activas -- una desactivada ya no se dicta.
     *
     * @return Collection<int, array{id: int, nombre: string, codigo: string, nudoId: int|null, profesores: list<string>, grupos: list<string>}>
     */
    private function materiasAsignadas(int $grado, int $anio): Collection
    {
        return Asignacion::query()
            ->with(['asignatura', 'profesor.usuario', 'sede'])
            ->where('grado', $grado)
            ->where('anio', $anio)
            ->where('activo', true)
            ->get()
            ->groupBy('asignatura_id')
            ->map(function (Collection $asignaciones) {
                $asignatura = $asignaciones->first()->asignatura;

                return [
                    'id' => $asignatura->id,
                    'nombre' => $asignatura->nombre,
                    'codigo' => $asignatura->codigo,
                    'nudoId' => $asignatura->nudo_pedagogico_id,
                    'profesores' => $asignaciones
                        ->map(fn (Asignacion $a) => $a->profesor?->usuario
                            ? trim("{$a->profesor->usuario->nombres} {$a->profesor->usuario->apellidos}")
                            : null)
                        ->filter()->unique()->values()->all(),
                    'grupos' => $asignaciones
                        ->map(fn (Asignacion $a) => $a->grupo)
                        ->unique()->sort()->values()->all(),
                ];
            })
            ->sortBy('nombre')
            ->values();
    }

    /** @return list<int> */
    private function idsDelNudo(int $nudoId): array
    {
        return DB::table('asignaturas')->where('nudo_pedagogico_id', $nudoId)->pluck('id')
            ->map(fn ($id) => (int) $id)->all();
    }

    /**
     * Mismo criterio que la vista `vista_boletin_nudo_periodo`:
     * ponderado solo si todas las materias tienen porcentaje y suman 100.
     */
    private function estado(Collection $materias): string
    {
        $conPeso = $materias->whereNotNull('peso');

        if ($conPeso->isEmpty()) {
            return 'promedio-simple';
        }

        $completo = $conPeso->count() === $materias->count()
            && abs($conPeso->sum('peso') - 100) <= self::TOLERANCIA;

        return $completo ? 'ponderado' : 'incompleto';
    }

    /** 'a, b y c' -- sin coma de Oxford, que no se usa en español. */
    private function enumerar(Collection $nombres): string
    {
        $lista = $nombres->values()->all();
        $ultimo = array_pop($lista);

        return $lista === [] ? (string) $ultimo : implode(', ', $lista).' y '.$ultimo;
    }

    /** 85 -> '85%', 33.5 -> '33,5%'. */
    private function porcentaje(float $valor): string
    {
        $texto = rtrim(rtrim(number_format($valor, 2, ',', ''), '0'), ',');

        return "{$texto}%";
    }
}
