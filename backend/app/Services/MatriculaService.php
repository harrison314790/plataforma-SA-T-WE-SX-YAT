<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Acudiente;
use App\Models\Estudiante;
use App\Models\Matricula;
use App\Models\OfertaGrado;
use App\Models\PeriodoAcademico;
use App\Models\Recurso;
use App\Models\Sede;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Lógica del módulo de Matrículas: ubicar a cada estudiante en una sede,
 * grado y grupo para un año escolar (una matrícula por año, ver
 * 20-matriculas-por-anio.sql).
 *
 * LA SUGERENCIA DE GRADO NO SE CALCULA ACÁ. Es una ayuda de pantalla
 * ("aprobó 8°, se sugiere 9°") y la arma Angular con lo que devuelve
 * `listar()`: la matrícula del año anterior y su resultado. Lo que sí se
 * hace acá es lo que NO puede quedar en manos del frontend: que no se
 * matricule dos veces en el mismo año, que no se matricule a un graduado,
 * que el grupo exista y esté abierto, que el acudiente sea de ese
 * estudiante. Como en los otros services, adelantarse a Postgres sirve
 * para explicar el error -- las restricciones de 20 siguen siendo la
 * garantía.
 *
 * Todo corre dentro de la transacción de EstablecerUsuarioActual: si una
 * matrícula de un lote falla, no queda ninguna a medias.
 */
class MatriculaService
{
    /** En minúscula, como ya están en `estudiante_acudientes` (03). */
    public const PARENTESCOS = ['madre', 'padre'];

    /**
     * Los catálogos de la pantalla. `anioSugerido` es el año del período
     * activo; la lista agrega el SIGUIENTE, porque en enero se matricula
     * para un año cuyos períodos todavía no existen.
     */
    public function opciones(): array
    {
        $anioActual = $this->anioActual();

        $anios = PeriodoAcademico::query()->distinct()->pluck('anio')
            ->merge(Matricula::query()->distinct()->pluck('anio'))
            ->push($anioActual, $anioActual + 1)
            ->map(fn ($a) => (int) $a)->unique()->sortDesc()->values()->all();

        return [
            'anios' => $anios,
            'anioSugerido' => $anioActual,
            'hoy' => now()->toDateString(),
            'sedes' => Sede::query()
                ->orderByRaw("tipo <> 'principal'")
                ->orderBy('nombre')
                ->get()
                ->map(fn (Sede $s) => [
                    'id' => $s->id,
                    'nombre' => $s->nombre,
                    'esPrincipal' => $s->tipo === 'principal',
                ])->all(),
            // Solo los grupos abiertos: matricular en uno cerrado lo
            // rechaza `validarGrupo()` de todas formas.
            'ofertaGrados' => OfertaGrado::query()->where('activo', true)
                ->orderBy('sede_id')->orderBy('grado')->orderBy('grupo')->get()
                ->map(fn (OfertaGrado $o) => ['sedeId' => $o->sede_id, 'grado' => $o->grado, 'grupo' => $o->grupo])
                ->all(),
            'motivosRetiro' => Matricula::MOTIVOS_RETIRO,
            'acciones' => Recurso::accionesDe('matriculas'),
        ];
    }

    /**
     * Todo lo que la pantalla necesita para un año, en una respuesta:
     *
     * · `estudiantes`: todas las cuentas de estudiante activas, con sus
     *   acudientes. Es el universo del buscador del formulario (se puede
     *   matricular a alguien nuevo, sin matrícula anterior).
     * · `matriculas`: las del año y las del anterior. Con las dos, Angular
     *   arma "Por matricular" (estaba el año pasado y este no) y
     *   "Matriculados".
     * · `resultados`: cómo terminó cada estudiante el año anterior.
     *
     * Sin paginar, por lo mismo que Usuarios: unos cientos de estudiantes
     * son unos kilobytes, y los filtros y conteos se recalculan en el
     * cliente sin un round-trip por tecla.
     */
    public function listar(int $anio): array
    {
        $estudiantes = Estudiante::query()
            ->with(['usuario', 'acudientes'])
            ->where('activo', true)
            ->whereHas('usuario', fn ($q) => $q->where('activo', true))
            ->get()
            // Sin tildes para ordenar: con la "é" tal cual, "Pérez" quedaría
            // después de "Pito" (se compara por código, no alfabéticamente).
            ->sortBy(fn (Estudiante $e) => Str::ascii(mb_strtolower("{$e->usuario->apellidos} {$e->usuario->nombres}")))
            ->values();

        $matriculas = Matricula::query()
            ->whereIn('anio', [$anio, $anio - 1])
            ->orderBy('fecha_matricula')
            ->get();

        return [
            'anio' => $anio,
            'estudiantes' => $estudiantes->map(fn (Estudiante $e) => $this->estudianteParaPantalla($e))->all(),
            'matriculas' => $matriculas->map(fn (Matricula $m) => $this->matriculaParaPantalla($m))->all(),
            'resultados' => (object) $this->resultadosDelAnio($anio - 1),
        ];
    }

    /** Una matrícula individual, con acudiente opcional. */
    public function matricular(array $datos): array
    {
        $estudiante = $this->estudianteMatriculable($datos['estudiante_id'], (int) $datos['anio']);
        $this->validarGrupo((int) $datos['sede_id'], (int) $datos['grado'], $datos['grupo']);

        $acudienteId = $datos['acudiente_id'] ?? null;
        if ($acudienteId !== null && ! $estudiante->acudientes()->whereKey($acudienteId)->exists()) {
            throw new ErrorDeNegocio('Ese acudiente no está registrado para este estudiante.');
        }

        $matricula = Matricula::create([
            'estudiante_id' => $estudiante->id,
            'anio' => (int) $datos['anio'],
            'sede_id' => (int) $datos['sede_id'],
            'grado' => (int) $datos['grado'],
            'grupo' => $datos['grupo'],
            'acudiente_id' => $acudienteId,
            'estado' => 'activa',
            'fecha_matricula' => now()->toDateString(),
        ]);

        return $this->matriculaParaPantalla($matricula->refresh());
    }

    /**
     * Varios estudiantes al mismo curso. Todo o nada: el primero que no
     * se pueda matricular detiene el lote y la transacción del request
     * deshace los anteriores -- un lote "casi completo" obligaría a la
     * secretaria a adivinar quién quedó y quién no.
     *
     * En lote no se registra acudiente (lo dice la confirmación).
     */
    public function matricularLote(array $datos): array
    {
        $anio = (int) $datos['anio'];
        $this->validarGrupo((int) $datos['sede_id'], (int) $datos['grado'], $datos['grupo']);

        return collect(array_unique($datos['estudiante_ids']))
            ->map(function (string $id) use ($anio, $datos) {
                $estudiante = $this->estudianteMatriculable($id, $anio);

                $matricula = Matricula::create([
                    'estudiante_id' => $estudiante->id,
                    'anio' => $anio,
                    'sede_id' => (int) $datos['sede_id'],
                    'grado' => (int) $datos['grado'],
                    'grupo' => $datos['grupo'],
                    'estado' => 'activa',
                    'fecha_matricula' => now()->toDateString(),
                ]);

                return $this->matriculaParaPantalla($matricula->refresh());
            })
            ->values()->all();
    }

    /**
     * Mover una matrícula activa a otro grupo (u otra sede) del MISMO
     * grado. El grado no cambia acá: cambiar de grado es otra matrícula,
     * no un cambio de grupo.
     */
    public function cambiarGrupo(Matricula $matricula, array $datos): array
    {
        $this->exigirActiva($matricula);

        $sedeId = (int) $datos['sede_id'];
        if ($sedeId === $matricula->sede_id && $datos['grupo'] === $matricula->grupo) {
            throw new ErrorDeNegocio('Ya está en ese grupo. Elige un grupo o una sede distintos.');
        }

        $this->validarGrupo($sedeId, $matricula->grado, $datos['grupo']);

        $matricula->update(['sede_id' => $sedeId, 'grupo' => $datos['grupo']]);

        return $this->matriculaParaPantalla($matricula->refresh());
    }

    /**
     * Retirar del año. La fila NO se borra: queda 'retirada' con motivo,
     * fecha y quién lo hizo. Las notas ya registradas se conservan; las
     * nuevas las bloquea la política RLS de inserción del profesor.
     */
    public function retirar(Matricula $matricula, array $datos, string $usuarioId): array
    {
        $this->exigirActiva($matricula);

        $matricula->update([
            'estado' => 'retirada',
            'motivo_retiro' => $datos['motivo'],
            'detalle_retiro' => $datos['motivo'] === 'Otro' ? $datos['detalle'] : null,
            'fecha_retiro' => now()->toDateString(),
            'retirado_por' => $usuarioId,
        ]);

        return $this->matriculaParaPantalla($matricula->refresh());
    }

    /**
     * Registrar a la madre o el padre de un estudiante.
     *
     * Si ya existe un acudiente con esa cédula (el papá de dos hermanos),
     * NO se crea otro: se vincula el que ya estaba. Rechazarlo obligaría
     * a la secretaria a un callejón sin salida -- la cédula es de esa
     * persona, y la persona ya está en el sistema.
     *
     * @return array{acudiente: array, yaExistia: bool}
     */
    public function agregarAcudiente(array $datos): array
    {
        $estudiante = Estudiante::query()->findOrFail($datos['estudiante_id']);

        $yaTiene = DB::table('estudiante_acudientes')
            ->where('estudiante_id', $estudiante->id)
            ->where('parentesco', $datos['parentesco'])
            ->exists();
        if ($yaTiene) {
            $registrado = $datos['parentesco'] === 'madre' ? 'madre registrada' : 'padre registrado';
            throw new ErrorDeNegocio("Este estudiante ya tiene {$registrado}.");
        }

        $acudiente = Acudiente::query()->where('documento', $datos['documento'])->first();
        $yaExistia = $acudiente !== null;

        if ($yaExistia && $estudiante->acudientes()->whereKey($acudiente->id)->exists()) {
            throw new ErrorDeNegocio("{$acudiente->nombres} {$acudiente->apellidos} ya es acudiente de este estudiante.");
        }

        $acudiente ??= Acudiente::create([
            'nombres' => $datos['nombres'],
            'apellidos' => $datos['apellidos'],
            'documento' => $datos['documento'],
            'telefono' => $datos['telefono'],
        ]);

        $estudiante->acudientes()->attach($acudiente->id, [
            'parentesco' => $datos['parentesco'],
            // El primero que se registra queda como principal.
            'es_principal' => ! $estudiante->acudientes()->exists(),
        ]);

        return [
            'acudiente' => [
                'id' => $acudiente->id,
                'nombre' => trim("{$acudiente->nombres} {$acudiente->apellidos}"),
                'parentesco' => $datos['parentesco'],
                'documento' => $acudiente->documento,
            ],
            'yaExistia' => $yaExistia,
        ];
    }

    // ─────────────────────────────────────────────────────────────
    // Reglas
    // ─────────────────────────────────────────────────────────────

    /**
     * El estudiante, si se lo puede matricular en ese año: cuenta activa,
     * sin otra matrícula activa ese año, y sin haberse graduado (aprobó
     * 11° el año anterior). El mensaje nombra a la persona, porque en un
     * lote es lo único que dice cuál falló.
     */
    private function estudianteMatriculable(string $estudianteId, int $anio): Estudiante
    {
        $estudiante = Estudiante::query()->with('usuario')->find($estudianteId);
        if ($estudiante === null || $estudiante->usuario === null) {
            throw new ErrorDeNegocio('No se encontró la cuenta de ese estudiante.');
        }

        $nombre = trim("{$estudiante->usuario->nombres} {$estudiante->usuario->apellidos}");

        if (! $estudiante->activo || ! $estudiante->usuario->activo) {
            throw new ErrorDeNegocio("La cuenta de {$nombre} está desactivada. Actívala en Usuarios antes de matricularla.");
        }

        $actual = Matricula::query()
            ->with('sede')
            ->where('estudiante_id', $estudiante->id)
            ->where('anio', $anio)
            ->where('estado', 'activa')
            ->first();
        if ($actual !== null) {
            $curso = $this->curso($actual->grado, $actual->grupo);
            throw new ErrorDeNegocio("{$nombre} ya está matriculado en {$curso}, {$actual->sede?->nombre}, en {$anio}. Para moverlo, usa “Cambiar de grupo”.");
        }

        $anterior = Matricula::query()
            ->where('estudiante_id', $estudiante->id)
            ->where('anio', $anio - 1)
            ->where('estado', 'activa')
            ->first();
        if ($anterior !== null && $anterior->grado === 11
            && ($this->resultadosDelAnio($anio - 1, [$estudiante->id])[$estudiante->id] ?? null) === 'A') {
            throw new ErrorDeNegocio("{$nombre} aprobó 11° en ".($anio - 1).': se graduó, así que ya no se matricula.');
        }

        return $estudiante;
    }

    /**
     * El grupo existe en esa sede y está ABIERTO. La FK compuesta a
     * `oferta_grados` solo garantiza que exista; un grupo desactivado
     * seguiría pasando, y matricular ahí es justo lo que desactivarlo
     * quería impedir.
     */
    private function validarGrupo(int $sedeId, int $grado, string $grupo): void
    {
        $abierto = OfertaGrado::query()
            ->where('sede_id', $sedeId)->where('grado', $grado)->where('grupo', $grupo)
            ->where('activo', true)
            ->exists();

        if (! $abierto) {
            $sede = Sede::query()->whereKey($sedeId)->value('nombre') ?? 'Esa sede';
            throw new ErrorDeNegocio("{$sede} no tiene abierto el grupo {$this->curso($grado, $grupo)}. Elige otro, o ábrelo en Asignaciones › Grados.");
        }
    }

    private function exigirActiva(Matricula $matricula): void
    {
        if ($matricula->estado !== 'activa') {
            throw new ErrorDeNegocio('Esta matrícula ya está retirada; no se puede modificar.');
        }
    }

    /**
     * Cómo terminó cada estudiante un año: 'A' aprobó, 'N' no aprobó,
     * 'P' sin resultado final todavía.
     *
     * Sale de `vista_boletin_nudo_anual`, la misma fuente del boletín:
     * lo que se imprime es la nota del NUDO, así que aprobar el año es
     * aprobar todos sus nudos. Un nudo con `aprobado` nulo (faltan
     * épocas) deja el año en progreso; uno reprobado lo deja en 'N' --
     * a menos que algún otro siga en progreso, porque entonces el año no
     * terminó y no hay resultado que dar. Sin ninguna fila (nadie le
     * subió notas) también es 'P': nunca se inventa un resultado.
     *
     * @param  array<string>|null  $soloEstos
     * @return array<string, string>
     */
    private function resultadosDelAnio(int $anio, ?array $soloEstos = null): array
    {
        $filas = DB::table('vista_boletin_nudo_anual')
            ->where('anio', $anio)
            ->when($soloEstos !== null, fn ($q) => $q->whereIn('estudiante_id', $soloEstos))
            ->get(['estudiante_id', 'aprobado']);

        return $filas->groupBy('estudiante_id')
            ->map(function (Collection $nudos) {
                if ($nudos->contains(fn ($n) => $n->aprobado === null)) {
                    return 'P';
                }

                return $nudos->every(fn ($n) => (bool) $n->aprobado) ? 'A' : 'N';
            })
            ->all();
    }

    private function anioActual(): int
    {
        return PeriodoAcademico::anioEscolarActual();
    }

    private function curso(int $grado, string $grupo): string
    {
        return $grupo === 'UNICO' ? "{$grado}° Único" : "{$grado}-{$grupo}";
    }

    // ─────────────────────────────────────────────────────────────
    // Formato de respuesta
    // ─────────────────────────────────────────────────────────────

    private function estudianteParaPantalla(Estudiante $e): array
    {
        return [
            'id' => $e->id,
            'nombres' => $e->usuario->nombres,
            'apellidos' => $e->usuario->apellidos,
            'documento' => $e->usuario->documento,
            'acudientes' => $e->acudientes
                ->sortByDesc(fn (Acudiente $a) => (bool) $a->pivot->es_principal)
                ->map(fn (Acudiente $a) => [
                    'id' => $a->id,
                    'nombre' => trim("{$a->nombres} {$a->apellidos}"),
                    'parentesco' => $a->pivot->parentesco,
                    'documento' => $a->documento,
                ])->values()->all(),
        ];
    }

    private function matriculaParaPantalla(Matricula $m): array
    {
        return [
            'id' => $m->id,
            'estudianteId' => $m->estudiante_id,
            'anio' => $m->anio,
            'sedeId' => $m->sede_id,
            'grado' => $m->grado,
            'grupo' => $m->grupo,
            'estado' => $m->estado,
            'fecha' => $m->fecha_matricula?->toDateString(),
            'acudienteId' => $m->acudiente_id,
            'motivoRetiro' => $m->motivo_retiro,
            'detalleRetiro' => $m->detalle_retiro,
            'fechaRetiro' => $m->fecha_retiro?->toDateString(),
        ];
    }
}
