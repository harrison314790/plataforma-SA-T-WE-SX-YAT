<?php

namespace App\Http\Requests;

/**
 * Alta de una asignación. Toda la forma la define AsignacionRequest; acá
 * no hay nada que agregar, y eso es información: crear es el caso base,
 * editar es el que tiene los dos matices (ver ActualizarAsignacionRequest).
 *
 * La clase existe igual, en vez de usar la base directamente, porque la
 * firma del controlador es lo que documenta qué valida cada endpoint --
 * `store(CrearAsignacionRequest $request)` se lee solo.
 */
class CrearAsignacionRequest extends AsignacionRequest
{
}
