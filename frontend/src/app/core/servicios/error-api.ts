import { HttpErrorResponse } from '@angular/common/http';

/**
 * Lectura del formato de error único de esta API:
 * `{ error: { codigo, mensaje, detalles? } }` (ver bootstrap/app.php).
 *
 * Ojo con la ruta: es `err.error.error.mensaje`. El primer `error` es el
 * cuerpo de la respuesta que envuelve Angular, el segundo es la clave del
 * formato de esta API, y `mensaje` es el texto.
 *
 * POR QUÉ ESTO EXISTE COMO ARCHIVO Y NO COMO MÉTODO PRIVADO
 * `login.component.ts` tiene hoy esta misma lógica escrita adentro, y fue
 * el primero que la necesitó. En cuanto un segundo módulo tuvo que leer un
 * error de la API (Asignaciones), copiar esas veinte líneas habría sido
 * garantizar que se desincronicen -- sobre todo la rama de `status === 0`,
 * que es la que distingue "sin señal" de "error del servidor" y es justo la
 * que no hay que perder en una zona con conectividad intermitente.
 *
 * Pendiente sano, no hecho acá para no tocar un módulo ajeno:
 * `login.component.ts` debería pasar a usar esta función la próxima vez que
 * se toque autenticación. Mientras tanto, la duplicación existe y está
 * dicha; no hay que agregarle una tercera copia.
 */
export interface CuerpoDeError {
  error?: {
    codigo?: string;
    mensaje?: string;
    detalles?: Record<string, string[]>;
  };
}

/**
 * El texto que se le muestra a una persona. El backend ya manda mensajes
 * pensados para leerse tal cual ("Esa asignatura no está en la malla
 * curricular del grado elegido"), así que casi nunca hace falta el
 * `respaldo`.
 */
export function mensajeDeError(err: unknown, respaldo: string): string {
  if (!(err instanceof HttpErrorResponse)) return respaldo;

  // status 0 = la petición no llegó a salir: sin señal, o el backend caído.
  // Distinguirlo importa: "revisa tu conexión" es accionable, "error
  // interno" manda a la persona a buscar ayuda que no necesita.
  if (err.status === 0) {
    return 'Sin conexión con el servidor. Revisa tu señal e intenta de nuevo.';
  }

  const cuerpo = err.error as CuerpoDeError | null;

  // En un 422 de validación, el detalle del campo es más útil que el
  // mensaje general ("Los datos enviados no son válidos").
  const primerDetalle = Object.values(cuerpo?.error?.detalles ?? {})[0]?.[0];
  if (primerDetalle) return primerDetalle;

  return cuerpo?.error?.mensaje ?? respaldo;
}

/** El `codigo` del error, para los casos en que la pantalla bifurca por él. */
export function codigoDeError(err: unknown): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;

  return (err.error as CuerpoDeError | null)?.error?.codigo ?? null;
}

/**
 * Los errores de validación campo por campo, para pintarlos al lado del
 * input que corresponde en vez de todos juntos arriba del formulario.
 */
export function detallesDeError(err: unknown): Record<string, string[]> {
  if (!(err instanceof HttpErrorResponse)) return {};

  return (err.error as CuerpoDeError | null)?.error?.detalles ?? {};
}
