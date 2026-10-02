/**
 * Las rutas de módulo que ya tienen pantalla construida en Angular.
 *
 * POR QUÉ ESTO NO ESTÁ EN LA BASE DE DATOS
 * La base responde "¿este rol tiene permiso?" -- una pregunta de
 * configuración, que cambia sin desplegar. Esta lista responde otra: "¿la
 * pantalla existe?", que es estado del CÓDIGO. Ponerla en la base crearía un
 * dato que hay que recordar actualizar en cada despliegue y que, si se
 * olvida, manda a la gente a una ruta en blanco.
 *
 * ES LA MISMA LISTA QUE `app.routes.ts`, Y ESO ES A PROPÓSITO
 * Se podría inferir del router en tiempo de ejecución, pero el router
 * también conoce '/login', '/sin-permiso' y los comodines, así que habría
 * que filtrarlos con una heurística. Una lista explícita de tres líneas es
 * más honesta que una heurística que se equivoca en silencio.
 *
 * AL CONSTRUIR UN MÓDULO NUEVO: agregar su ruta acá y en `app.routes.ts`,
 * cambiando el `loadComponent` de `modulo-en-construccion` por el real. El
 * menú y el escritorio se actualizan solos.
 */
export const RUTAS_CONSTRUIDAS: ReadonlySet<string> = new Set([
  '/notas',
  '/asignaciones',
  '/nudos',
  '/porcentajes',
  '/boletines',
]);

export function estaConstruida(ruta: string | null | undefined): boolean {
  return ruta != null && RUTAS_CONSTRUIDAS.has(ruta);
}
