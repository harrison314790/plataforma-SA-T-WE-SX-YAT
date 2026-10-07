import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type {
  AcudienteAgregado,
  DatosMatriculas,
  EstudianteMatriculable,
  Matricula,
} from '../../../../core/interfaces/matricula.interface';
import { detallesDeError, mensajeDeError } from '../../../../core/servicios/error-api';
import { MatriculasService } from '../../../../core/servicios/matriculas.service';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';
import {
  type CatalogoCursos,
  type ChipResultado,
  chipResultado,
  curso,
  iniciales,
  motivoLegible,
  normalizar,
  plural,
  rotuloGrupo,
  sugerir,
} from '../../reglas';

/** Cuántas opciones muestra el buscador antes de pedir más letras. */
const MAX_OPCIONES = 8;

interface PosicionLista {
  top: string;
  left: string;
  ancho: string;
  altoMax: string;
}

/**
 * "Matricular estudiante": uno a la vez, con la sugerencia de grado y,
 * opcionalmente, el acudiente que matricula. "Matricular y seguir con
 * otro" deja el formulario abierto y limpio para la siguiente persona de
 * la fila -- en enero la secretaria matricula decenas seguidas.
 *
 * A diferencia del formulario de Usuarios, este GUARDA por su cuenta (y
 * también el acudiente): los dos flujos tienen errores que se pintan
 * adentro, y el resultado que le importa al padre es la matrícula ya
 * creada, que recibe por `matriculada`.
 */
@Component({
  selector: 'app-formulario-matricula',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, ModalDirective, RouterLink, TitleCasePipe],
  templateUrl: './formulario-matricula.component.html',
  host: { '(window:resize)': 'reubicarLista()' },
})
export class FormularioMatriculaComponent {
  private readonly servicio = inject(MatriculasService);

  readonly anio = input.required<number>();
  readonly catalogo = input.required<CatalogoCursos>();
  readonly datos = input.required<DatosMatriculas>();
  /** Si se abrió desde la fila de un estudiante, ya viene elegido. */
  readonly estudianteInicial = input<string | null>(null);
  readonly sinConexion = input(false);

  readonly matriculada = output<{ matricula: Matricula; seguir: boolean }>();
  readonly acudienteAgregado = output<{ estudianteId: string; agregado: AcudienteAgregado }>();
  readonly cerrar = output<{ guardadas: number; ultima: string | null }>();

  private readonly campoBusqueda = viewChild<ElementRef<HTMLInputElement>>('campoBusqueda');
  private readonly campoAcudiente = viewChild<ElementRef<HTMLInputElement>>('campoAcudiente');

  protected readonly curso = curso;
  protected readonly iniciales = iniciales;
  protected readonly plural = plural;
  protected readonly rotuloGrupo = rotuloGrupo;

  // ── Estado del formulario ──
  protected readonly estudianteId = signal<string | null>(null);
  protected readonly busqueda = signal('');
  protected readonly listaAbierta = signal(false);
  protected readonly resaltada = signal(0);
  protected readonly posicionLista = signal<PosicionLista>({ top: '0', left: '0', ancho: '0', altoMax: '0' });

  protected readonly sedeId = signal<number | null>(null);
  protected readonly grado = signal<number | null>(null);
  protected readonly grupo = signal('');
  protected readonly acudienteId = signal('');

  protected readonly errores = signal<Record<string, string>>({});
  protected readonly errorGeneral = signal<string | null>(null);
  protected readonly guardando = signal(false);

  /** La tanda de "Matricular y seguir con otro". */
  protected readonly guardadas = signal(0);
  protected readonly ultima = signal<string | null>(null);

  // ── Acudiente nuevo ──
  protected readonly acudienteAbierto = signal(false);
  protected readonly acParentesco = signal<'madre' | 'padre' | ''>('');
  protected readonly acNombres = signal('');
  protected readonly acApellidos = signal('');
  protected readonly acDocumento = signal('');
  protected readonly acCelular = signal('');
  protected readonly acErrores = signal<Record<string, string>>({});
  protected readonly acGuardando = signal(false);
  protected readonly acMensaje = signal<string | null>(null);

  constructor() {
    // `input()` no tiene valor en el constructor; un microtick después sí.
    queueMicrotask(() => {
      const inicial = this.estudianteInicial();
      if (inicial !== null) this.elegirEstudiante(inicial);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Derivados
  // ─────────────────────────────────────────────────────────────

  protected readonly estudiante = computed<EstudianteMatriculable | null>(() =>
    this.datos().estudiantes.find((e) => e.id === this.estudianteId()) ?? null,
  );

  protected readonly sugerencia = computed(() => {
    const id = this.estudianteId();
    if (id === null) return null;
    const d = this.datos();
    return sugerir(id, d.matriculas, this.anio(), d.resultados, this.catalogo());
  });

  /** Su matrícula activa en el año elegido, si ya tiene una. */
  protected readonly yaMatriculado = computed(() => {
    const id = this.estudianteId();
    return this.datos().matriculas.find((m) => m.estudianteId === id && m.anio === this.anio() && m.estado === 'activa') ?? null;
  });

  protected readonly bloqueado = computed(
    () => this.yaMatriculado() !== null || this.sugerencia()?.tipo === 'graduado',
  );

  protected readonly coincidencias = computed(() => {
    const termino = normalizar(this.busqueda().trim());
    return this.datos().estudiantes.filter((e) =>
      !termino ||
      normalizar(`${e.nombres} ${e.apellidos}`).includes(termino) ||
      normalizar(`${e.apellidos} ${e.nombres}`).includes(termino) ||
      e.documento.includes(termino),
    );
  });

  protected readonly opcionesVisibles = computed(() =>
    this.coincidencias().slice(0, MAX_OPCIONES).map((e) => ({ e, estado: this.estadoDe(e) })),
  );

  protected readonly textoCampo = computed(() => {
    if (this.listaAbierta()) return this.busqueda();
    const e = this.estudiante();
    return e ? `${e.nombres} ${e.apellidos}` : '';
  });

  /** La ficha: de dónde viene y cómo le fue. */
  protected readonly ficha = computed(() => {
    const e = this.estudiante();
    const s = this.sugerencia();
    if (e === null || s === null) return null;

    const a = s.anterior;
    let chip: ChipResultado | null = null;
    if (s.tipo === 'retirado' && a) chip = { texto: `Retirado · ${motivoLegible(a)}`, icono: '–', clase: 'retirado' };
    else if (a) chip = chipResultado(s.resultado, a.grado);

    return {
      anterior: a ? `${this.catalogo().nombreSede(a.sedeId)} · ${curso(a.grado, a.grupo)}` : 'Sin matrícula anterior en el sistema',
      chip,
    };
  });

  protected readonly grados = computed(() => {
    const sede = this.sedeId();
    return sede === null ? [] : this.catalogo().grados(sede);
  });

  protected readonly grupos = computed(() => {
    const sede = this.sedeId();
    const grado = this.grado();
    return sede === null || grado === null ? [] : this.catalogo().grupos(sede, grado);
  });

  protected readonly sinGrupos = computed(() => this.sedeId() !== null && this.grado() !== null && this.grupos().length === 0);

  protected readonly esSugerido = computed(() => {
    const s = this.sugerencia();
    return !!s && s.grado !== null && this.sedeId() === s.sedeId && this.grado() === s.grado;
  });

  protected readonly cambioLaSugerencia = computed(() => {
    const s = this.sugerencia();
    return !!s && s.grado !== null && this.grado() !== null && !this.esSugerido();
  });

  protected readonly razon = computed(() => {
    const s = this.sugerencia();
    const a = s?.anterior;
    const anterior = this.anio() - 1;
    if (!s) return '';
    switch (s.tipo) {
      case 'promovido':
        return `Aprobó ${a!.grado}° en ${anterior}, así que se sugiere ${s.grado}°.`;
      case 'repite':
        return `No aprobó ${a!.grado}° en ${anterior}, así que se sugiere repetir ${a!.grado}°.`;
      case 'provisional':
        return a!.grado === 11
          ? `Cursa 11° y su año ${anterior} sigue en progreso: si aprueba, se gradúa y no hay que matricularlo.`
          : `Su año ${anterior} sigue en progreso. Se sugiere ${s.grado}° suponiendo que apruebe.`;
      case 'retirado':
        return `Se retiró en ${anterior} sin terminar ${a!.grado}°; se sugiere volver a ${a!.grado}°.`;
      case 'nuevo':
        return `No tiene matrícula en ${anterior}: elige la sede, el grado y el grupo.`;
      default:
        return '';
    }
  });

  protected readonly textoSugerenciaOriginal = computed(() => {
    const s = this.sugerencia();
    return s && s.grado !== null ? `era ${curso(s.grado, s.grupo || '?')}, ${this.catalogo().nombreSede(s.sedeId)}` : '';
  });

  /** Madre o padre que todavía se pueden agregar (uno de cada uno). */
  protected readonly parentescosLibres = computed(() => {
    const tiene = new Set(this.estudiante()?.acudientes.map((a) => a.parentesco.toLowerCase()) ?? []);
    return (['madre', 'padre'] as const).filter((p) => !tiene.has(p));
  });

  protected readonly puedeGuardar = computed(
    () => !this.sinConexion() && !this.guardando() && !this.bloqueado() && !this.sinGrupos(),
  );

  protected readonly subtitulo = computed(() =>
    this.guardadas() > 0
      ? `Año escolar ${this.anio()} · llevas ${plural(this.guardadas(), 'matrícula', 'matrículas')} en esta tanda`
      : `Año escolar ${this.anio()} · solo estudiantes con cuenta`,
  );

  // ─────────────────────────────────────────────────────────────
  // Buscador de estudiante (combobox)
  // ─────────────────────────────────────────────────────────────

  /** Lo que dice cada opción a la derecha: ya matriculado, graduado, pendiente... */
  private estadoDe(e: EstudianteMatriculable): { texto: string; pendiente: boolean } {
    const d = this.datos();
    const actual = d.matriculas.find((m) => m.estudianteId === e.id && m.anio === this.anio() && m.estado === 'activa');
    if (actual) return { texto: `Ya matriculado · ${curso(actual.grado, actual.grupo)}`, pendiente: false };

    const s = sugerir(e.id, d.matriculas, this.anio(), d.resultados, this.catalogo());
    switch (s.tipo) {
      case 'graduado': return { texto: 'Graduado', pendiente: false };
      case 'nuevo': return { texto: 'Sin matrícula anterior', pendiente: false };
      case 'retirado': return { texto: `Retirado en ${this.anio() - 1}`, pendiente: false };
      default: return { texto: 'Por matricular', pendiente: true };
    }
  }

  /*
   * OJO: estos dos manejadores son métodos y no expresiones como
   * `estudianteId() === null && abrirLista()` en el template. Si una
   * expresión de evento de Angular vale `false`, Angular llama a
   * `preventDefault()` -- así fue como el velo del modal anulaba el foco
   * de cada clic dentro del formulario (no se podía pasar de Nombres a
   * Apellidos con el mouse).
   */
  protected alEnfocarBusqueda(): void {
    if (this.estudianteId() === null) this.abrirLista();
  }

  protected alPulsarBusqueda(): void {
    if (!this.listaAbierta()) this.abrirLista();
  }

  /**
   * Se abre al enfocar solo si no hay nadie elegido: abierto desde la fila
   * de un estudiante, el foco automático del modal cae en este campo, y
   * desplegar la lista taparía justo la ficha que se quiere revisar. Con
   * alguien elegido, la lista se abre con clic, flecha abajo o al escribir.
   */
  protected abrirLista(): void {
    this.busqueda.set('');
    this.resaltada.set(0);
    this.listaAbierta.set(true);
    this.reubicarLista();
    // Y otra vez tras el render: al limpiar el formulario ("seguir con
    // otro") el modal se encoge y se recentra, y el campo ya no está donde
    // estaba cuando se calculó la primera posición.
    requestAnimationFrame(() => this.reubicarLista());
  }

  protected escribir(texto: string): void {
    this.busqueda.set(texto);
    this.resaltada.set(0);
    this.listaAbierta.set(true);
    this.reubicarLista();
  }

  protected cerrarListaLuego(): void {
    // El `mousedown` de una opción llega antes que el blur; el retraso deja
    // que la elección se registre antes de cerrar.
    setTimeout(() => this.listaAbierta.set(false), 120);
  }

  protected teclaEnBusqueda(evento: KeyboardEvent): void {
    const total = this.opcionesVisibles().length;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      if (!this.listaAbierta()) this.abrirLista();
      else this.resaltada.update((i) => Math.min(i + 1, total - 1));
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      this.resaltada.update((i) => Math.max(i - 1, 0));
    } else if (evento.key === 'Enter') {
      const opcion = this.opcionesVisibles()[this.resaltada()];
      if (this.listaAbierta() && opcion) {
        evento.preventDefault();
        this.elegirEstudiante(opcion.e.id);
      }
    } else if (evento.key === 'Escape' && this.listaAbierta()) {
      // Escape cierra la lista, no el modal entero.
      evento.preventDefault();
      evento.stopPropagation();
      this.listaAbierta.set(false);
    }
  }

  /**
   * La lista va en `position: fixed` calculada desde el campo: dentro del
   * cuerpo del modal (que tiene scroll propio) quedaría recortada. Se abre
   * hacia arriba si abajo no cabe.
   */
  protected reubicarLista(): void {
    const campo = this.campoBusqueda()?.nativeElement;
    if (!campo || !this.listaAbierta()) return;

    const caja = campo.getBoundingClientRect();
    const abajo = window.innerHeight - caja.bottom - 16;
    const arriba = caja.top - 16;

    if (abajo < 180 && arriba > abajo) {
      const alto = Math.min(300, arriba);
      this.posicionLista.set({ top: `${Math.max(8, caja.top - 6 - alto)}px`, left: `${caja.left}px`, ancho: `${caja.width}px`, altoMax: `${alto}px` });
    } else {
      this.posicionLista.set({ top: `${caja.bottom + 6}px`, left: `${caja.left}px`, ancho: `${caja.width}px`, altoMax: `${Math.max(120, Math.min(300, abajo))}px` });
    }
  }

  /** Elegir a alguien precarga la sugerencia: sede, grado y grupo. */
  protected elegirEstudiante(id: string): void {
    this.estudianteId.set(id);
    this.listaAbierta.set(false);
    this.busqueda.set('');
    this.errores.set({});
    this.errorGeneral.set(null);
    this.cerrarAcudiente();
    this.acMensaje.set(null);
    // Si ya tiene acudientes, queda elegido el principal (el backend los
    // manda primero): casi siempre es quien viene a matricular, y así la
    // secretaria no tiene que buscarlo en la lista cada vez.
    this.acudienteId.set(this.estudiante()?.acudientes[0]?.id ?? '');
    this.restaurarSugerencia();
  }

  // ─────────────────────────────────────────────────────────────
  // Sede, grado, grupo
  // ─────────────────────────────────────────────────────────────

  protected restaurarSugerencia(): void {
    const s = this.sugerencia();
    this.sedeId.set(s?.sedeId ?? null);
    this.grado.set(s?.grado ?? null);
    this.grupo.set(s?.grupo ?? '');
    this.errores.set({});
  }

  protected elegirSede(valor: string): void {
    this.errores.set({});
    if (!valor) {
      this.sedeId.set(null);
      this.grado.set(null);
      this.grupo.set('');
      return;
    }

    const sede = Number(valor);
    const grados = this.catalogo().grados(sede);
    const sugerido = this.sugerencia()?.grado ?? null;
    // Conserva el grado si la sede nueva lo tiene; si no, el sugerido; si no, ninguno.
    const grado = this.grado() !== null && grados.includes(this.grado()!)
      ? this.grado()
      : sugerido !== null && grados.includes(sugerido) ? sugerido : null;

    this.sedeId.set(sede);
    this.grado.set(grado);
    this.grupo.set(grado !== null ? this.catalogo().grupoAutomatico(sede, grado, this.sugerencia()?.grupo) : '');
  }

  protected elegirGrado(valor: string): void {
    this.errores.set({});
    const grado = valor ? Number(valor) : null;
    this.grado.set(grado);
    const sede = this.sedeId();
    this.grupo.set(grado !== null && sede !== null ? this.catalogo().grupoAutomatico(sede, grado, this.sugerencia()?.grupo) : '');
  }

  protected elegirGrupo(valor: string): void {
    this.errores.set({});
    this.grupo.set(valor);
  }

  // ─────────────────────────────────────────────────────────────
  // Acudiente nuevo
  // ─────────────────────────────────────────────────────────────

  protected abrirAcudiente(): void {
    this.acudienteAbierto.set(true);
    this.acParentesco.set(this.parentescosLibres()[0] ?? '');
    this.acNombres.set('');
    this.acApellidos.set('');
    this.acDocumento.set('');
    this.acCelular.set('');
    this.acErrores.set({});
    this.acMensaje.set(null);
    setTimeout(() => this.campoAcudiente()?.nativeElement.focus(), 0);
  }

  protected cerrarAcudiente(): void {
    this.acudienteAbierto.set(false);
    this.acErrores.set({});
  }

  protected escribirDocumento(valor: string, campo: HTMLInputElement): void {
    const limpio = valor.replace(/\D/g, '').slice(0, 10);
    this.acDocumento.set(limpio);
    campo.value = limpio;
    this.acErrores.update(({ documento: _, ...resto }) => resto);
  }

  /** "300 123 4567" mientras se escribe: se dicta así, se lee así. */
  protected escribirCelular(valor: string, campo: HTMLInputElement): void {
    const d = valor.replace(/\D/g, '').slice(0, 10);
    const formato = d.length > 6 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
    this.acCelular.set(formato);
    campo.value = formato;
    this.acErrores.update(({ telefono: _, ...resto }) => resto);
  }

  protected async agregarAcudiente(): Promise<void> {
    const estudiante = this.estudiante();
    if (estudiante === null || this.acGuardando()) return;

    // La misma validación que el backend, para no hacer esperar un round-trip.
    const errores: Record<string, string> = {};
    const documento = this.acDocumento();
    const celular = this.acCelular().replace(/\D/g, '');
    if (!this.acParentesco()) errores['parentesco'] = 'Elige si es la madre o el padre.';
    if (this.acNombres().trim().length < 2) errores['nombres'] = 'Escribe los nombres.';
    if (this.acApellidos().trim().length < 2) errores['apellidos'] = 'Escribe los apellidos.';
    if (!/^\d{6,10}$/.test(documento)) errores['documento'] = 'De 6 a 10 dígitos, sin puntos.';
    if (!/^3\d{9}$/.test(celular)) errores['telefono'] = '10 dígitos y empieza por 3.';
    if (Object.keys(errores).length) {
      this.acErrores.set(errores);
      return;
    }

    this.acGuardando.set(true);
    try {
      const agregado = await this.servicio.agregarAcudiente({
        estudiante_id: estudiante.id,
        parentesco: this.acParentesco() as 'madre' | 'padre',
        nombres: this.acNombres(),
        apellidos: this.acApellidos(),
        documento,
        telefono: celular,
      });
      this.acudienteAgregado.emit({ estudianteId: estudiante.id, agregado });
      this.acudienteId.set(agregado.acudiente.id);
      this.acudienteAbierto.set(false);
      const a = agregado.acudiente;
      this.acMensaje.set(agregado.yaExistia
        ? `${a.nombre} (CC ${a.documento}) ya estaba registrado como acudiente de otro estudiante: quedó vinculado también a ${estudiante.nombres} y elegido como acudiente que matricula.`
        : `${a.nombre} (${a.parentesco}, CC ${a.documento}) quedó registrado y elegido como acudiente que matricula.`);
    } catch (err) {
      const detalles = detallesDeError(err);
      if (Object.keys(detalles).length) {
        this.acErrores.set(Object.fromEntries(Object.entries(detalles).map(([k, v]) => [k, v[0]])));
      } else {
        this.acErrores.set({ general: mensajeDeError(err, 'No se pudo registrar el acudiente.') });
      }
    } finally {
      this.acGuardando.set(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Guardar
  // ─────────────────────────────────────────────────────────────

  protected async guardar(seguir: boolean): Promise<void> {
    if (!this.puedeGuardar()) return;

    const e = this.estudiante();
    const errores: Record<string, string> = {};
    if (e === null) errores['estudiante'] = 'Busca y elige al estudiante.';
    else {
      if (this.sedeId() === null) errores['sede'] = 'Elige la sede.';
      if (this.grado() === null) errores['grado'] = 'Elige el grado.';
      else if (!this.grupo()) errores['grupo'] = 'Elige el grupo.';
    }
    if (Object.keys(errores).length) {
      this.errores.set(errores);
      return;
    }

    this.guardando.set(true);
    this.errorGeneral.set(null);
    try {
      const matricula = await this.servicio.matricular({
        estudiante_id: e!.id,
        anio: this.anio(),
        sede_id: this.sedeId()!,
        grado: this.grado()!,
        grupo: this.grupo(),
        acudiente_id: this.acudienteId() || null,
      });

      this.guardadas.update((n) => n + 1);
      this.ultima.set(`${e!.nombres} ${e!.apellidos} en ${curso(matricula.grado, matricula.grupo)}, ${this.catalogo().nombreSede(matricula.sedeId)}`);
      this.matriculada.emit({ matricula, seguir });

      if (seguir) {
        this.estudianteId.set(null);
        this.sedeId.set(null);
        this.grado.set(null);
        this.grupo.set('');
        this.acudienteId.set('');
        this.acMensaje.set(null);
        this.campoBusqueda()?.nativeElement.focus();
      } else {
        this.cerrar.emit({ guardadas: this.guardadas(), ultima: this.ultima() });
      }
    } catch (err) {
      const detalles = detallesDeError(err);
      const porCampo: Record<string, string> = {};
      for (const [campo, mensajes] of Object.entries(detalles)) {
        porCampo[campo.replace('_id', '')] = mensajes[0];
      }
      this.errores.set(porCampo);
      this.errorGeneral.set(Object.keys(porCampo).length ? null : mensajeDeError(err, 'No se pudo guardar la matrícula.'));
    } finally {
      this.guardando.set(false);
    }
  }

  protected terminar(): void {
    this.cerrar.emit({ guardadas: this.guardadas(), ultima: this.ultima() });
  }
}
