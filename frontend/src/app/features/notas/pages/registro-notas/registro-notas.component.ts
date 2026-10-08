import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import type {
  AsignacionDelProfesor,
  EstudianteDelCurso,
  NotaGuardada,
  PeriodoNotas,
  RegistroProfesor,
} from '../../../../core/interfaces/nota.interface';
import { AuthService } from '../../../../core/servicios/auth.service';
import { ConexionService } from '../../../../core/servicios/conexion.service';
import { mensajeDeError } from '../../../../core/servicios/error-api';
import { NotasService } from '../../../../core/servicios/notas.service';
import { SinPermisoComponent } from '../../../../shared/componentes/sin-permiso/sin-permiso.component';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';
import { DialogoRevisarNotasComponent, type NotaARevisar } from '../../componentes/dialogo-revisar-notas/dialogo-revisar-notas.component';
import {
  CHIP_AVANCE,
  RelojServidor,
  cargaGeneralAbierta,
  curso,
  desempeno,
  diaHora,
  duracion,
  estadoAvance,
  falta,
  leerNota,
  limpiarEntrada,
  nombreCompleto,
  normalizarNota,
  plural,
  prorrogaVigente,
  unDecimal,
} from '../../reglas';

/** Lo que el profesor quiso hacer y quedó en pausa por tener notas sin guardar. */
type Accion = { tipo: 'volver' } | { tipo: 'periodo'; id: number } | { tipo: 'curso'; id: string };

type VarianteBanda = 'ok' | 'por-vencer' | 'prorroga' | 'cerrada' | 'pasado' | 'futuro';

/**
 * Los borradores viven en `localStorage`, por usuario: los equipos de las
 * escuelas son compartidos, y sin el id de quien escribe, la profesora de
 * la tarde vería las notas a medio escribir del profesor de la mañana.
 */
const CLAVE_BORRADORES = 'notas-borradores-v1';

/**
 * "Registro de notas": la pantalla del profesor. Calcada del mockup
 * aprobado ("Notas - Módulo.html", vista profesor).
 *
 * Dos vistas en la misma pantalla: "Mis cursos" (una fila por asignación,
 * con su avance) y la captura de un curso (la tabla de estudiantes).
 *
 * REGLAS QUE ESTA PANTALLA SOLO REFLEJA. El plazo, la prórroga y "una
 * nota por estudiante, asignación y período" los decide el backend (y RLS
 * por debajo). Acá se calculan para decir la verdad antes de intentar:
 * el botón dice "Ver notas" cuando ya no se puede registrar. Si la
 * pantalla se equivoca (el reloj, una carga recién cerrada), el backend
 * responde con un mensaje y eso es lo que se muestra.
 *
 * BORRADORES LOCALES. Lo que se escribe se guarda en `localStorage` en
 * cada tecla: si se cae la señal o se recarga, no se pierde. Sin
 * conexión se puede seguir escribiendo; lo que no se puede es guardar.
 *
 * LOS CINCO ESTADOS: cargando (filas de esqueleto) · vacío (sin
 * asignaciones) · error (Reintentar) · sin permiso (403 en vuelo) · sin
 * conexión (se escribe como borrador, no se guarda; el aviso global lo
 * pone el shell).
 */
@Component({
  selector: 'app-registro-notas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogoRevisarNotasComponent, ModalDirective, SinPermisoComponent],
  templateUrl: './registro-notas.component.html',
})
export class RegistroNotasComponent {
  private readonly servicio = inject(NotasService);
  private readonly auth = inject(AuthService);
  private readonly conexion = inject(ConexionService);

  protected readonly enLinea = this.conexion.enLinea;
  protected readonly plural = plural;
  protected readonly curso = curso;
  protected readonly anchosEsqueleto = [['18%', '12%'], ['22%', '10%'], ['16%', '14%'], ['20%', '12%'], ['24%', '9%']];

  private readonly reloj = new RelojServidor();
  /** Se mueve cada 30 s: la banda pasa sola de "abierta" a "por vencer" a "cerrada". */
  private readonly tic = signal(0);

  protected readonly datos = signal<RegistroProfesor | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly sinPermiso = signal(false);

  protected readonly cursoAbierto = signal<string | null>(null);
  protected readonly borradores = signal<Record<string, string>>({});
  protected readonly revisando = signal(false);
  protected readonly pendiente = signal<Accion | null>(null);
  protected readonly aviso = signal<{ tipo: 'ok' | 'neutral'; texto: string } | null>(null);
  protected readonly resaltadas = signal<ReadonlySet<string>>(new Set());

  private readonly campos = viewChildren<ElementRef<HTMLInputElement>>('campoNota');
  private readonly botonRevisar = viewChild<ElementRef<HTMLButtonElement>>('botonRevisar');

  constructor() {
    const id = window.setInterval(() => this.tic.update((n) => n + 1), 30_000);
    inject(DestroyRef).onDestroy(() => window.clearInterval(id));

    this.borradores.set(this.leerBorradores());
    void this.cargar(null);
  }

  // ─────────────────────────────────────────────────────────────
  // Derivados
  // ─────────────────────────────────────────────────────────────

  private readonly ahora = computed(() => {
    this.tic();
    this.datos();
    return this.reloj.ahora();
  });

  protected readonly periodo = computed<PeriodoNotas | null>(() => this.datos()?.periodo ?? null);
  private readonly esActivo = computed(() => this.periodo()?.estado === 'activo');
  private readonly generalAbierta = computed(() => {
    const p = this.periodo();
    return p !== null && cargaGeneralAbierta(p, this.ahora());
  });

  protected readonly opcionesPeriodo = computed(() =>
    (this.datos()?.periodos ?? []).map((p) => ({
      id: p.id,
      rotulo: `${p.nombre} · ${p.epoca} Época${p.estado === 'activo' ? ' (activo)' : p.estado === 'futuro' ? ' (aún no empieza)' : ''}`,
    })),
  );

  /** ¿Este profesor puede registrar notas en esta asignación AHORA? */
  private puede(a: AsignacionDelProfesor): boolean {
    return this.esActivo() && (this.generalAbierta() || prorrogaVigente(a.prorroga, this.ahora()));
  }

  /** La banda del plazo, siempre visible: abierta, por vencer, con prórroga o cerrada. */
  protected readonly banda = computed<{ variante: VarianteBanda; icono: string; titulo: string; texto: string } | null>(() => {
    const p = this.periodo();
    const datos = this.datos();
    if (p === null || datos === null) return null;
    const ahora = this.ahora();

    if (p.estado === 'cerrado') {
      return {
        variante: 'pasado', icono: '–',
        titulo: `Período ${p.nombre} cerrado · solo consulta`,
        texto: 'Puedes ver las notas que registraste. Para corregir alguna, habla con coordinación.',
      };
    }
    if (p.estado === 'futuro') {
      return {
        variante: 'futuro', icono: '○',
        titulo: `Período ${p.nombre} aún no empieza`,
        texto: 'La carga se abre cuando coordinación la habilite.',
      };
    }

    const limite = p.fechaLimiteNotas;
    if (this.generalAbierta() && limite) {
      const horas = (Date.parse(limite) - ahora.getTime()) / 36e5;
      if (horas < 48) {
        return {
          variante: 'por-vencer', icono: '!',
          titulo: `Quedan ${duracion(Date.parse(limite) - ahora.getTime())} para subir notas`,
          texto: `La carga del período ${p.nombre} cierra el ${diaHora(limite)}. Después no podrás registrar las notas que falten.`,
        };
      }
      return {
        variante: 'ok', icono: '✓',
        titulo: `Carga abierta · Período ${p.nombre}`,
        texto: `Cierra el ${diaHora(limite)} (${falta(limite, ahora)}).`,
      };
    }

    const conProrroga = datos.asignaciones.filter((a) => prorrogaVigente(a.prorroga, ahora));
    const cierre = p.notasHabilitadas && limite ? `El cierre general fue el ${diaHora(limite)}.` : 'Coordinación cerró la carga general.';

    if (conProrroga.length > 0) {
      const hasta = conProrroga.map((a) => a.prorroga!.hasta).sort().at(-1)!;
      const cursos = conProrroga.map((a) => `${a.materia} ${curso(a.grado, a.grupo)}`);
      const lista = cursos.length <= 1 ? cursos.join('') : `${cursos.slice(0, -1).join(', ')} y ${cursos.at(-1)}`;
      return {
        variante: 'prorroga', icono: '+',
        titulo: `Prórroga hasta el ${diaHora(hasta)} (${falta(hasta, ahora)})`,
        texto: `Autorizada por ${conProrroga[0].prorroga!.autorizadoPor} para ${lista}. ${cierre}`,
      };
    }

    return {
      variante: 'cerrada', icono: '✕',
      titulo: 'La carga de notas está cerrada',
      texto: `${p.notasHabilitadas && limite ? `Cerró el ${diaHora(limite)}.` : 'Coordinación cerró la carga del período.'} Si te faltan notas, comunícate con coordinación.`,
    };
  });

  /** "Mis cursos": una fila por asignación. */
  protected readonly cursos = computed(() =>
    (this.datos()?.asignaciones ?? []).map((a) => {
      const total = a.estudiantes.length;
      const conNota = a.estudiantes.filter((e) => e.nota !== null).length;
      const estado = estadoAvance(conNota, total);
      const prorroga = this.esActivo() && !this.generalAbierta() && prorrogaVigente(a.prorroga, this.ahora()) ? a.prorroga : null;
      const puedeRegistrar = this.puede(a) && conNota < total;

      return {
        a,
        curso: curso(a.grado, a.grupo),
        progreso: `${conNota} de ${plural(total, 'estudiante', 'estudiantes')} con nota`,
        fraccion: `${conNota}/${total}`,
        porcentaje: total ? (conNota / total) * 100 : 0,
        estado,
        chip: CHIP_AVANCE[estado],
        prorroga: prorroga ? `Prórroga hasta ${diaHora(prorroga.hasta)}` : null,
        borradores: this.esActivo() ? this.borradoresDe(a).length : 0,
        puedeRegistrar,
      };
    }),
  );

  protected readonly cursoActual = computed(() => this.cursos().find((c) => c.a.id === this.cursoAbierto()) ?? null);

  protected readonly asignacion = computed(
    () => this.datos()?.asignaciones.find((a) => a.id === this.cursoAbierto()) ?? null,
  );

  protected readonly editable = computed(() => {
    const a = this.asignacion();
    return a !== null && this.puede(a);
  });

  /** Las filas de la captura, con lo escrito, su lectura y su desempeño. */
  protected readonly filas = computed(() => {
    const a = this.asignacion();
    const p = this.periodo();
    if (a === null || p === null) return [];
    const editable = this.editable();
    const borr = this.borradores();

    return a.estudiantes.map((e, i) => {
      const n = e.nota;
      const puedeEscribir = !n && editable && !e.retirado;
      const texto = puedeEscribir ? (borr[this.claveBorrador(a.id, e.id)] ?? '') : '';
      const lectura = leerNota(texto);
      const valor = n ? n.valor : lectura.estado === 'ok' ? lectura.valor : null;

      let registro: string;
      if (n) registro = n.corregidaEn ? `Corregida por coordinación el ${diaHora(n.corregidaEn)}` : `Registrada el ${diaHora(n.registradaEn!)}`;
      else if (texto && lectura.estado === 'ok') registro = this.enLinea() ? 'Sin guardar' : 'Borrador · guardado en este equipo';
      else if (e.retirado) registro = 'Retirado del curso';
      else if (editable) registro = 'Falta';
      else registro = p.estado === 'activo' ? 'Carga cerrada' : '';

      return {
        e,
        numero: i + 1,
        nombre: nombreCompleto(e),
        bloqueada: n !== null,
        valorBloqueado: n ? unDecimal(n.valor) : '',
        puedeEscribir,
        texto,
        error: lectura.estado === 'error' ? lectura.mensaje : '',
        borrador: puedeEscribir && lectura.estado === 'ok',
        sinNota: !n && !puedeEscribir,
        textoSinNota: e.retirado ? 'Retirado' : p.estado === 'activo' ? 'Falta · carga cerrada' : p.estado === 'futuro' ? 'Aún no se registra' : 'Sin nota',
        desempeno: valor !== null ? desempeno(valor) : null,
        registro,
        resaltada: this.resaltadas().has(e.id),
      };
    });
  });

  /** Lo listo para guardar (escrito y válido) y lo que tiene error. */
  protected readonly resumen = computed(() => {
    const filas = this.filas();
    const listas: NotaARevisar[] = [];
    let errores = 0;
    for (const f of filas) {
      if (!f.puedeEscribir || !f.texto) continue;
      const l = leerNota(f.texto);
      if (l.estado === 'ok') listas.push({ estudianteId: f.e.id, nombre: f.nombre, valor: l.valor });
      else errores++;
    }
    const faltan = filas.filter((f) => f.puedeEscribir).length;
    return { listas, errores, faltan };
  });

  protected readonly pie = computed(() => {
    const { listas, errores, faltan } = this.resumen();
    const n = listas.length;
    return {
      texto: errores
        ? `${plural(errores, 'nota tiene', 'notas tienen')} un error · corrígela antes de guardar`
        : n
          ? `${plural(n, 'nota escrita', 'notas escritas')} sin guardar${this.enLinea() ? '' : ' · guardadas en este equipo'}`
          : `${faltan === 1 ? 'Falta 1 nota' : `Faltan ${faltan} notas`} · escribe y luego revisa`,
      tono: errores ? 'error' : n ? 'borrador' : 'vacio',
      hayBorrador: n + errores > 0,
      deshabilitado: n === 0 || errores > 0,
      motivo: errores ? 'Corrige las notas marcadas' : n === 0 ? 'Escribe al menos una nota' : '',
      boton: n ? `Revisar y guardar (${n})` : 'Revisar y guardar',
    };
  });

  protected readonly mostrarPie = computed(() => this.editable() && this.resumen().faltan > 0);

  // ─────────────────────────────────────────────────────────────
  // Carga
  // ─────────────────────────────────────────────────────────────

  async cargar(periodoId: number | null): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const datos = await this.servicio.registro(periodoId);
      this.reloj.sincronizar(datos.ahora);
      this.datos.set(datos);
      if (this.cursoAbierto() && !datos.asignaciones.some((a) => a.id === this.cursoAbierto())) {
        this.cursoAbierto.set(null);
      }
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 403) this.sinPermiso.set(true);
      else this.error.set(mensajeDeError(err, 'No pudimos cargar tus cursos.'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected reintentar(): void {
    void this.cargar(this.periodo()?.id ?? null);
  }

  // ─────────────────────────────────────────────────────────────
  // Navegación con aviso de cambios sin guardar
  // ─────────────────────────────────────────────────────────────

  protected pedir(accion: Accion): void {
    const a = this.asignacion();
    if (a !== null && this.esActivo() && this.borradoresDe(a).length > 0) {
      this.pendiente.set(accion);
      return;
    }
    this.hacer(accion);
  }

  protected hacer(accion: Accion): void {
    this.pendiente.set(null);
    this.aviso.set(null);
    if (accion.tipo === 'volver') this.cursoAbierto.set(null);
    else if (accion.tipo === 'curso') this.cursoAbierto.set(accion.id);
    else void this.cargar(accion.id);
    window.scrollTo({ top: 0 });
  }

  protected elegirPeriodo(valor: string): void {
    this.pedir({ tipo: 'periodo', id: Number(valor) });
  }

  protected readonly textoPendiente = computed(() => {
    const a = this.asignacion();
    if (a === null) return { titulo: '', texto: '' };
    const n = this.borradoresDe(a).length;
    return {
      titulo: `Tienes ${plural(n, 'nota', 'notas')} sin guardar`,
      texto: `En ${a.materia} ${curso(a.grado, a.grupo)} escribiste ${plural(n, 'nota que no has guardado', 'notas que no has guardado')}. Si sales, quedan como borrador en este equipo, pero NO están registradas.`,
    };
  });

  // ─────────────────────────────────────────────────────────────
  // Captura
  // ─────────────────────────────────────────────────────────────

  protected escribir(estudianteId: string, evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const limpio = limpiarEntrada(campo.value);
    if (limpio !== campo.value) campo.value = limpio;
    this.ponerBorrador(estudianteId, limpio);
  }

  protected alSalir(estudianteId: string): void {
    const a = this.asignacion();
    if (a === null) return;
    const actual = this.borradores()[this.claveBorrador(a.id, estudianteId)] ?? '';
    const normal = normalizarNota(actual);
    if (normal !== actual) this.ponerBorrador(estudianteId, normal);
  }

  /** Enter o ↓ baja (y normaliza "45" -> "4,5"), ↑ sube. Desde la última fila, a "Revisar y guardar". */
  protected tecla(estudianteId: string, evento: KeyboardEvent): void {
    const campos = this.campos().map((c) => c.nativeElement);
    const i = campos.indexOf(evento.target as HTMLInputElement);

    if (evento.key === 'Enter' || evento.key === 'ArrowDown') {
      evento.preventDefault();
      this.alSalir(estudianteId);
      const siguiente = campos[i + 1];
      if (siguiente) {
        siguiente.focus();
        siguiente.select();
      } else {
        // El botón puede estar deshabilitado (nada escrito todavía): igual
        // se intenta, y si no recibe foco el campo se queda donde estaba.
        this.botonRevisar()?.nativeElement.focus();
      }
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      const anterior = campos[i - 1];
      if (anterior) {
        anterior.focus();
        anterior.select();
      }
    }
  }

  protected descartar(): void {
    const a = this.asignacion();
    if (a === null) return;
    const prefijo = `${this.prefijoBorrador()}${a.id}|`;
    const quedan = Object.fromEntries(Object.entries(this.borradores()).filter(([k]) => !k.startsWith(prefijo)));
    this.guardarBorradores(quedan);
  }

  protected abrirRevision(): void {
    if (!this.pie().deshabilitado) this.revisando.set(true);
  }

  /** Lo llama el diálogo de revisión cuando el backend confirmó. */
  protected alGuardar(guardadas: NotaGuardada[]): void {
    const a = this.asignacion();
    const datos = this.datos();
    if (a === null || datos === null) return;

    const porEstudiante = new Map(guardadas.map((g) => [g.estudianteId, g.nota]));
    const actualizar = (e: EstudianteDelCurso): EstudianteDelCurso =>
      porEstudiante.has(e.id) ? { ...e, nota: porEstudiante.get(e.id)! } : e;

    this.datos.set({
      ...datos,
      asignaciones: datos.asignaciones.map((x) => (x.id === a.id ? { ...x, estudiantes: x.estudiantes.map(actualizar) } : x)),
    });

    const borr = { ...this.borradores() };
    for (const id of porEstudiante.keys()) delete borr[this.claveBorrador(a.id, id)];
    this.guardarBorradores(borr);

    this.revisando.set(false);
    this.aviso.set({
      tipo: 'ok',
      texto: `Guardaste ${plural(guardadas.length, 'nota', 'notas')} de ${a.materia} ${curso(a.grado, a.grupo)}. Quedaron registradas y ya no se pueden modificar.`,
    });
    this.resaltar(porEstudiante.keys());
  }

  protected alPerderPermiso(): void {
    this.revisando.set(false);
    this.sinPermiso.set(true);
  }

  private resaltar(ids: Iterable<string>): void {
    this.resaltadas.set(new Set(ids));
    window.setTimeout(() => this.resaltadas.set(new Set()), 3500);
  }

  // ─────────────────────────────────────────────────────────────
  // Borradores (localStorage)
  // ─────────────────────────────────────────────────────────────

  /** usuario|período|asignación|estudiante */
  private prefijoBorrador(): string {
    return `${this.auth.usuario()?.id ?? 'anonimo'}|${this.periodo()?.id ?? 0}|`;
  }

  private claveBorrador(asignacionId: string, estudianteId: string): string {
    return `${this.prefijoBorrador()}${asignacionId}|${estudianteId}`;
  }

  /** Lo escrito y todavía no registrado en una asignación (ignora lo que ya tiene nota). */
  private borradoresDe(a: AsignacionDelProfesor): string[] {
    const borr = this.borradores();
    return a.estudiantes
      .filter((e) => e.nota === null && !e.retirado && borr[this.claveBorrador(a.id, e.id)])
      .map((e) => e.id);
  }

  private ponerBorrador(estudianteId: string, texto: string): void {
    const a = this.asignacion();
    if (a === null) return;
    const borr = { ...this.borradores() };
    const clave = this.claveBorrador(a.id, estudianteId);
    if (texto) borr[clave] = texto;
    else delete borr[clave];
    this.guardarBorradores(borr);
  }

  private leerBorradores(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_BORRADORES) ?? '{}') ?? {};
    } catch {
      return {};
    }
  }

  private guardarBorradores(borr: Record<string, string>): void {
    this.borradores.set(borr);
    try {
      localStorage.setItem(CLAVE_BORRADORES, JSON.stringify(borr));
    } catch {
      // Almacenamiento lleno o bloqueado (modo privado): el borrador sigue
      // en memoria mientras la pestaña esté abierta. No hay nada mejor que
      // hacer y no vale la pena interrumpir a quien escribe.
    }
  }
}
