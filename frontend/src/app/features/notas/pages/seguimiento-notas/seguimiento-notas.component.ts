import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  AvanceAsignacion,
  CalendarioGuardado,
  PeriodoNotas,
  Prorroga,
  SeguimientoNotas,
} from '../../../../core/interfaces/nota.interface';
import { AuthService } from '../../../../core/servicios/auth.service';
import { ConexionService } from '../../../../core/servicios/conexion.service';
import { mensajeDeError } from '../../../../core/servicios/error-api';
import { NotasService } from '../../../../core/servicios/notas.service';
import { SinPermisoComponent } from '../../../../shared/componentes/sin-permiso/sin-permiso.component';
import { HasRoleDirective } from '../../../../shared/directivas/has-role.directive';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';
import { DialogoCalendarioComponent } from '../../componentes/dialogo-calendario/dialogo-calendario.component';
import { DialogoProrrogaComponent } from '../../componentes/dialogo-prorroga/dialogo-prorroga.component';
import { PanelVerNotasComponent } from '../../componentes/panel-ver-notas/panel-ver-notas.component';
import {
  CHIP_AVANCE,
  type EstadoAvance,
  RelojServidor,
  aInputFecha,
  aInputHora,
  cargaGeneralAbierta,
  cuentaRegresiva,
  curso,
  desdeInputs,
  diaHora,
  diaHoraAnio,
  diaMes,
  diasEntre,
  duracion,
  estadoAvance,
  falta,
  inicialesDe,
  isoLocal,
  plural,
  prorrogaVigente,
  relativa,
} from '../../reglas';

type FiltroEstado = '' | EstadoAvance | 'prorroga';
type ClaveOrden = 'avance' | 'profesor' | 'ultima';

interface Filtros {
  sede: string;
  curso: string;
  profesor: string;
  materia: string;
  estado: FiltroEstado;
}

const SIN_FILTROS: Filtros = { sede: '', curso: '', profesor: '', materia: '', estado: '' };

/** El chip de cada época en el calendario: ícono + texto, nunca solo color. */
const ESTADO_EPOCA = {
  cerrado: { icono: '–', texto: 'Cerrada' },
  activo: { icono: '●', texto: 'Activa' },
  futuro: { icono: '○', texto: 'Próxima' },
} as const;

/** Una asignación con lo que la tabla necesita ya calculado. */
interface Fila {
  a: AvanceAsignacion;
  curso: string;
  estado: EstadoAvance;
  faltan: number;
  /** Solo si está vigente y el período es el activo. */
  prorroga: Prorroga | null;
}

/**
 * "Seguimiento de notas": la pantalla de coordinación. Calcada del mockup
 * aprobado ("Notas - Módulo.html", vista admin).
 *
 * Arriba, el CALENDARIO DE ÉPOCAS: las 4 épocas del año con sus fechas
 * y su estado. La época activa sale de esas fechas (22-epocas-por-fecha.sql),
 * nadie la marca a mano; pulsar una tarjeta muestra el seguimiento de esa
 * época. Debajo, el CONTROL DEL PLAZO de la época activa (interruptor,
 * fecha límite, cuenta regresiva y el estado efectivo dicho en palabras).
 * Debajo, el avance de cada asignación para saber a quién llamar: por
 * defecto, primero las más atrasadas; y la vista "Por profesor", ordenada
 * por quién debe más.
 *
 * Una petición trae todo el período; filtros, orden y conteos se calculan
 * en el cliente (con la señal de una vereda, un round-trip por clic se
 * siente). Después de cada cambio (plazo, prórroga, corrección) se vuelve
 * a pedir en silencio: los números los manda el backend.
 *
 * Cada botón de escritura lleva su `*appHasRole` (capa 1), su
 * `requiere.permiso` en Laravel (capa 2) y su política RLS (capa 3).
 *
 * LOS CINCO ESTADOS: cargando (esqueleto) · vacío (período sin
 * asignaciones) · error (Reintentar) · sin permiso (403 en vuelo) · sin
 * conexión (solo consulta: calendario, interruptor, fecha, prórrogas y
 * correcciones quedan deshabilitados con su motivo).
 */
@Component({
  selector: 'app-seguimiento-notas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogoCalendarioComponent,
    DialogoProrrogaComponent,
    HasRoleDirective,
    ModalDirective,
    NgTemplateOutlet,
    PanelVerNotasComponent,
    SinPermisoComponent,
  ],
  templateUrl: './seguimiento-notas.component.html',
})
export class SeguimientoNotasComponent {
  private readonly servicio = inject(NotasService);
  private readonly conexion = inject(ConexionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly enLinea = this.conexion.enLinea;
  protected readonly plural = plural;
  protected readonly diaHora = diaHora;
  protected readonly diaMes = diaMes;
  protected readonly anchosEsqueleto = [['18%', '12%'], ['22%', '10%'], ['16%', '14%'], ['20%', '12%'], ['24%', '9%'], ['17%', '13%'], ['21%', '11%']];
  protected readonly motivoSinConexion = 'Sin conexión: no se puede cambiar ahora';

  private readonly reloj = new RelojServidor();
  private readonly tic = signal(0);

  protected readonly datos = signal<SeguimientoNotas | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly sinPermiso = signal(false);

  protected readonly filtros = signal<Filtros>(SIN_FILTROS);
  protected readonly orden = signal<{ clave: ClaveOrden; dir: 1 | -1 }>({ clave: 'avance', dir: 1 });
  protected readonly vista = signal<'asignacion' | 'profesor'>('asignacion');

  protected readonly aviso = signal<{ tipo: 'ok' | 'neutral' | 'advertencia'; texto: string } | null>(null);

  /** Paneles y modales: cada uno abierto o no. */
  protected readonly verNotas = signal<string | null>(null);
  protected readonly enProrroga = signal<AvanceAsignacion | null>(null);
  protected readonly editandoCalendario = signal(false);
  protected readonly confirmandoInterruptor = signal(false);
  protected readonly quitando = signal<string | null>(null);

  protected readonly editandoFecha = signal<{ fecha: string; hora: string } | null>(null);
  protected readonly guardandoPlazo = signal(false);
  protected readonly errorPlazo = signal<string | null>(null);

  constructor() {
    const id = window.setInterval(() => this.tic.update((n) => n + 1), 30_000);
    inject(DestroyRef).onDestroy(() => window.clearInterval(id));

    // Filtros, orden, vista y época en la URL: se restauran al recargar y
    // se pueden compartir ("mira lo que le falta a 9-B"). Antes se perdían
    // (AUDITORIA-2026-10-07.md, M6). La época va solo si se eligió una
    // distinta de la activa; sin ella, el backend abre la activa.
    const epoca = this.leerUrl();
    void this.cargar(epoca);

    effect(() => {
      this.filtros();
      this.orden();
      this.vista();
      this.datos();
      untracked(() => this.escribirUrl());
    });
  }

  private leerUrl(): number | null {
    const p = this.ruta.snapshot.queryParamMap;
    const texto = (clave: string): string => p.get(clave) ?? '';
    const estado = texto('estado');
    this.filtros.set({
      sede: texto('sede'),
      curso: texto('curso'),
      profesor: texto('profesor'),
      materia: texto('materia'),
      estado: (['completa', 'parcial', 'sin', 'prorroga'] as const).find((e) => e === estado) ?? '',
    });
    const orden = texto('orden');
    if (orden === 'profesor' || orden === 'ultima') {
      this.orden.set({ clave: orden, dir: texto('dir') === 'desc' ? -1 : 1 });
    } else if (texto('dir') === 'desc') {
      this.orden.set({ clave: 'avance', dir: -1 });
    }
    if (texto('vista') === 'profesor') this.vista.set('profesor');
    const epoca = Number(texto('epoca'));
    return Number.isInteger(epoca) && epoca > 0 ? epoca : null;
  }

  private escribirUrl(): void {
    const f = this.filtros();
    const o = this.orden();
    const periodo = this.periodo();
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: {
        epoca: periodo && periodo.estado !== 'activo' ? periodo.id : null,
        sede: f.sede || null,
        curso: f.curso || null,
        profesor: f.profesor || null,
        materia: f.materia || null,
        estado: f.estado || null,
        orden: o.clave !== 'avance' ? o.clave : null,
        dir: o.dir === -1 ? 'desc' : null,
        vista: this.vista() === 'profesor' ? 'profesor' : null,
      },
      replaceUrl: true,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Derivados
  // ─────────────────────────────────────────────────────────────

  protected readonly ahora = computed(() => {
    this.tic();
    this.datos();
    return this.reloj.ahora();
  });

  protected readonly periodo = computed<PeriodoNotas | null>(() => this.datos()?.periodo ?? null);

  /**
   * Capa 1 del interruptor, igual que `*appHasRole` pero con rama "sin
   * permiso": quien no puede cambiar el plazo igual ve si está habilitada.
   */
  protected readonly puedeControlarPlazo = computed(() => this.auth.tienePermiso('btn_controlar_plazo_notas'));

  /**
   * Las tarjetas del calendario: cada época con sus fechas, su estado y
   * cuánto lleva. "Día 31 de 82" se cuenta con la fecha del COLEGIO que
   * manda el servidor (`hoy`), no con la del equipo.
   */
  protected readonly calendario = computed(() => {
    const d = this.datos();
    if (d === null) return [];
    const hoy = d.hoy;
    const elegida = d.periodo.id;

    return d.periodos.map((p) => {
      const total = diasEntre(p.fechaInicio, p.fechaFin) + 1;
      const transcurridos = diasEntre(p.fechaInicio, hoy) + 1;
      return {
        p,
        elegida: p.id === elegida,
        rango: `${diaMes(p.fechaInicio)} – ${diaMes(p.fechaFin)}`,
        chip: ESTADO_EPOCA[p.estado],
        avance: p.estado === 'cerrado' ? 100 : p.estado === 'futuro' ? 0 : Math.round((transcurridos / total) * 100),
        detalle:
          p.estado === 'activo'
            ? `Día ${transcurridos} de ${total} · faltan ${plural(total - transcurridos, 'día', 'días')}`
            : p.estado === 'futuro'
              ? `Empieza en ${plural(diasEntre(hoy, p.fechaInicio), 'día', 'días')}`
              : `Cerró hace ${plural(diasEntre(p.fechaFin, hoy), 'día', 'días')}`,
      };
    });
  });

  protected readonly puedeEditarCalendario = computed(() => this.auth.tienePermiso('btn_editar_calendario_epocas'));

  protected readonly esActivo = computed(() => this.periodo()?.estado === 'activo');

  private readonly generalAbierta = computed(() => {
    const p = this.periodo();
    return p !== null && cargaGeneralAbierta(p, this.ahora());
  });

  /** El tablero del plazo: interruptor, fecha, cuenta regresiva y estado efectivo. */
  protected readonly control = computed(() => {
    const p = this.periodo();
    if (p === null || !p.fechaLimiteNotas) return null;
    const ahora = this.ahora();
    const limite = p.fechaLimiteNotas;
    const pasada = ahora.getTime() > Date.parse(limite);
    const abierta = this.generalAbierta();
    const porVencer = !pasada && (Date.parse(limite) - ahora.getTime()) / 36e5 < 48;

    return {
      habilitada: p.notasHabilitadas,
      abierta,
      textoInterruptor: p.notasHabilitadas ? 'Habilitada' : 'Cerrada',
      subInterruptor: p.notasHabilitadas
        ? pasada
          ? 'Está habilitada, pero la fecha límite ya pasó: nadie puede subir.'
          : 'Los profesores pueden subir notas hasta la fecha límite.'
        : 'Nadie puede subir notas, salvo quien tenga prórroga.',
      limite: diaHoraAnio(limite),
      rotuloCuenta: !p.notasHabilitadas ? 'Estado' : pasada ? 'Cierre' : 'Tiempo restante',
      cuenta: !p.notasHabilitadas ? 'Cerrada' : pasada ? `Cerró hace ${duracion(ahora.getTime() - Date.parse(limite))}` : cuentaRegresiva(limite, ahora),
      tonoCuenta: !p.notasHabilitadas || pasada ? 'apagado' : porVencer ? 'por-vencer' : 'normal',
      subCuenta: !p.notasHabilitadas
        ? 'Coordinación cerró la carga manualmente.'
        : pasada
          ? `El ${diaHora(limite)}.`
          : `para el cierre del ${diaHora(limite)}`,
      efectivo: abierta ? 'Los profesores pueden subir notas ahora' : 'Nadie puede subir notas ahora',
    };
  });

  protected readonly avisoFechaEditada = computed(() => {
    const e = this.editandoFecha();
    if (e === null) return null;
    const d = desdeInputs(e.fecha, e.hora);
    if (d === null) return { tono: 'error', texto: 'Escribe fecha y hora completas.' };
    if (d < this.ahora()) return { tono: 'advertencia', texto: 'Esa fecha ya pasó: la carga quedará cerrada para todos.' };
    return { tono: 'normal', texto: `Quedará: ${diaHoraAnio(d)} (${falta(d, this.ahora())}).` };
  });

  /** Todas las filas del período, antes de filtrar. */
  private readonly todas = computed<Fila[]>(() => {
    const ahora = this.ahora();
    const activo = this.esActivo();
    return (this.datos()?.asignaciones ?? []).map((a) => ({
      a,
      curso: curso(a.grado, a.grupo),
      estado: estadoAvance(a.conNota, a.total),
      faltan: Math.max(0, a.total - a.conNota),
      prorroga: activo && prorrogaVigente(a.prorroga, ahora) ? a.prorroga : null,
    }));
  });

  protected readonly resumen = computed(() => {
    const filas = this.todas();
    const total = filas.reduce((s, f) => s + f.a.total, 0);
    const hechas = filas.reduce((s, f) => s + Math.min(f.a.conNota, f.a.total), 0);
    return {
      porcentaje: total ? Math.round((hechas / total) * 100) : 0,
      texto: `${hechas} de ${total} notas registradas`,
      total,
      hechas,
      incompletas: filas.filter((f) => f.faltan > 0).length,
      prorrogas: filas.filter((f) => f.prorroga !== null).length,
    };
  });

  /** Los indicadores que filtran la tabla al pulsarlos. "Notas faltantes" solo informa. */
  protected readonly indicadores = computed(() => {
    const filas = this.todas();
    const elegido = this.filtros().estado;
    const n = (e: EstadoAvance) => filas.filter((f) => f.estado === e).length;
    return [
      { clave: 'completa' as const, rotulo: 'Completas', icono: '✓', tono: 'ok', n: n('completa'), filtra: true },
      { clave: 'parcial' as const, rotulo: 'Parciales', icono: '◐', tono: 'pendiente', n: n('parcial'), filtra: true },
      { clave: 'sin' as const, rotulo: 'Sin empezar', icono: '○', tono: 'neutro', n: n('sin'), filtra: true },
      { clave: null, rotulo: 'Notas faltantes', icono: '●', tono: 'pendiente', n: this.resumen().total - this.resumen().hechas, filtra: false },
      { clave: 'prorroga' as const, rotulo: 'Prórrogas activas', icono: '+', tono: 'accion', n: this.resumen().prorrogas, filtra: this.esActivo() },
    ].map((k) => ({ ...k, elegido: k.clave !== null && k.clave === elegido }));
  });

  protected readonly opcionesFiltro = computed(() => {
    const as = this.datos()?.asignaciones ?? [];
    const unicos = <T,>(xs: T[], clave: (x: T) => string) => [...new Map(xs.map((x) => [clave(x), x])).values()];
    return {
      sedes: unicos(as.map((a) => a.sede), (s) => String(s.id)).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')),
      cursos: unicos(as, (a) => `${a.grado}-${a.grupo}`)
        .sort((x, y) => x.grado - y.grado || x.grupo.localeCompare(y.grupo))
        .map((a) => ({ valor: `${a.grado}-${a.grupo}`, rotulo: curso(a.grado, a.grupo) })),
      profesores: unicos(as.map((a) => a.profesor), (p) => p.id).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')),
      materias: [...new Set(as.map((a) => a.materia))].sort((x, y) => x.localeCompare(y, 'es')),
    };
  });

  protected readonly hayFiltros = computed(() => Object.values(this.filtros()).some((v) => v !== ''));

  private readonly filtradas = computed(() => {
    const f = this.filtros();
    const { clave, dir } = this.orden();
    const porNombre = (x: Fila, y: Fila) => x.a.profesor.nombre.localeCompare(y.a.profesor.nombre, 'es');
    const comparar: Record<ClaveOrden, (x: Fila, y: Fila) => number> = {
      // Primero las más atrasadas: menor avance, y a igual avance, la que debe más.
      avance: (x, y) => (x.a.total ? x.a.conNota / x.a.total : 1) - (y.a.total ? y.a.conNota / y.a.total : 1) || y.faltan - x.faltan,
      profesor: porNombre,
      ultima: (x, y) => (x.a.ultimaCarga ? Date.parse(x.a.ultimaCarga) : 0) - (y.a.ultimaCarga ? Date.parse(y.a.ultimaCarga) : 0),
    };

    return this.todas()
      .filter(
        (x) =>
          (!f.sede || x.a.sede.id === Number(f.sede)) &&
          (!f.curso || `${x.a.grado}-${x.a.grupo}` === f.curso) &&
          (!f.profesor || x.a.profesor.id === f.profesor) &&
          (!f.materia || x.a.materia === f.materia) &&
          (!f.estado || (f.estado === 'prorroga' ? x.prorroga !== null : x.estado === f.estado)),
      )
      .sort((x, y) => comparar[clave](x, y) * dir || porNombre(x, y) || x.a.grado - y.a.grado);
  });

  protected readonly filas = computed(() => this.filtradas().map((x) => this.presentar(x)));

  /** "Por profesor": quién debe más, primero -- para saber a quién llamar. */
  protected readonly porProfesor = computed(() => {
    const grupos = new Map<string, Fila[]>();
    for (const x of this.filtradas()) grupos.set(x.a.profesor.id, [...(grupos.get(x.a.profesor.id) ?? []), x]);

    return [...grupos.values()]
      .map((xs) => {
        const faltan = xs.reduce((s, x) => s + x.faltan, 0);
        const conteo = (e: EstadoAvance) => xs.filter((x) => x.estado === e).length;
        const sedes = [...new Set(xs.map((x) => x.a.sede.nombre))].join(' · ');
        return {
          id: xs[0].a.profesor.id,
          nombre: xs[0].a.profesor.nombre,
          iniciales: inicialesDe(xs[0].a.profesor.nombre),
          sub: `${sedes} · ${plural(xs.length, 'asignación', 'asignaciones')}`,
          chips: (['sin', 'parcial', 'completa'] as EstadoAvance[])
            .filter((e) => conteo(e) > 0)
            .map((e) => ({ estado: e, icono: CHIP_AVANCE[e].icono, texto: `${conteo(e)} ${CHIP_AVANCE[e].texto.toLowerCase()}` })),
          faltan,
          textoFaltan: faltan ? `Faltan ${plural(faltan, 'nota', 'notas')}` : 'Al día',
          filas: xs.map((x) => this.presentar(x)),
        };
      })
      .sort((x, y) => y.faltan - x.faltan || x.nombre.localeCompare(y.nombre, 'es'));
  });

  private presentar(x: Fila) {
    return {
      ...x,
      iniciales: inicialesDe(x.a.profesor.nombre),
      porcentaje: x.a.total ? (x.a.conNota / x.a.total) * 100 : 0,
      fraccion: `${x.a.conNota}/${x.a.total}`,
      ultima: x.a.ultimaCarga ? relativa(x.a.ultimaCarga, this.ahora()) : '—',
      chip: CHIP_AVANCE[x.estado],
      textoProrroga: x.prorroga ? `Prórroga hasta ${diaHora(x.prorroga.hasta)}` : '',
      botonProrroga: x.prorroga ? 'Modificar prórroga' : 'Dar prórroga',
    };
  }

  protected readonly encabezadosOrden = computed(() => {
    const o = this.orden();
    const de = (clave: ClaveOrden) => {
      const activo = o.clave === clave;
      return {
        activo,
        aria: activo ? (o.dir > 0 ? 'ascending' : 'descending') : 'none',
        icono: activo ? (o.dir > 0 ? '↑' : '↓') : '↕',
      };
    };
    return { profesor: de('profesor'), avance: de('avance'), ultima: de('ultima') };
  });

  /** Las prórrogas vigentes del período activo, la que vence primero arriba. */
  protected readonly prorrogas = computed(() =>
    this.todas()
      .filter((x) => x.prorroga !== null)
      .sort((x, y) => Date.parse(x.prorroga!.hasta) - Date.parse(y.prorroga!.hasta))
      .map((x) => ({
        x,
        hasta: diaHora(x.prorroga!.hasta),
        falta: falta(x.prorroga!.hasta, this.ahora()),
        autorizada: diaHora(x.prorroga!.autorizadaEn),
      })),
  );

  protected readonly asignacionPanel = computed(
    () => this.datos()?.asignaciones.find((a) => a.id === this.verNotas()) ?? null,
  );

  protected readonly filaPanel = computed(() => {
    const a = this.asignacionPanel();
    return a === null ? null : (this.todas().find((x) => x.a.id === a.id) ?? null);
  });

  // ─────────────────────────────────────────────────────────────
  // Carga
  // ─────────────────────────────────────────────────────────────

  /** `silencioso`: recarga después de un cambio, sin esqueleto ni parpadeo. */
  async cargar(periodoId: number | null, silencioso = false): Promise<void> {
    if (!silencioso) {
      this.cargando.set(true);
      this.error.set(null);
    }
    try {
      const datos = await this.servicio.seguimiento(periodoId);
      this.reloj.sincronizar(datos.ahora);
      this.datos.set(datos);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 403) this.sinPermiso.set(true);
      else if (!silencioso) this.error.set(mensajeDeError(err, 'No pudimos cargar el avance del período.'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected reintentar(): void {
    void this.cargar(this.periodo()?.id ?? null);
  }

  private recargar(): void {
    void this.cargar(this.periodo()?.id ?? null, true);
  }

  /** Pulsar una tarjeta del calendario: el seguimiento de esa época. */
  protected elegirEpoca(id: number): void {
    if (id === this.periodo()?.id) return;
    this.filtros.set(SIN_FILTROS);
    this.verNotas.set(null);
    this.editandoFecha.set(null);
    this.quitando.set(null);
    void this.cargar(id);
  }

  // ─────────────────────────────────────────────────────────────
  // Filtros, orden y vista
  // ─────────────────────────────────────────────────────────────

  protected filtrar(clave: keyof Filtros, valor: string): void {
    this.filtros.update((f) => ({ ...f, [clave]: valor }));
  }

  protected elegirIndicador(clave: FiltroEstado | null, filtra: boolean): void {
    if (!filtra || clave === null) return;
    this.filtros.update((f) => ({ ...f, estado: f.estado === clave ? '' : clave }));
  }

  protected quitarFiltros(): void {
    this.filtros.set(SIN_FILTROS);
  }

  protected ordenarPor(clave: ClaveOrden): void {
    this.orden.update((o) => ({ clave, dir: o.clave === clave ? ((o.dir * -1) as 1 | -1) : 1 }));
  }

  // ─────────────────────────────────────────────────────────────
  // Control del plazo
  // ─────────────────────────────────────────────────────────────

  protected pedirInterruptor(): void {
    if (this.enLinea() && this.esActivo()) this.confirmandoInterruptor.set(true);
  }

  protected readonly textoInterruptor = computed(() => {
    const p = this.periodo();
    if (p === null) return null;
    const abrir = !p.notasHabilitadas;
    const n = this.resumen().prorrogas;
    const pasada = p.fechaLimiteNotas !== null && this.ahora().getTime() > Date.parse(p.fechaLimiteNotas);
    return {
      abrir,
      titulo: abrir ? '¿Abrir la carga de notas?' : '¿Cerrar la carga de notas?',
      texto: abrir
        ? `Vas a abrir la carga del período ${p.nombre} para todos los profesores. Podrán subir notas hasta el ${diaHora(p.fechaLimiteNotas!)}.`
        : `Vas a cerrar la carga del período ${p.nombre} para todos los profesores. Nadie podrá subir notas${n ? `, salvo las ${plural(n, 'prórroga activa', 'prórrogas activas')}` : ''}.`,
      advertencia:
        abrir && pasada
          ? `La fecha límite ya pasó (${diaHora(p.fechaLimiteNotas!)}). Aunque la habilites, nadie podrá subir notas hasta que pongas una fecha nueva.`
          : '',
      boton: abrir ? 'Sí, abrir la carga' : 'Sí, cerrar la carga',
    };
  });

  protected async cambiarInterruptor(): Promise<void> {
    const p = this.periodo();
    if (p === null) return;
    const abrir = !p.notasHabilitadas;
    await this.cambiarPlazo(
      { notas_habilitadas: abrir },
      abrir
        ? { tipo: 'ok', texto: `Carga del período ${p.nombre} habilitada para todos los profesores.` }
        : { tipo: 'neutral', texto: `Carga del período ${p.nombre} cerrada. Las prórrogas activas siguen valiendo.` },
    );
    this.confirmandoInterruptor.set(false);
  }

  protected editarFecha(): void {
    const p = this.periodo();
    if (p === null || !this.enLinea()) return;
    const d = p.fechaLimiteNotas ? new Date(p.fechaLimiteNotas) : this.ahora();
    this.errorPlazo.set(null);
    this.editandoFecha.set({ fecha: aInputFecha(d), hora: aInputHora(d) });
  }

  protected cambiarFechaEditada(campo: 'fecha' | 'hora', valor: string): void {
    this.editandoFecha.update((e) => (e === null ? e : { ...e, [campo]: valor }));
  }

  protected async guardarFecha(): Promise<void> {
    const e = this.editandoFecha();
    const p = this.periodo();
    const d = e && desdeInputs(e.fecha, e.hora);
    if (!d || p === null) return;
    const pasada = d < this.ahora();
    const ok = await this.cambiarPlazo(
      { fecha_limite_notas: isoLocal(d) },
      {
        tipo: pasada ? 'advertencia' : 'ok',
        texto: `Fecha límite del período ${p.nombre}: ${diaHoraAnio(d)}.${pasada ? ' Ya pasó, así que la carga queda cerrada.' : ''}`,
      },
    );
    if (ok) this.editandoFecha.set(null);
  }

  private async cambiarPlazo(
    cambios: { notas_habilitadas?: boolean; fecha_limite_notas?: string },
    exito: { tipo: 'ok' | 'neutral' | 'advertencia'; texto: string },
  ): Promise<boolean> {
    const p = this.periodo();
    const d = this.datos();
    if (p === null || d === null || this.guardandoPlazo()) return false;
    this.guardandoPlazo.set(true);
    this.errorPlazo.set(null);
    try {
      const actualizado = await this.servicio.cambiarPlazo(p.id, cambios);
      this.datos.set({
        ...d,
        periodo: actualizado,
        periodos: d.periodos.map((x) => (x.id === actualizado.id ? actualizado : x)),
      });
      this.aviso.set(exito);
      return true;
    } catch (err) {
      this.errorPlazo.set(mensajeDeError(err, 'No se pudo cambiar el plazo.'));
      return false;
    } finally {
      this.guardandoPlazo.set(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Calendario de épocas
  // ─────────────────────────────────────────────────────────────

  protected abrirCalendario(): void {
    if (this.enLinea()) this.editandoCalendario.set(true);
  }

  /**
   * Con las fechas nuevas puede haber cambiado la época activa: se vuelve
   * a pedir el seguimiento sin período, para caer en la que manda hoy.
   */
  protected alGuardarCalendario(r: CalendarioGuardado): void {
    this.editandoCalendario.set(false);
    this.filtros.set(SIN_FILTROS);
    this.verNotas.set(null);
    const anio = r.periodos[0]?.anio ?? '';
    this.aviso.set({
      tipo: 'ok',
      texto: `Calendario de épocas ${anio} guardado.${r.activa ? ` Época activa: ${r.activa.epoca} Época (${r.activa.nombre}).` : ' Hoy no hay ninguna época activa.'}`,
    });
    void this.cargar(null);
  }

  // ─────────────────────────────────────────────────────────────
  // Prórrogas
  // ─────────────────────────────────────────────────────────────

  /** Para "Modificar": la prórroga que tiene hoy, si sigue vigente. */
  protected prorrogaVigenteDe(a: AvanceAsignacion): Prorroga | null {
    return prorrogaVigente(a.prorroga, this.ahora()) ? a.prorroga : null;
  }

  protected abrirProrroga(a: AvanceAsignacion): void {
    if (this.enLinea() && this.esActivo()) this.enProrroga.set(a);
  }

  protected alGuardarProrroga(p: Prorroga): void {
    const a = this.enProrroga();
    this.enProrroga.set(null);
    if (a) {
      this.aviso.set({
        tipo: 'ok',
        texto: `Prórroga para ${a.profesor.nombre} en ${a.materia} ${curso(a.grado, a.grupo)} hasta el ${diaHora(p.hasta)}.`,
      });
    }
    this.recargar();
  }

  protected async quitarProrroga(x: Fila): Promise<void> {
    if (!x.prorroga || !this.enLinea()) return;
    try {
      await this.servicio.quitarProrroga(x.prorroga.id);
      this.aviso.set({
        tipo: 'neutral',
        texto: `Se quitó la prórroga de ${x.a.profesor.nombre} en ${x.a.materia} ${x.curso}.`,
      });
      this.quitando.set(null);
      this.recargar();
    } catch (err) {
      this.quitando.set(null);
      this.aviso.set({ tipo: 'advertencia', texto: mensajeDeError(err, 'No se pudo quitar la prórroga.') });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Panel "Ver notas"
  // ─────────────────────────────────────────────────────────────

  protected alCorregir(texto: string): void {
    this.aviso.set({ tipo: 'ok', texto });
    this.recargar();
  }
}
