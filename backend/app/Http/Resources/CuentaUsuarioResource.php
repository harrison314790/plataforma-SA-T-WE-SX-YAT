<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Una cuenta tal como la muestra el módulo de Usuarios. Claves en
 * camelCase, espejo 1:1 de `CuentaUsuario` en
 * `frontend/src/app/core/interfaces/cuenta-usuario.interface.ts`.
 *
 * Distinto de UsuarioResource a propósito: ese describe al usuario
 * CONECTADO (su rol con etiqueta, para la barra superior); este describe
 * una cuenta ADMINISTRADA, con lo que la tabla necesita para decidir qué
 * ofrecer (`vinculado`, `eliminable`). Mezclarlos haría que el login
 * cargue conteos de asignaciones que no usa.
 *
 * `password_hash` no sale: este Resource arma la respuesta campo por
 * campo, y además el modelo lo tiene en `$hidden`.
 *
 * Necesita cargados `rol`, `sede` y los conteos que pone
 * UsuarioService::consulta(); sin ellos los conteos salen en 0.
 *
 * @mixin \App\Models\Usuario
 */
class CuentaUsuarioResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $esProfesor = $this->rol->nombre === 'profesor';

        return [
            'id' => $this->id,
            'tipo' => $this->rol->nombre,
            'nombres' => $this->nombres,
            'apellidos' => $this->apellidos,
            'nombreCompleto' => trim("{$this->nombres} {$this->apellidos}"),
            'iniciales' => mb_strtoupper(mb_substr($this->nombres, 0, 1).mb_substr($this->apellidos, 0, 1)),
            'documento' => $this->documento,
            'email' => $this->email,
            'activo' => (bool) $this->activo,

            // Solo la del profesor. La de un estudiante existe en la
            // columna (datos sembrados antes de Matrículas) pero no se
            // muestra acá: su sede real es la de su matrícula.
            'sede' => $esProfesor && $this->sede !== null ? [
                'id' => $this->sede->id,
                'nombre' => $this->sede->nombre,
                'tipo' => $this->sede->tipo,
                'vereda' => $this->sede->vereda,
                'esPrincipal' => $this->sede->tipo === 'principal',
            ] : null,

            // Ver Usuario::tieneVinculoAcademico() y ::tieneDatosAsociados().
            // Viajan con la fila para que el menú muestre "Eliminar"
            // deshabilitado desde el principio, en vez de ofrecerlo y fallar.
            'vinculado' => $this->tieneVinculoAcademico(),
            'eliminable' => ! $this->tieneDatosAsociados(),

            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
