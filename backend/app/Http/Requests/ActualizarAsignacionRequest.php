<?php

namespace App\Http\Requests;

use App\Models\Asignacion;
use Illuminate\Validation\Rule;

/**
 * Edición de una asignación existente. Misma forma que el alta, con dos
 * matices que solo tienen sentido al editar.
 *
 * Lo que este Form Request NO cubre a propósito: `activo`. Desactivar o
 * reactivar no es "editar los datos", es un cambio de estado con su
 * propia consecuencia (el profesor deja de ver la asignación para
 * trabajo nuevo) y su propio endpoint --
 * `PATCH /asignaciones/{id}/activo`, con
 * CambiarEstadoRequest. Mezclarlos dejaría que una edición
 * cualquiera apagara una asignación sin que nadie lo pidiera.
 */
class ActualizarAsignacionRequest extends AsignacionRequest
{
    /**
     * Matiz 1: la unicidad tiene que ignorarse a sí misma. Sin esto,
     * guardar una asignación sin cambiarle nada (o cambiándole solo el
     * año) chocaría contra su propia fila y diría "ya existe".
     */
    protected function reglaDeUnicidad(): object
    {
        return parent::reglaDeUnicidad()->ignore($this->asignacionEnEdicion());
    }

    /**
     * Matiz 2: si la combinación sede+grado+grupo NO cambió, no se exige
     * que la oferta siga activa.
     *
     * El caso real: La Laguna cerró el grupo 5-B el año pasado
     * (`activo = false`), pero las asignaciones de ese año siguen ahí y
     * son válidas. Corregirle la asignatura a una de ellas no debería
     * fallar por un grupo que nadie está intentando abrir de nuevo.
     * Mover la asignación a otra combinación sí exige que esa otra esté
     * activa, porque eso sí es trabajo nuevo.
     */
    protected function reglaDeOferta(): object
    {
        $actual = $this->asignacionEnEdicion();

        $sinCambios = $actual !== null
            && (int) $actual->sede_id === (int) $this->input('sede_id')
            && (int) $actual->grado === (int) $this->input('grado')
            && $actual->grupo === $this->input('grupo');

        if (! $sinCambios) {
            return parent::reglaDeOferta();
        }

        return Rule::exists('oferta_grados', 'grupo')
            ->where('sede_id', $this->input('sede_id'))
            ->where('grado', $this->input('grado'));
    }

    /**
     * La asignación que se está editando, resuelta por el route model
     * binding de la ruta (`/asignaciones/{asignacion}`). Bajo RLS, una
     * fila que esta sesión no puede ver nunca llega hasta acá: el binding
     * responde 404 antes.
     */
    private function asignacionEnEdicion(): ?Asignacion
    {
        $parametro = $this->route('asignacion');

        return $parametro instanceof Asignacion ? $parametro : null;
    }
}
