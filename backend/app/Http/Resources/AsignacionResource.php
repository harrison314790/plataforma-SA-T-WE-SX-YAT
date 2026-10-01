<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Único lugar que decide qué campos de una asignación viajan al frontend.
 * Claves en camelCase, espejo 1:1 de
 * `frontend/src/app/core/interfaces/asignacion.interface.ts` -- mismo
 * criterio que NotaResource y UsuarioResource.
 *
 * QUÉ NO SALE, Y POR QUÉ
 * · `creado_por` -- es auditoría interna. Quién dio de alta la asignación
 *   no se muestra en ninguna pantalla de este módulo, y exponer un uuid de
 *   usuario "por si acaso" es exactamente el campo interno innecesario que
 *   la convención del proyecto pide dejar afuera. Vive en la tabla, se
 *   consulta desde la base cuando haga falta auditar.
 * · `sede_id`/`profesor_id`/`asignatura_id` sueltos -- cada uno viaja
 *   DENTRO de su objeto (`sede.id`, `profesor.id`...), no duplicado al
 *   lado. El formulario de edición lee esos ids de ahí.
 *
 * QUÉ SÍ SALE AUNQUE NO SEA UNA COLUMNA: `cantidadNotas`. La tabla la
 * necesita antes de ofrecer el borrado -- es la diferencia entre el
 * diálogo que dice "se puede eliminar" y el que dice "esto tiene 12 notas
 * de estudiantes de 9-B". Pedirla en una segunda petición al abrir el
 * diálogo sería un round-trip más justo en el momento en que la persona
 * está esperando una respuesta, con la conectividad de una vereda.
 *
 * @mixin \App\Models\Asignacion
 */
class AsignacionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'grado' => (int) $this->grado,
            'grupo' => $this->grupo,
            'anio' => (int) $this->anio,
            'activo' => (bool) $this->activo,

            'profesor' => $this->whenLoaded('profesor', fn () => [
                'id' => $this->profesor->id,
                'nombreCompleto' => trim(
                    ($this->profesor->usuario->nombres ?? '').' '.($this->profesor->usuario->apellidos ?? '')
                ),
                // El profesor puede estar inactivo y su asignación seguir
                // viva: la pantalla lo señala en vez de esconder la fila,
                // porque esconderla dejaría notas colgando de algo
                // invisible.
                'activo' => (bool) $this->profesor->activo,
            ]),

            'asignatura' => $this->whenLoaded('asignatura', fn () => [
                'id' => $this->asignatura->id,
                'nombre' => $this->asignatura->nombre,
                'codigo' => $this->asignatura->codigo,
            ]),

            // Se infiere del profesor al guardar (ver AsignacionRequest),
            // pero viaja igual: la tabla la muestra como columna de solo
            // lectura y el formulario la usa para confirmar de qué sede se
            // está hablando antes de guardar.
            'sede' => $this->whenLoaded('sede', fn () => [
                'id' => $this->sede->id,
                'nombre' => $this->sede->nombre,
                'tipo' => $this->sede->tipo,
                'vereda' => $this->sede->vereda,
                // Estrella llena = sede principal, contorno = escuela
                // satélite. Regla con función, no decoración -- ver
                // references/diseno-ui.md.
                'esPrincipal' => $this->sede->tipo === 'principal',
            ]),

            'cantidadNotas' => (int) ($this->notas_count ?? 0),

            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
