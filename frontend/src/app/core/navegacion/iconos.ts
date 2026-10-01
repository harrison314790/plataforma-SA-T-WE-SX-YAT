/**
 * El set de íconos del sistema, derivado del escudo de la institución (libro
 * abierto con planta brotando, montañas, estrella) y no de una librería
 * genérica -- ver references/diseno-ui.md.
 *
 * POR QUÉ VIVEN ACÁ Y NO EN LA BASE DE DATOS
 * `modulos.icono` y `recursos.icono` guardan un NOMBRE ('libro', 'personas'),
 * nunca marcado SVG. Guardar SVG en una columna de texto sería meter
 * presentación en la base y pagar su ancho de banda en cada login; además
 * abriría la puerta a que un `super_admin` inyecte marcado en el DOM de
 * todos los usuarios.
 *
 * Todos comparten la misma gramática para que se lean como un set y no como
 * íconos sueltos: lienzo de 24, trazo de 1.75 sin relleno, geometría recta
 * (nada de curvas decorativas), y cada uno cabe en el mismo cuadrado óptico.
 * `estrella` es la única excepción con relleno, y por una razón funcional:
 * llena = sede principal, contorno = escuela satélite.
 */

export const ICONOS = {
  /** Inicio. Una casa, porque "YAT" es precisamente casa en nasa yuwe. */
  casa: 'M4 11.2 12 4.5l8 6.7M6.4 9.5V19h11.2V9.5M10 19v-4.6h4V19',

  /** Notas. Libro abierto con el brote del escudo saliendo del lomo. */
  libro: 'M12 8.6v10.9M12 8.6c-1.9-1.6-4.2-2.3-7-2.3v10.9c2.8 0 5.1.7 7 2.3 1.9-1.6 4.2-2.3 7-2.3V6.3c-2.8 0-5.1.7-7 2.3M12 8.6V6.2m0 0c0-1.3.9-2.3 2.3-2.7-.2 1.6-.9 2.5-2.3 2.7m0 0c0-1.3-.9-2.3-2.3-2.7.2 1.6.9 2.5 2.3 2.7',

  /** Matrículas. Un carné: retrato a la izquierda, datos a la derecha. */
  carnet: 'M3.5 5.5h17v13h-17zM7 9.2h3.2v3.2H7zM7 15h3.2M13.4 9.6h4M13.4 12.4h4M13.4 15h4',

  /** Asistencia. Lista con marcas de verificación. */
  lista: 'M4 7.2l1.6 1.6L8.4 6M4 12.8l1.6 1.6L8.4 11.6M4 18.4L5.6 20l2.8-2.8M11.4 7.6H20M11.4 13.2H20M11.4 18.8H20',

  /** Usuarios. Dos personas, la de atrás desplazada. */
  personas: 'M9.6 11.2a3.1 3.1 0 100-6.2 3.1 3.1 0 000 6.2zM3.6 19.4c0-2.9 2.7-4.8 6-4.8s6 1.9 6 4.8M16 5.4a3.1 3.1 0 010 5.9M17.6 14.9c1.8.6 3 2.1 3 4.5',

  /** Documentos. Carpeta con pestaña, esquinas rectas. */
  carpeta: 'M3.5 6.5h6l1.8 2.4h9.2v10.6h-17zM3.5 6.5v12.9',

  /**
   * Reportes. Barras de distinta altura -- a propósito casi la misma
   * silueta que `montanas`: en el escudo las montañas son el perfil de la
   * cordillera, y un reporte por sede es literalmente comparar esas alturas.
   */
  grafico: 'M4 20h16M7.2 20v-5.6M11.7 20V8.8M16.2 20v-8.4',

  /** Roles y permisos. La llave del sistema: exclusiva de super_admin. */
  llave: 'M14.6 9.4a3.4 3.4 0 10-4.6 3.2L4 18.6V20h2.6l1-1v-1.7h1.7l1.3-1.3v-1.6l.4-.4a3.4 3.4 0 006.6-.9M15.6 8.4h.01',

  /** Sede. Estrella de 5 puntas: llena = principal, contorno = vereda. */
  estrella: 'M12 4.2l2.4 5 5.5.8-4 3.9.95 5.5L12 16.8l-4.85 2.6.95-5.5-4-3.9 5.5-.8z',

  /** Encabezado de las vistas de sede. La cordillera del escudo. */
  montanas: 'M3 18.5l5.4-8.2 3.1 4.4 2.6-3.8 6.9 7.6zM3 18.5h18',

  /** Cerrar sesión. Puerta con la flecha saliendo. */
  salir: 'M14.4 5.5H5.5v13h8.9M11.4 12h9.1M17.6 8.8l2.9 3.2-2.9 3.2',

  /** Colapsar/expandir la barra lateral: panel con su canal lateral. */
  panel: 'M3.5 5.5h17v13h-17zM9.2 5.5v13',

  /** Desplegar el menú de usuario. */
  chevron: 'M7.6 10.2l4.4 4.2 4.4-4.2',

  /** Reintentar, tras un error de red. */
  reintentar: 'M19.5 12a7.5 7.5 0 11-2.6-5.7M20 4.6v4.2h-4.2',

  /** Aviso: plazo por vencer, sin conexión. */
  alerta: 'M12 4.6L3.4 19.4h17.2zM12 9.6v4.6M12 16.6h.01',

  /** Confirmación. */
  visto: 'M4.8 12.6l4.4 4.4 9.9-10',

  /**
   * Editar una fila. Lápiz en diagonal, con su punta.
   *
   * Los tres que siguen (lapiz, papelera, apagar) no salen del escudo
   * como el resto del set, y no hay forma de que salgan: son primitivas
   * de interfaz, no motivos gráficos. La alternativa era dejar las
   * acciones de la tabla solo como texto, que en una fila de 40px con
   * tres acciones se vuelve una hilera de palabras subrayadas difícil de
   * recorrer. Se mantienen en el mismo lenguaje del set -- trazo de
   * 1.75, extremos redondeados, nada de relleno -- para que no se noten
   * como piezas de otra familia.
   */
  lapiz: 'M4.5 19.5h3.5L18.7 8.8a1.9 1.9 0 000-2.7l-.8-.8a1.9 1.9 0 00-2.7 0L4.5 16z M14.6 6.9l2.5 2.5',

  /** Eliminar definitivamente. Papelera con tapa y dos estrías. */
  papelera: 'M4.6 7h14.8M9.6 7V4.6h4.8V7M6.9 7l.8 12.4h8.6L17.1 7M10.4 10.4v6M13.6 10.4v6',

  /**
   * Desactivar: el símbolo universal de encendido/apagado. Dice
   * "sacar de circulación" sin sugerir que algo se destruye, que es
   * exactamente la diferencia con la papelera de al lado.
   */
  apagar: 'M12 4.4v7.2M7.3 7.1a6.6 6.6 0 109.4 0',

  /**
   * Cerrar un modal.
   *
   * Se agrega porque no había ninguna equis en el set y los modales
   * estaban usando `salir` -- que es la puerta con la flecha del CERRAR
   * SESIÓN de la barra superior. Con lector de pantalla no se notaba (el
   * botón ya dice "Cerrar"), pero a la vista es el mismo dibujo para
   * "cerrar esta ventana" y para "salir del sistema": el segundo pierde
   * una hora de trabajo si se pulsa por error.
   *
   * No sale del escudo, a diferencia del resto del set, y no hay forma
   * de que salga: una equis es una primitiva de interfaz, no un motivo
   * gráfico. Es la excepción y conviene que siga siendo la única.
   */
  equis: 'M6.8 6.8l10.4 10.4M17.2 6.8L6.8 17.2',
} as const;

export type NombreDeIcono = keyof typeof ICONOS;

/**
 * Un nombre de ícono que la base pudo mandar mal escrito no debe romper el
 * menú entero: el módulo se pinta igual, solo sin su ícono. Que una etiqueta
 * mal tipeada en `modulos.icono` deje al profesor sin poder navegar sería
 * una reacción desproporcionada a un error de configuración.
 */
export function esNombreDeIcono(valor: string | null | undefined): valor is NombreDeIcono {
  return valor != null && valor in ICONOS;
}
