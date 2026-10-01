<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\ExcepcionPlazo;
use App\Models\Nota;
use App\Models\PeriodoAcademico;
use App\Models\Usuario;

/**
 * Lógica de negocio de notas que amerita vivir fuera del modelo: decide
 * si vale la pena intentar el insert ANTES de que choque contra RLS, para
 * poder devolver un mensaje de error claro en vez del genérico de
 * Postgres. Ver la decisión sobre capa de Services en
 * .claude/skills/sistema-academico/references/laravel-postgres.md.
 *
 * Regla de mirror obligatoria: este chequeo de plazo tiene que reflejar
 * EXACTAMENTE a quién le aplica en la política RLS
 * `notas_profesor_inserta_dentro_de_plazo` (solo al rol `profesor`) -- si
 * se le aplicara también a admin/super_admin, este service bloquearía
 * correcciones fuera de plazo que RLS sí permite, y quedarían
 * inconsistentes las dos capas.
 */
class NotaService
{
    public function registrar(Usuario $usuario, array $datos): Nota
    {
        if ($usuario->rol->nombre === 'profesor') {
            $this->verificarPlazoParaProfesor($usuario, $datos['asignacion_id'], $datos['periodo_id']);
        }

        // La verificación de "¿esta asignación es del profesor?" y "¿el
        // estudiante está matriculado en ella?" las hace RLS al ejecutar
        // el insert (ver base-datos.md) -- no se duplican acá. Si no le
        // corresponde, el insert simplemente falla.
        return Nota::create([
            'estudiante_id' => $datos['estudiante_id'],
            'asignacion_id' => $datos['asignacion_id'],
            'periodo_id' => $datos['periodo_id'],
            'valor' => $datos['valor'],
            'registrado_por' => $usuario->id,
        ]);
    }

    /**
     * El plazo se evalúa contra el PERÍODO que se está calificando, no
     * contra la asignación -- desde 09-asignaciones-por-anio.sql, una
     * asignación cubre los 4 períodos del año a la vez, así que ya no
     * identifica un solo período de dónde sacar `estaDentroDePlazo()`.
     * Antes de esa migración esto se resolvía vía `$asignacion->periodo`;
     * ese atajo dejó de existir junto con `asignaciones.periodo_id`.
     *
     * La excepción de plazo, igual: tiene que ser para ESTE período
     * puntual (`ex.periodo_id = periodoId`), no para cualquiera de los 4
     * de la asignación -- mismo criterio que la política RLS
     * `notas_profesor_inserta_dentro_de_plazo`, que se reescribió con la
     * misma condición en la misma migración.
     */
    private function verificarPlazoParaProfesor(Usuario $usuario, string $asignacionId, int $periodoId): void
    {
        $periodo = PeriodoAcademico::findOrFail($periodoId);

        if ($periodo->estaDentroDePlazo()) {
            return;
        }

        $profesorId = $usuario->profesor?->id;

        $tieneExcepcionVigente = ExcepcionPlazo::where('asignacion_id', $asignacionId)
            ->where('profesor_id', $profesorId)
            ->where('periodo_id', $periodoId)
            ->get()
            ->contains(fn (ExcepcionPlazo $excepcion) => $excepcion->estaVigente());

        if (! $tieneExcepcionVigente) {
            throw new ErrorDeNegocio(
                'El período de esta asignación ya cerró y no tenés una excepción de plazo vigente.'
            );
        }
    }
}
