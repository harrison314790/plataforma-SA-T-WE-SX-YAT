<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Una época del año escolar (Primera a Cuarta).
 *
 * LA ÉPOCA ACTIVA SALE DEL CALENDARIO (22-epocas-por-fecha.sql): es la
 * que tiene a "hoy" entre `fecha_inicio` y `fecha_fin`. Ya no hay una
 * columna `activo` que alguien tenga que cambiar a mano el día exacto.
 * Si hoy no cae en ninguna, es receso: no hay época activa y nadie sube
 * notas.
 *
 * "Hoy" es la fecha de Colombia (`hoy()`), no la del servidor (UTC): a
 * las 7 p. m. de Bogotá en UTC ya es mañana. La base usa el mismo
 * criterio (`fn_hoy_colegio()`), y las dos tienen que coincidir porque
 * la política RLS de inserción de notas lo evalúa allá.
 *
 * @property-read bool $activo calculado por fecha, no es columna
 */
class PeriodoAcademico extends Model
{
    public const ZONA_COLEGIO = 'America/Bogota';

    /** Como se llaman en el boletín y en las faltas, en nasa yuwe. */
    private const EPOCAS_NASA = ['Teeçx', "Je'z", 'Tekh', 'Pahz'];

    protected $table = 'periodos_academicos';

    public $timestamps = false;

    protected $fillable = [
        'nombre', 'anio', 'numero', 'fecha_inicio', 'fecha_fin',
        'fecha_limite_notas', 'notas_habilitadas',
    ];

    protected function casts(): array
    {
        return [
            'fecha_inicio' => 'date',
            'fecha_fin' => 'date',
            'fecha_limite_notas' => 'datetime',
            'notas_habilitadas' => 'boolean',
        ];
    }

    // No hay asignaciones(): HasMany acá -- desde
    // 09-asignaciones-por-anio.sql, `asignaciones` ya no tiene
    // `periodo_id` (tiene `anio`), así que "las asignaciones de este
    // período" dejó de ser una relación 1:N bien definida -- las mismas
    // asignaciones son compartidas por los 4 períodos de su año. Ver
    // Asignacion::matriculasCorrespondientes() para el cruce real
    // (por `anio`, no por `periodo_id`). Tampoco hay matriculas(): desde
    // 20-matriculas-por-anio.sql la matrícula también es por año.

    public function excepcionesPlazo(): HasMany
    {
        return $this->hasMany(ExcepcionPlazo::class, 'periodo_id');
    }

    /** La fecha de hoy en el colegio. */
    public static function hoy(): string
    {
        return now(self::ZONA_COLEGIO)->toDateString();
    }

    /** `$periodo->activo`: ¿hoy cae dentro de esta época? */
    public function getActivoAttribute(): bool
    {
        $hoy = self::hoy();

        return $this->fecha_inicio->toDateString() <= $hoy && $hoy <= $this->fecha_fin->toDateString();
    }

    /** `->enCurso()`: la época que contiene a hoy (una o ninguna). */
    public function scopeEnCurso(Builder $query): Builder
    {
        $hoy = self::hoy();

        return $query->whereDate('fecha_inicio', '<=', $hoy)->whereDate('fecha_fin', '>=', $hoy);
    }

    /** La época en curso, o `null` en receso. */
    public static function actual(): ?self
    {
        return static::query()->enCurso()->first();
    }

    /**
     * El año escolar en curso: el de la época activa, o en receso el de
     * la última que ya empezó (en el receso de mitad de año la pantalla
     * sigue en el año correcto). Mismo criterio que `fn_anio_escolar_actual()`.
     */
    public static function anioEscolarActual(): int
    {
        $ultima = static::query()
            ->whereDate('fecha_inicio', '<=', self::hoy())
            ->orderByDesc('fecha_inicio')
            ->value('anio');

        return (int) ($ultima ?? static::query()->min('anio') ?? now(self::ZONA_COLEGIO)->year);
    }

    /**
     * "¿Es la época activa, la carga está habilitada y no pasó la fecha
     * límite?" -- la misma pregunta que responde la política RLS
     * `notas_profesor_inserta_dentro_de_plazo`. Repetirla acá es a
     * propósito (ver NotaService) para devolver un mensaje claro ANTES de
     * chocar contra RLS; RLS sigue siendo la autoridad final.
     */
    public function estaDentroDePlazo(): bool
    {
        return $this->activo && $this->notas_habilitadas && now()->lessThanOrEqualTo($this->fecha_limite_notas);
    }

    /** "Tercera" -- como la llama el boletín ("Tercera Época"). */
    public function epoca(): string
    {
        return ['Primera', 'Segunda', 'Tercera', 'Cuarta'][$this->numero - 1] ?? "Época {$this->numero}";
    }

    /** "Tekh" -- el nombre en nasa yuwe. */
    public function epocaNasa(): ?string
    {
        return self::EPOCAS_NASA[$this->numero - 1] ?? null;
    }

    /** Para comparar con `hoy()` sin pelear con zonas horarias. */
    public function inicio(): string
    {
        return Carbon::parse($this->fecha_inicio)->toDateString();
    }

    public function fin(): string
    {
        return Carbon::parse($this->fecha_fin)->toDateString();
    }
}
