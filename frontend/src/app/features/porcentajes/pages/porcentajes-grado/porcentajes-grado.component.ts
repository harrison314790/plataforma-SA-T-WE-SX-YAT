import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  ConfiguracionPorcentajes,
  NudoDeGrado,
  OpcionesPorcentajes,
} from '../../../../core/interfaces/nudo.interface';
import { ConexionService } from '../../../../core/servicios/conexion.service';
import { detallesDeError, mensajeDeError } from '../../../../core/servicios/error-api';
import { NudosService } from '../../../../core/servicios/nudos.service';
import { EstadoCargandoComponent } from '../../../../shared/componentes/estado-cargando/estado-cargando.component';
import { EstadoErrorComponent } from '../../../../shared/componentes/estado-error/estado-error.component';
import { EstadoVacioComponent } from '../../../../shared/componentes/estado-vacio/estado-vacio.component';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { SinPermisoComponent } from '../../../../shared/componentes/sin-permiso/sin-permiso.component';
import { HasRoleDirective } from '../../../../shared/directivas/has-role.directive';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';

/** Cómo va un grado, para la pestaña. */
/** Cómo va lo escrito en un nudo, antes de guardar. */
type EstadoBorrador = 'promedio-simple' | 'cerrado' | 'abierto';

/** Cambio de grado o de año que espera confirmación por haber cambios sin guardar. */
interface CambioPendiente {
  tipo: 'grado' | 'anio';
  valor: number;
}

type EstadoGrado = 'sin-materias' | 'sin-nudos-configurables' | 'completo' | 'parcial' | 'sin-configurar' | 'incompleto';

/**
 * Porcentajes por grado: cuánto pesa cada materia dentro de su nudo.
 *
 * Se usa UNA VEZ POR GRADO al iniciar el año (6°, después 7°... hasta
 * 11°). Por eso las pestañas de grado muestran el estado de los seis a la
 * vez: la pregunta del admin en enero es "¿qué grados me faltan?", y
 * contestarla no debería exigir abrir uno por uno. Son seis consultas
 * chicas en paralelo, una sola vez por año elegido.
 *
 * Vale para todos los grupos del grado (6-A y 6-B comparten), así que el
 * selector nunca pide grupo.
 *
 * La suma en vivo es solo ayuda: la regla de "suma 100" la aplica el
 * backend (PorcentajeGradoService). Si discreparan, manda el backend.
 *
 * Los porcentajes se guardan como texto mientras se escriben: un campo
 * que pasa a `null` al borrar el último dígito no deja escribir "33,5".
 */
@Component({
  selector: 'app-porcentajes-grado',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EstadoCargandoComponent,
    EstadoErrorComponent,
    EstadoVacioComponent,
    HasRoleDirective,
    IconoComponent,
    ModalDirective,
    RouterLink,
    SinPermisoComponent,
  ],
  host: { class: 'modulo-nudos' },
  templateUrl: './porcentajes-grado.component.html',
})
export class PorcentajesGradoComponent {
  private readonly servicio = inject(NudosService);
  private readonly conexion = inject(ConexionService);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly enLinea = this.conexion.enLinea;

  protected readonly opciones = signal<OpcionesPorcentajes | null>(null);
  protected readonly grado = signal<number>(6);
  protected readonly anio = signal<number | null>(null);

  /** Las seis configuraciones del año, para las pestañas. */
  protected readonly porGrado = signal<Record<number, ConfiguracionPorcentajes>>({});
  /** asignaturaId -> texto escrito en el campo, del grado abierto. */
  protected readonly borrador = signal<Record<number, string>>({});

  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly sinPermiso = signal(false);

  protected readonly guardando = signal(false);
  protected readonly erroresPorNudo = signal<Record<number, string>>({});
  protected readonly errorGeneral = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  /** Grado o año al que se quiso cambiar con cambios sin guardar. */
  protected readonly cambioPendiente = signal<CambioPendiente | null>(null);

  protected readonly configuracion = computed(() => this.porGrado()[this.grado()] ?? null);
  protected readonly nudos = computed(() => this.configuracion()?.nudos ?? []);
  protected readonly configurables = computed(() => this.nudos().filter((n) => n.configurable));
  protected readonly unaMateria = computed(() => this.nudos().filter((n) => !n.configurable));

  /** 'A y B', para decir a qué grupos aplica. */
  protected readonly grupos = computed(() => {
    const grupos = [...new Set(this.nudos().flatMap((n) => n.materias.flatMap((m) => m.grupos)))].sort();
    if (grupos.length <= 1) return grupos.join('');
    return `${grupos.slice(0, -1).join(', ')} y ${grupos.at(-1)}`;
  });

  /** 'Cátedra de Paz y Emprendimiento': las materias del grado que no tienen nudo. */
  protected readonly nombresSinNudo = computed(() => {
    const nombres = (this.configuracion()?.sinNudo ?? []).map((m) => m.nombre);
    if (nombres.length <= 1) return nombres.join('');
    return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
  });

  protected readonly hayCambios = computed(() => {
    const borrador = this.borrador();
    return this.configurables().some((nudo) =>
      nudo.materias.some((m) => this.aNumero(borrador[m.id]) !== m.peso),
    );
  });

  constructor() {
    void this.iniciar();
  }

  private async iniciar(): Promise<void> {
    try {
      const opciones = await this.servicio.opcionesPorcentajes();
      this.opciones.set(opciones);

      // Desde Nudos pedagógicos ("Revisar porcentajes") se llega con el
      // grado y el año que quedaron en promedio simple.
      const params = this.ruta.snapshot.queryParamMap;
      const grado = Number(params.get('grado'));
      const anio = Number(params.get('anio'));
      if (opciones.grados.includes(grado)) this.grado.set(grado);
      this.anio.set(opciones.anios.includes(anio) ? anio : opciones.anioSugerido);
      await this.cargarAnio();
    } catch (err) {
      this.manejarErrorDeCarga(err);
      this.cargando.set(false);
    }
  }

  /** Las seis pestañas del año, en paralelo. */
  protected async cargarAnio(): Promise<void> {
    const anio = this.anio();
    if (anio === null) {
      this.cargando.set(false);
      return;
    }

    this.cargando.set(true);
    this.error.set(null);
    this.sinPermiso.set(false);
    this.limpiarMensajes();

    try {
      const grados = this.opciones()?.grados ?? [6, 7, 8, 9, 10, 11];
      const configuraciones = await Promise.all(grados.map((g) => this.servicio.configuracion(g, anio)));
      this.porGrado.set(Object.fromEntries(configuraciones.map((c) => [c.grado, c])));
      this.reiniciarBorrador();
    } catch (err) {
      this.manejarErrorDeCarga(err);
    } finally {
      this.cargando.set(false);
    }
  }

  private reiniciarBorrador(): void {
    const borrador: Record<number, string> = {};
    for (const nudo of this.nudos()) {
      for (const materia of nudo.materias) {
        borrador[materia.id] = materia.peso === null ? '' : this.formatear(materia.peso);
      }
    }
    this.borrador.set(borrador);
  }

  private manejarErrorDeCarga(err: unknown): void {
    if (err instanceof HttpErrorResponse && err.status === 403) {
      this.sinPermiso.set(true);
      return;
    }
    this.error.set(mensajeDeError(err, 'No pudimos cargar los porcentajes.'));
  }

  private limpiarMensajes(): void {
    this.erroresPorNudo.set({});
    this.errorGeneral.set(null);
    this.aviso.set(null);
  }

  // ── Navegación entre grados ──────────────────────────────────────

  protected elegirGrado(grado: number): void {
    if (grado === this.grado()) return;

    if (this.hayCambios()) {
      this.cambioPendiente.set({ tipo: 'grado', valor: grado });
      return;
    }
    this.irAGrado(grado);
  }

  protected descartarYCambiar(): void {
    const destino = this.cambioPendiente();
    this.cambioPendiente.set(null);
    if (destino === null) return;

    if (destino.tipo === 'grado') {
      this.irAGrado(destino.valor);
    } else {
      this.anio.set(destino.valor);
      void this.cargarAnio();
    }
  }

  private irAGrado(grado: number): void {
    this.grado.set(grado);
    this.limpiarMensajes();
    this.reiniciarBorrador();
  }

  protected elegirAnio(select: HTMLSelectElement): void {
    const anio = Number(select.value);
    if (anio === this.anio()) return;

    if (this.hayCambios()) {
      // El select ya muestra el año nuevo; vuelve al actual hasta que se
      // confirme descartar.
      select.value = String(this.anio());
      this.cambioPendiente.set({ tipo: 'anio', valor: anio });
      return;
    }
    this.anio.set(anio);
    void this.cargarAnio();
  }

  /** 'Grupos A y B' / 'Grupo A', para la pestaña de cada grado. */
  protected gruposDeGrado(grado: number): string {
    const config = this.porGrado()[grado];
    const grupos = [...new Set(config?.nudos.flatMap((n) => n.materias.flatMap((m) => m.grupos)) ?? [])].sort();
    if (grupos.length === 0) return 'Sin grupos';
    if (grupos.length === 1) return `Grupo ${grupos[0]}`;
    return `Grupos ${grupos.slice(0, -1).join(', ')} y ${grupos.at(-1)}`;
  }

  /** Tono de la pestaña: mismo criterio de color que el resto del sistema. */
  protected tonoGrado(grado: number): 'ok' | 'pendiente' | 'error' | 'neutro' | 'tenue' {
    switch (this.estadoGrado(grado)) {
      case 'completo':
        return 'ok';
      case 'parcial':
        return 'pendiente';
      case 'incompleto':
        return 'error';
      case 'sin-configurar':
        return 'neutro';
      default:
        return 'tenue';
    }
  }

  /** Lo que dice la pestaña de cada grado. */
  protected estadoGrado(grado: number): EstadoGrado {
    const config = this.porGrado()[grado];
    if (!config || config.nudos.length === 0) return 'sin-materias';

    const configurables = config.nudos.filter((n) => n.configurable);
    if (configurables.length === 0) return 'sin-nudos-configurables';
    if (configurables.some((n) => n.estado === 'incompleto')) return 'incompleto';

    const ponderados = configurables.filter((n) => n.estado === 'ponderado').length;
    if (ponderados === configurables.length) return 'completo';
    return ponderados > 0 ? 'parcial' : 'sin-configurar';
  }

  protected textoEstadoGrado(grado: number): string {
    const config = this.porGrado()[grado];
    const configurables = config?.nudos.filter((n) => n.configurable) ?? [];
    const ponderados = configurables.filter((n) => n.estado === 'ponderado').length;

    switch (this.estadoGrado(grado)) {
      case 'sin-materias':
        return 'Sin asignaciones';
      case 'sin-nudos-configurables':
        return 'Nada que configurar';
      case 'completo':
        return `Configurado · ${ponderados}/${configurables.length}`;
      case 'parcial':
        return `Parcial · ${ponderados}/${configurables.length}`;
      case 'incompleto':
        return 'Revisar';
      default:
        return 'Promedio simple';
    }
  }

  // ── Edición ──────────────────────────────────────────────────────

  protected escribir(asignaturaId: number, valor: string): void {
    this.borrador.update((b) => ({ ...b, [asignaturaId]: valor }));
  }

  /** "Promedio simple": vacía los porcentajes de ese nudo. */
  protected limpiarNudo(nudo: NudoDeGrado): void {
    this.borrador.update((b) => {
      const copia = { ...b };
      for (const m of nudo.materias) copia[m.id] = '';
      return copia;
    });
  }

  /** "Repartir igual": 100 entre las materias, el resto a la primera. */
  protected repartirIgual(nudo: NudoDeGrado): void {
    const n = nudo.materias.length;
    const base = Math.floor((100 / n) * 100) / 100;
    const resto = Math.round((100 - base * n) * 100) / 100;

    this.borrador.update((b) => {
      const copia = { ...b };
      nudo.materias.forEach((m, i) => (copia[m.id] = this.formatear(i === 0 ? base + resto : base)));
      return copia;
    });
  }

  protected descartarCambios(): void {
    this.reiniciarBorrador();
    this.limpiarMensajes();
  }

  protected valor(asignaturaId: number): number | null {
    return this.aNumero(this.borrador()[asignaturaId]);
  }

  /** La suma en vivo de un nudo, o null si no hay nada escrito. */
  protected suma(nudo: NudoDeGrado): number | null {
    const valores = nudo.materias.map((m) => this.valor(m.id));
    if (valores.every((v) => v === null)) return null;
    return Math.round(valores.reduce<number>((total, v) => total + (v ?? 0), 0) * 100) / 100;
  }

  protected sumaCierra(nudo: NudoDeGrado): boolean {
    const suma = this.suma(nudo);
    return suma !== null && Math.abs(suma - 100) < 0.01;
  }

  /** Lo escrito en el nudo: vacío (promedio simple), cerrado en 100 o a medias. */
  protected estadoBorrador(nudo: NudoDeGrado): EstadoBorrador {
    const valores = nudo.materias.map((m) => this.valor(m.id));
    if (valores.every((v) => v === null)) return 'promedio-simple';
    return valores.every((v) => v !== null) && this.sumaCierra(nudo) ? 'cerrado' : 'abierto';
  }

  protected sumaExcede(nudo: NudoDeGrado): boolean {
    return (this.suma(nudo) ?? 0) > 100.01;
  }

  /** Con error en el nudo, el campo vacío es el que hay que llenar. */
  protected campoConError(nudo: NudoDeGrado, asignaturaId: number): boolean {
    return this.erroresPorNudo()[nudo.id] !== undefined && this.valor(asignaturaId) === null;
  }

  /** Ancho de la barra de suma, tope 100%. */
  protected anchoSuma(nudo: NudoDeGrado): number {
    return Math.min(this.suma(nudo) ?? 0, 100);
  }

  protected async guardar(): Promise<void> {
    const anio = this.anio();
    if (anio === null) return;

    this.guardando.set(true);
    this.limpiarMensajes();

    const grado = this.grado();

    try {
      const resultado = await this.servicio.guardarPorcentajes({
        grado,
        anio,
        // Solo los nudos con más de una materia. Un nudo con todo vacío
        // viaja con `pesos: []`, que es "volver a promedio simple".
        nudos: this.configurables().map((nudo) => ({
          nudo_id: nudo.id,
          pesos: nudo.materias
            .map((m) => ({ asignatura_id: m.id, peso: this.valor(m.id) }))
            .filter((p): p is { asignatura_id: number; peso: number } => p.peso !== null),
        })),
      });

      this.porGrado.update((todos) => ({ ...todos, [grado]: resultado }));
      this.reiniciarBorrador();
      this.aviso.set(`Porcentajes de ${grado}° guardados para ${anio}. Valen para todos sus grupos.`);
    } catch (err) {
      const detalles = detallesDeError(err);
      const porNudo: Record<number, string> = {};
      let otros: string | null = null;

      for (const [clave, mensajes] of Object.entries(detalles)) {
        const id = /^nudos\.(\d+)$/.exec(clave)?.[1];
        if (id !== undefined) {
          porNudo[Number(id)] = mensajes[0];
        } else {
          otros ??= mensajes[0];
        }
      }

      this.erroresPorNudo.set(porNudo);
      this.errorGeneral.set(
        Object.keys(porNudo).length > 0 && otros === null
          ? 'No se guardó nada: corrige los nudos marcados.'
          : (otros ?? mensajeDeError(err, 'No se pudieron guardar los porcentajes.')),
      );
    } finally {
      this.guardando.set(false);
    }
  }

  // ── Formato ──────────────────────────────────────────────────────

  /** '33,5' o '33.5' -> 33.5; vacío o inválido -> null. */
  private aNumero(texto: string | undefined): number | null {
    if (texto === undefined || texto.trim() === '') return null;
    const n = Number(texto.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  protected formatear(valor: number): string {
    return String(Math.round(valor * 100) / 100).replace('.', ',');
  }
}
