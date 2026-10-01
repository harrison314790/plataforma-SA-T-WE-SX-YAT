<?php

namespace App\Services;

use App\Exceptions\ErrorDeNegocio;
use App\Models\Asignacion;
use App\Models\Matricula;
use App\Models\Nota;
use App\Models\OfertaGrado;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\QueryException;

/**
 * Administración del catálogo `oferta_grados`: qué grado+grupo existe en
 * cada sede.
 *
 * Es el mismo patrón que AsignacionService y por la misma razón: hay una
 * operación (eliminar) que Postgres rechaza con un error crudo, y el
 * trabajo de este archivo es adelantarse para poder explicar por qué y
 * ofrecer la alternativa -- nunca para reemplazar el control de la base,
 * que sigue siendo quien garantiza el dato.
 */
class OfertaGradoService
{
    /**
     * El catálogo completo, con cuánto lo usa cada fila.
     *
     * Devuelve también las INACTIVAS, a diferencia de lo que consume el
     * formulario de asignaciones: esta es la pantalla donde se
     * administran, así que una fila desactivada tiene que poder verse
     * para reactivarla. El filtro por `activo` lo hace quien consume el
     * catálogo, no esta consulta.
     */
    public function listar(): Collection
    {
        return OfertaGrado::query()
            ->select('oferta_grados.*')
            ->addSelect(['asignaciones_count' => $this->conteoDe(Asignacion::query())])
            ->addSelect(['matriculas_count' => $this->conteoDe(Matricula::query())])
            ->addSelect(['notas_count' => $this->conteoDeNotas()])
            ->orderBy('sede_id')
            ->orderBy('grado')
            ->orderBy('grupo')
            ->get();
    }

    /**
     * El subselect de "cuántas filas de esta tabla dependen de esta
     * combinación".
     *
     * Va como subconsulta correlacionada y no como `withCount()` de
     * Eloquent porque la relación es por una llave COMPUESTA
     * (sede_id, grado, grupo) -- `hasMany` no sabe expresar eso, y
     * cargar todo en memoria para contarlo sería traer miles de
     * matrículas para mostrar un número.
     */
    private function conteoDe(Builder $consulta): Builder
    {
        $tabla = $consulta->getModel()->getTable();

        return $consulta
            ->selectRaw('count(*)')
            ->whereColumn("{$tabla}.sede_id", 'oferta_grados.sede_id')
            ->whereColumn("{$tabla}.grado", 'oferta_grados.grado')
            ->whereColumn("{$tabla}.grupo", 'oferta_grados.grupo');
    }

    /**
     * Las notas que cuelgan de esta combinación, a través de sus
     * asignaciones.
     *
     * Tiene su propio método porque necesita un JOIN que las otras dos
     * no: `notas` no tiene sede/grado/grupo propios -- los hereda de la
     * asignación a la que pertenece.
     *
     * Y hace falta contarlas aunque el borrado ya esté bloqueado por las
     * asignaciones: para quien mira la pantalla no es lo mismo "acá hay
     * 2 asignaciones" que "acá hay 2 asignaciones con 2 notas de
     * estudiantes". Lo primero suena a configuración que se puede
     * rehacer; lo segundo deja claro que adentro hay trabajo de alguien.
     */
    private function conteoDeNotas(): Builder
    {
        return Nota::query()
            ->selectRaw('count(*)')
            ->join('asignaciones', 'asignaciones.id', '=', 'notas.asignacion_id')
            ->whereColumn('asignaciones.sede_id', 'oferta_grados.sede_id')
            ->whereColumn('asignaciones.grado', 'oferta_grados.grado')
            ->whereColumn('asignaciones.grupo', 'oferta_grados.grupo');
    }

    public function crear(array $datos): OfertaGrado
    {
        $oferta = OfertaGrado::create([
            'sede_id' => $datos['sede_id'],
            'grado' => $datos['grado'],
            'grupo' => $datos['grupo'],
        ]);

        return $this->conConteos($oferta);
    }

    /**
     * Desactivar no invalida el histórico: la llave foránea compuesta
     * solo exige que la fila EXISTA, no que esté activa. Las
     * asignaciones y matrículas de años anteriores siguen siendo
     * válidas; lo que cambia es que esa combinación deja de ofrecerse
     * para trabajo nuevo.
     */
    public function cambiarEstado(OfertaGrado $oferta, bool $activo): OfertaGrado
    {
        $oferta->update(['activo' => $activo]);

        return $this->conConteos($oferta);
    }

    /**
     * Borrado definitivo, solo si nunca se usó.
     *
     * Las dos redes son las mismas que en AsignacionService::eliminar():
     * el conteo previo para poder explicar, y el chequeo de filas
     * afectadas porque un DELETE que RLS no deja pasar no falla, borra 0
     * filas y parece éxito. Acá la política de `oferta_grados` es
     * `for all using (fn_es_admin())` (08-oferta-grados-por-sede.sql), que
     * sí cubre delete -- pero el chequeo se queda igual: depender de que
     * una política exista sin verificar el resultado es exactamente el
     * error que se encontró en `asignaciones`.
     */
    public function eliminar(OfertaGrado $oferta): void
    {
        if (array_sum($this->usos($oferta)) > 0) {
            throw new ErrorDeNegocio(
                'Este grado y grupo ya se usó en asignaciones o matrículas y no se puede eliminar. Se puede desactivar en su lugar.'
            );
        }

        try {
            $eliminadas = OfertaGrado::query()->whereKey($oferta->getKey())->delete();
        } catch (QueryException $e) {
            // 23503 = foreign_key_violation. Llega acá si algo empezó a
            // usar la combinación entre el conteo y el borrado.
            if ($e->getCode() === '23503') {
                throw new ErrorDeNegocio(
                    'Este grado y grupo está en uso y no se puede eliminar. Se puede desactivar en su lugar.'
                );
            }

            throw $e;
        }

        if ($eliminadas === 0) {
            throw new ErrorDeNegocio(
                'No se pudo eliminar el grado y grupo. Si el problema sigue, avisá a soporte.'
            );
        }
    }

    /**
     * Qué depende de esta combinación, DESGLOSADO por tabla.
     *
     * Desglosado y no un total, porque el total no dice a dónde ir: "14"
     * no distingue entre catorce asignaciones que se pueden rehacer y
     * catorce notas de estudiantes que no. El mensaje de error se arma
     * con esto -- ver OfertaGradoController::destroy().
     */
    public function usos(OfertaGrado $oferta): array
    {
        $enTabla = fn (string $modelo) => $modelo::query()
            ->where('sede_id', $oferta->sede_id)
            ->where('grado', $oferta->grado)
            ->where('grupo', $oferta->grupo)
            ->count();

        return [
            'asignaciones' => $enTabla(Asignacion::class),
            'matriculas' => $enTabla(Matricula::class),
            'notas' => Nota::query()
                ->join('asignaciones', 'asignaciones.id', '=', 'notas.asignacion_id')
                ->where('asignaciones.sede_id', $oferta->sede_id)
                ->where('asignaciones.grado', $oferta->grado)
                ->where('asignaciones.grupo', $oferta->grupo)
                ->count(),
        ];
    }

    /**
     * Recarga la fila con sus conteos después de escribirla. Igual que en
     * AsignacionService: los subselects no sobreviven a un
     * `create()`/`update()`, y sin esto la respuesta diría "0 usos" de
     * una combinación que tiene historial -- y la pantalla ofrecería el
     * borrado por error.
     */
    private function conConteos(OfertaGrado $oferta): OfertaGrado
    {
        return OfertaGrado::query()
            ->select('oferta_grados.*')
            ->addSelect(['asignaciones_count' => $this->conteoDe(Asignacion::query())])
            ->addSelect(['matriculas_count' => $this->conteoDe(Matricula::query())])
            ->addSelect(['notas_count' => $this->conteoDeNotas()])
            ->whereKey($oferta->getKey())
            ->firstOrFail();
    }
}
