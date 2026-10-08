import type { PeriodoNotas, Prorroga } from '../../core/interfaces/nota.interface';
import { curso, iniciales, normalizar, plural } from '../matriculas/reglas';

/**
 * Las reglas de las pantallas de Notas que no dependen de Angular:
 * escala y desempeño, cómo se interpreta lo que escribe el profesor, y
 * cómo se dicen las fechas y los plazos. Funciones puras a propósito: se
 * leen y se prueban sin montar nada.
 *
 * `curso`, `plural`, `iniciales` y `normalizar` son los de Matrículas:
 * "9-B" / "3° Único" tiene que decirse igual en todo el sistema.
 */
export { curso, iniciales, normalizar, plural };

// ─────────────────────────────────────────────────────────────
// Escala y desempeño
// ─────────────────────────────────────────────────────────────

export type TonoDesempeno = 'bajo' | 'aprobado';

export interface Desempeno {
  texto: 'Bajo' | 'Básico' | 'Alto' | 'Superior';
  icono: '✕' | '✓';
  tono: TonoDesempeno;
}

/** 1,0–2,9 Bajo (reprueba) · 3,0–3,9 Básico · 4,0–4,6 Alto · 4,7–5,0 Superior. */
export function desempeno(valor: number): Desempeno {
  if (valor < 3) return { texto: 'Bajo', icono: '✕', tono: 'bajo' };
  if (valor < 4) return { texto: 'Básico', icono: '✓', tono: 'aprobado' };
  if (valor < 4.7) return { texto: 'Alto', icono: '✓', tono: 'aprobado' };
  return { texto: 'Superior', icono: '✓', tono: 'aprobado' };
}

/** 4 -> "4,0" · 3.8 -> "3,8". Coma decimal, como en el boletín. */
export const unDecimal = (valor: number): string => valor.toFixed(1).replace('.', ',');

export type LecturaNota =
  | { estado: 'vacia' }
  | { estado: 'ok'; valor: number }
  | { estado: 'error'; mensaje: string };

/**
 * Interpreta lo que escribió el profesor, mientras escribe:
 * "45" = 4,5 (dos dígitos sin coma, el atajo del teclado numérico),
 * "4" = 4,0, "4,5" o "4.5" = 4,5. Fuera de 1,0–5,0 o con dos decimales,
 * es un error que se dice al lado del campo.
 */
export function leerNota(texto: string): LecturaNota {
  const t = texto.trim().replace(',', '.');
  if (!t) return { estado: 'vacia' };

  if (/^\d{2}$/.test(t)) {
    const n = Number(t);
    return n >= 10 && n <= 50 ? { estado: 'ok', valor: n / 10 } : { estado: 'error', mensaje: 'Entre 1,0 y 5,0' };
  }
  if (/^\d\.$/.test(t)) return { estado: 'error', mensaje: 'Falta el decimal' };
  if (!/^\d(\.\d)?$/.test(t)) return { estado: 'error', mensaje: 'Escribe un número como 4,5' };

  const v = Number(t);
  return v < 1 || v > 5 ? { estado: 'error', mensaje: 'Entre 1,0 y 5,0' } : { estado: 'ok', valor: v };
}

/** Al salir del campo (o con Enter): "45" -> "4,5", "4" -> "4,0", "4," -> "4,0". */
export function normalizarNota(texto: string): string {
  if (!texto) return texto;
  let t = texto.replace('.', ',');
  if (/^\d{2}$/.test(t)) {
    const n = Number(t);
    if (n >= 10 && n <= 50) t = `${t[0]},${t[1]}`;
  } else if (/^[1-5]$/.test(t)) {
    t += ',0';
  } else if (/^\d,$/.test(t)) {
    t += '0';
  }
  return t;
}

/** Lo único que se deja escribir en el campo: dígitos y un separador, hasta 3 caracteres. */
export const limpiarEntrada = (texto: string): string => texto.replace(/[^\d.,]/g, '').slice(0, 3);

// ─────────────────────────────────────────────────────────────
// Avance de una asignación
// ─────────────────────────────────────────────────────────────

export type EstadoAvance = 'completa' | 'parcial' | 'sin';

export function estadoAvance(conNota: number, total: number): EstadoAvance {
  if (conNota === 0) return 'sin';
  return conNota >= total ? 'completa' : 'parcial';
}

/** Ícono + texto: el estado nunca se dice solo con color. */
export const CHIP_AVANCE: Record<EstadoAvance, { icono: string; texto: string; textoProfesor: string }> = {
  completa: { icono: '✓', texto: 'Completa', textoProfesor: 'Completa' },
  parcial: { icono: '◐', texto: 'Parcial', textoProfesor: 'Parcial' },
  sin: { icono: '○', texto: 'Sin empezar', textoProfesor: 'Pendiente' },
};

// ─────────────────────────────────────────────────────────────
// El reloj del servidor
// ─────────────────────────────────────────────────────────────

/**
 * "¿Ya cerró?" se pregunta contra la hora del SERVIDOR: los equipos de
 * las escuelas son compartidos y varios tienen la fecha mal puesta, y
 * quien decide si una nota entra es el `now()` de Postgres. Se guarda la
 * diferencia entre el `ahora` de la última respuesta y el reloj local, y
 * se le suma al reloj local para seguir contando entre respuestas.
 */
export class RelojServidor {
  private desfase = 0;

  sincronizar(ahoraServidor: string): void {
    this.desfase = Date.parse(ahoraServidor) - Date.now();
  }

  ahora(): Date {
    return new Date(Date.now() + this.desfase);
  }
}

/** ¿La prórroga sirve en este momento? (no revocada lo garantiza el backend). */
export const prorrogaVigente = (p: Prorroga | null, ahora: Date): p is Prorroga =>
  p !== null && Date.parse(p.hasta) >= ahora.getTime();

/** La carga general (sin prórroga): habilitada, período activo y antes de la fecha límite. */
export const cargaGeneralAbierta = (p: PeriodoNotas, ahora: Date): boolean =>
  p.estado === 'activo' &&
  p.notasHabilitadas &&
  p.fechaLimiteNotas !== null &&
  ahora.getTime() <= Date.parse(p.fechaLimiteNotas);

// ─────────────────────────────────────────────────────────────
// Fechas como se dicen en la pantalla
// ─────────────────────────────────────────────────────────────

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const aFecha = (d: Date | string): Date => (typeof d === 'string' ? new Date(d) : d);

export function hora(d: Date | string): string {
  const f = aFecha(d);
  const h = f.getHours();
  return `${h % 12 || 12}:${String(f.getMinutes()).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** "lun 10 nov" */
export function dia(d: Date | string): string {
  const f = aFecha(d);
  return `${DIAS[f.getDay()]} ${f.getDate()} ${MESES[f.getMonth()]}`;
}

/** "lun 10 nov, 6:00 p. m." */
export const diaHora = (d: Date | string): string => `${dia(d)}, ${hora(d)}`;

/** "lun 10 nov 2026, 6:00 p. m." */
export const diaHoraAnio = (d: Date | string): string => `${dia(d)} ${aFecha(d).getFullYear()}, ${hora(d)}`;

/** "hoy, 8:15 a. m." / "ayer, 4:12 p. m." / "lun 3 nov, 9:40 a. m." */
export function relativa(d: Date | string, ahora: Date): string {
  const f = aFecha(d);
  if (f.toDateString() === ahora.toDateString()) return `hoy, ${hora(f)}`;
  if (f.toDateString() === new Date(ahora.getTime() - 864e5).toDateString()) return `ayer, ${hora(f)}`;
  return diaHora(f);
}

/** "3 días" / "5 horas" / "1 hora" / "20 min" */
export function duracion(ms: number): string {
  const horas = Math.abs(ms) / 36e5;
  if (horas >= 48) return `${Math.floor(horas / 24)} días`;
  if (horas >= 1) return Math.floor(horas) === 1 ? '1 hora' : `${Math.floor(horas)} horas`;
  return `${Math.max(1, Math.floor(Math.abs(ms) / 6e4))} min`;
}

/** "faltan 3 días" / "hace 2 horas" */
export function falta(d: Date | string, ahora: Date): string {
  const ms = aFecha(d).getTime() - ahora.getTime();
  return ms >= 0 ? `faltan ${duracion(ms)}` : `hace ${duracion(ms)}`;
}

/** Cuenta regresiva del tablero: "3 d 8 h" / "5 h 20 min" / "12 min". */
export function cuentaRegresiva(d: Date | string, ahora: Date): string {
  const m = Math.max(0, Math.floor((aFecha(d).getTime() - ahora.getTime()) / 6e4));
  const dd = Math.floor(m / 1440);
  const hh = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  return dd ? `${dd} d ${hh} h` : hh ? `${hh} h ${mm} min` : `${mm} min`;
}

// ── Fechas del calendario de épocas (YYYY-MM-DD, sin hora) ──

/** "2026-02-02" -> fecha local a medianoche; `null` si no es una fecha completa. */
export function fechaSola(texto: string | null | undefined): Date | null {
  return texto && /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T00:00`) : null;
}

/** "2026-02-02" -> "2 feb". */
export function diaMes(texto: string): string {
  const d = fechaSola(texto);
  return d ? `${d.getDate()} ${MESES[d.getMonth()]}` : '—';
}

/** Días de calendario de `desde` a `hasta` (las dos en YYYY-MM-DD). */
export function diasEntre(desde: string, hasta: string): number {
  const a = fechaSola(desde);
  const b = fechaSola(hasta);
  return a && b ? Math.round((b.getTime() - a.getTime()) / 864e5) : 0;
}

// ── Inputs de fecha y hora (siempre en la hora local del equipo) ──

const dos = (n: number): string => String(n).padStart(2, '0');

export const aInputFecha = (d: Date): string => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
export const aInputHora = (d: Date): string => `${dos(d.getHours())}:${dos(d.getMinutes())}`;

/** Los dos inputs a un instante local; `null` si falta algo. */
export function desdeInputs(fecha: string, horaTexto: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(horaTexto)) return null;
  const [a, m, d] = fecha.split('-').map(Number);
  const [h, mi] = horaTexto.split(':').map(Number);
  return new Date(a, m - 1, d, h, mi);
}

/**
 * ISO con el offset del equipo ("2026-10-20T18:00:00-05:00"), no
 * `toISOString()` (que la pasaría a UTC y ocultaría qué hora eligió la
 * persona). El backend la convierte a UTC.
 */
export function isoLocal(d: Date): string {
  const off = -d.getTimezoneOffset();
  const signo = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${aInputFecha(d)}T${aInputHora(d)}:00${signo}${dos(Math.floor(abs / 60))}:${dos(abs % 60)}`;
}

/** "Camila Andrea Tumiñá Ul" -> lo que se muestra en tablas: nombres y apellidos. */
export const nombreCompleto = (e: { nombres: string; apellidos: string }): string => `${e.nombres} ${e.apellidos}`;

/** "Marta Ríos" -> "MR" (para los avatares de la tabla de coordinación). */
export function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return `${partes[0]?.[0] ?? ''}${partes[1]?.[0] ?? ''}`.toUpperCase();
}
