/**
 * Contraseña inicial: dos palabras del territorio y cuatro dígitos
 * ("Guadua-Tulpa-4821").
 *
 * POR QUÉ PALABRAS Y NO CARACTERES AL AZAR
 * La secretaria la DICTA o la escribe en un papel para entregarla en
 * persona, a veces a un niño de primaria. "x7#Kq9!m" se transcribe mal;
 * dos palabras conocidas y un número, no.
 *
 * POR QUÉ DOS PALABRAS Y NO UNA
 * El diseño original traía una palabra de doce y cuatro dígitos: ~108.000
 * combinaciones, que un script prueba en minutos contra el login (que hoy
 * no tiene límite de intentos). Con dos palabras de una lista de 32 son
 * ~9 millones -- sigue sin ser una contraseña para siempre, por eso es
 * INICIAL, pero deja de ser adivinable en una tarde.
 *
 * `crypto.getRandomValues` y no `Math.random`: el segundo no es
 * criptográfico y su secuencia se puede predecir.
 */
const PALABRAS = [
  'Guadua', 'Quebrada', 'Colibri', 'Montana', 'Fogon', 'Maizal', 'Cascada', 'Tulpa',
  'Arcoiris', 'Semilla', 'Laguna', 'Bejuco', 'Paramo', 'Frailejon', 'Condor', 'Chumbe',
  'Mochila', 'Yuca', 'Arracacha', 'Cafetal', 'Neblina', 'Trueno', 'Estrella', 'Luna',
  'Venado', 'Armadillo', 'Guacamaya', 'Cedro', 'Roble', 'Platano', 'Fique', 'Minga',
];

function aleatorio(tope: number): number {
  const buffer = new Uint32Array(1);
  // Descarta el sesgo del módulo: sin esto, las primeras palabras de la
  // lista saldrían apenas más seguido que las últimas.
  const limite = Math.floor(0x1_0000_0000 / tope) * tope;
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limite);
  return buffer[0] % tope;
}

export function generarContrasena(): string {
  const primera = PALABRAS[aleatorio(PALABRAS.length)];
  let segunda = PALABRAS[aleatorio(PALABRAS.length)];
  while (segunda === primera) segunda = PALABRAS[aleatorio(PALABRAS.length)];

  const numero = String(1000 + aleatorio(9000));
  return `${primera}-${segunda}-${numero}`;
}
