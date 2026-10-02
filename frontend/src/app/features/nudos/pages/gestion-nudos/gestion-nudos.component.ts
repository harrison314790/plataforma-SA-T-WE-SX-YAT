import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  AsignaturaConNudo,
  CatalogoNudos,
  NudoPedagogico,
} from '../../../../core/interfaces/nudo.interface';
import { AuthService } from '../../../../core/servicios/auth.service';
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

/** Filtro de la tabla de materias: un nudo, las que no tienen, o todas. */
type FiltroNudo = number | 'sin-nudo' | null;

/**
 * Nudos pedagógicos: el catálogo y a qué nudo pertenece cada materia.
 *
 * MISMO ESQUELETO QUE ASIGNACIONES, a propósito: cabecera con la acción
 * principal a la derecha, barra de filtros con conteo, tabla densa y el
 * alta/edición en modal. Quien ya usa Asignaciones no tiene que aprender
 * otra forma de trabajar.
 *
 * Dos tablas porque responden dos preguntas distintas:
 * · Nudos   -> "¿cómo está armado el boletín?" (qué materias, cuánto se
 *              usa este año, qué grados ya tienen porcentajes).
 * · Materias -> "¿dónde va esta materia?" -- con el select para moverla,
 *              y el contexto que hace falta para decidir: en qué grados
 *              está en la malla, en qué cursos se dicta y quién la dicta.
 * Pulsar un nudo en la primera filtra la segunda.
 *
 * NO toca asignaciones: mover Ética de nudo no cambia quién la dicta ni
 * cómo sube sus notas el profesor, solo en qué fila del boletín sale.
 */
@Component({
  selector: 'app-gestion-nudos',
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
  templateUrl: './gestion-nudos.component.html',
})
export class GestionNudosComponent {
  private readonly servicio = inject(NudosService);
  private readonly conexion = inject(ConexionService);
  private readonly auth = inject(AuthService);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly enLinea = this.conexion.enLinea;

  /**
   * El select de nudo vive dentro de cada fila, así que no se puede
   * ocultar con `*appHasRole` sin dejar la fila sin el dato. Sin el
   * permiso se muestra como texto. Capa 1 nada más: Laravel
   * (`btn_gestionar_nudos`) y RLS lo vuelven a exigir.
   */
  protected readonly puedeGestionar = computed(() => this.auth.tienePermiso('btn_gestionar_nudos'));

  protected readonly catalogo = signal<CatalogoNudos | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly sinPermiso = signal(false);

  protected readonly guardando = signal(false);
  protected readonly errorDeAccion = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  /**
   * Mover una materia que tenía porcentajes deja esos grados en promedio
   * simple: el aviso pasa a amarillo y ofrece ir directo al primero.
   */
  protected readonly avisoPendiente = signal<{ grado: number; anio: number } | null>(null);

  // Filtros de la tabla de materias.
  protected readonly filtroNudo = signal<FiltroNudo>(null);
  protected readonly busqueda = signal('');

  // Modal de alta/edición. `null` = cerrado; `{ id: null }` = alta.
  protected readonly dialogo = signal<{ id: number | null } | null>(null);
  protected readonly nombre = signal('');
  protected readonly orden = signal<number | null>(null);
  protected readonly erroresDeCampo = signal<Record<string, string[]>>({});
  protected readonly errorDelDialogo = signal<string | null>(null);

  /** Id del nudo cuya fila está pidiendo confirmación de borrado. */
  protected readonly confirmandoBorrado = signal<number | null>(null);

  // Modal de alta/edición de materia. `codigoOriginal` null = alta.
  protected readonly dialogoMateria = signal<{ id: number | null; codigoOriginal: string | null } | null>(null);
  protected readonly nombreMateria = signal('');
  protected readonly codigoMateria = signal('');
  protected readonly nudoMateria = signal<number | null>(null);
  /** Mientras no se toque el código, se sugiere solo a partir del nombre. */
  private readonly codigoTocado = signal(false);
  protected readonly erroresMateria = signal<Record<string, string[]>>({});
  protected readonly errorDialogoMateria = signal<string | null>(null);

  /** Id de la materia cuya fila está pidiendo confirmación de borrado. */
  protected readonly confirmandoBorradoMateria = signal<number | null>(null);

  protected readonly anio = computed(() => this.catalogo()?.anio ?? null);
  protected readonly nudos = computed(() => this.catalogo()?.nudos ?? []);
  protected readonly asignaturas = computed(() => this.catalogo()?.asignaturas ?? []);

  protected readonly sinNudo = computed(() => this.asignaturas().filter((a) => a.nudoId === null));

  /** Cada nudo con sus materias, para la tabla de nudos. */
  protected readonly filasNudo = computed(() =>
    this.nudos().map((nudo) => ({
      nudo,
      materias: this.asignaturas().filter((a) => a.nudoId === nudo.id),
    })),
  );

  protected readonly resumen = computed(() => ({
    nudos: this.nudos().length,
    materias: this.asignaturas().length,
    ubicadas: this.asignaturas().length - this.sinNudo().length,
    sinNudo: this.sinNudo().length,
    asignaciones: this.asignaturas().reduce((total, a) => total + a.asignaciones, 0),
    profesores: new Set(this.asignaturas().flatMap((a) => a.profesores)).size,
    sinDictar: this.asignaturas().filter((a) => a.asignaciones === 0).length,
  }));

  protected readonly materiasFiltradas = computed(() => {
    const filtro = this.filtroNudo();
    const texto = this.normalizar(this.busqueda());

    return this.asignaturas()
      .filter((a) =>
        filtro === null ? true : filtro === 'sin-nudo' ? a.nudoId === null : a.nudoId === filtro,
      )
      .filter(
        (a) =>
          texto === '' ||
          this.normalizar(a.nombre).includes(texto) ||
          this.normalizar(a.codigo).includes(texto),
      )
      // Primero las que no tienen nudo: son las que hay que resolver.
      .sort((x, y) => Number(x.nudoId !== null) - Number(y.nudoId !== null) || x.nombre.localeCompare(y.nombre));
  });

  protected readonly hayFiltros = computed(() => this.filtroNudo() !== null || this.busqueda().trim() !== '');

  /** Cómo quedará guardado el nombre (mayúscula, un solo espacio), si difiere de lo escrito. */
  protected readonly nombrePrevio = computed(() => {
    const escrito = this.nombre().trim();
    const guardado = escrito.replace(/\s+/g, ' ').toLocaleUpperCase('es');
    return guardado !== escrito ? guardado : '';
  });

  /** La materia que se está editando, para comparar contra lo que tenía. */
  private readonly materiaEditada = computed(() => {
    const id = this.dialogoMateria()?.id ?? null;
    return id === null ? null : (this.asignaturas().find((a) => a.id === id) ?? null);
  });

  /**
   * La ayuda bajo el select de nudo. Amarilla cuando hay consecuencia:
   * porcentajes que dejan de cerrar, o una materia que queda fuera del
   * boletín.
   */
  protected readonly ayudaNudoMateria = computed<{ texto: string; pendiente: boolean }>(() => {
    const nudo = this.nudoMateria();
    const previa = this.materiaEditada();

    if (previa !== null && previa.nudoId !== nudo && previa.porcentajes.length > 0) {
      const grados = previa.porcentajes.map((p) => `${p.grado}° (${p.anio})`).join(', ');
      return {
        texto: `Al cambiarla de nudo, los porcentajes de ${grados} vuelven a promedio simple hasta que los revises.`,
        pendiente: true,
      };
    }
    if (nudo === null) {
      return { texto: 'Sin nudo, la materia no entra en ningún boletín ni en los porcentajes.', pendiente: true };
    }
    return { texto: 'Puedes cambiarla de nudo después, aquí o desde la tabla.', pendiente: false };
  });

  protected readonly puedeGuardarMateria = computed(
    () =>
      !this.guardando() &&
      this.enLinea() &&
      this.nombreMateria().trim() !== '' &&
      (this.dialogoMateria()?.codigoOriginal != null || this.codigoMateria().length >= 2),
  );

  constructor() {
    // Desde Porcentajes por grado ("Ubicarlas") se llega ya filtrado.
    if (this.ruta.snapshot.queryParamMap.get('filtro') === 'sin-nudo') {
      this.filtroNudo.set('sin-nudo');
    }
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.sinPermiso.set(false);

    try {
      this.catalogo.set(await this.servicio.catalogo());
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 403) {
        this.sinPermiso.set(true);
      } else {
        this.error.set(mensajeDeError(err, 'No pudimos cargar los nudos pedagógicos.'));
      }
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Filtros ──────────────────────────────────────────────────────

  protected elegirFiltro(valor: string): void {
    this.filtroNudo.set(valor === '' ? null : valor === 'sin-nudo' ? 'sin-nudo' : Number(valor));
  }

  /** Pulsar un nudo en la tabla de arriba filtra la de materias. */
  protected verMaterias(filtro: FiltroNudo): void {
    this.filtroNudo.set(filtro);
    document.getElementById('tabla-materias')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected limpiarFiltros(): void {
    this.filtroNudo.set(null);
    this.busqueda.set('');
  }

  // ── Modal de alta/edición ────────────────────────────────────────

  protected abrirAlta(): void {
    // El siguiente orden libre de a 10, como los que trae la migración:
    // deja hueco para meter un nudo entre dos sin renumerar.
    const maximo = Math.max(0, ...this.nudos().map((n) => n.orden));
    this.abrirDialogo(null, '', maximo + 10);
  }

  protected abrirEdicion(nudo: NudoPedagogico): void {
    this.abrirDialogo(nudo.id, nudo.nombre, nudo.orden);
  }

  private abrirDialogo(id: number | null, nombre: string, orden: number): void {
    this.dialogo.set({ id });
    this.nombre.set(nombre);
    this.orden.set(orden);
    this.erroresDeCampo.set({});
    this.errorDelDialogo.set(null);
  }

  protected cerrarDialogo(): void {
    if (this.guardando()) return;
    this.dialogo.set(null);
  }

  protected readonly puedeGuardarDialogo = computed(
    () => !this.guardando() && this.enLinea() && this.nombre().trim() !== '' && this.orden() !== null,
  );

  protected async guardarDialogo(): Promise<void> {
    const dialogo = this.dialogo();
    const orden = this.orden();
    if (dialogo === null || orden === null || !this.puedeGuardarDialogo()) return;

    this.guardando.set(true);
    this.erroresDeCampo.set({});
    this.errorDelDialogo.set(null);
    this.avisoPendiente.set(null);

    const datos = { nombre: this.nombre().trim(), orden };

    try {
      if (dialogo.id === null) {
        const nuevo = await this.servicio.crear(datos);
        this.aviso.set(`Nudo ${nuevo.nombre} creado. Ahora asígnale materias desde la tabla de abajo.`);
        this.filtroNudo.set('sin-nudo');
      } else {
        const editado = await this.servicio.actualizar(dialogo.id, datos);
        this.aviso.set(`Nudo ${editado.nombre} actualizado.`);
      }

      this.dialogo.set(null);
      this.catalogo.set(await this.servicio.catalogo());
    } catch (err) {
      const detalles = detallesDeError(err);
      if (Object.keys(detalles).length > 0) {
        this.erroresDeCampo.set(detalles);
      } else {
        this.errorDelDialogo.set(mensajeDeError(err, 'No se pudo guardar el nudo.'));
      }
    } finally {
      this.guardando.set(false);
    }
  }

  protected errorDe(campo: string): string | null {
    return this.erroresDeCampo()[campo]?.[0] ?? null;
  }

  protected escribirOrden(valor: string): void {
    this.orden.set(valor === '' ? null : Number(valor));
  }

  // ── Acciones de fila ─────────────────────────────────────────────

  protected async eliminar(nudo: NudoPedagogico): Promise<void> {
    this.confirmandoBorrado.set(null);
    await this.ejecutar(() => this.servicio.eliminar(nudo.id), `Se eliminó el nudo ${nudo.nombre}.`);
  }

  /**
   * Mueve una materia de nudo. Si tenía porcentajes configurados en algún
   * grado, esos nudos vuelven a promedio simple hasta que se reconfiguren
   * -- se avisa con los grados exactos, en vez de dejar que alguien lo
   * descubra en un boletín.
   */
  protected async moverMateria(materia: AsignaturaConNudo, valor: string): Promise<void> {
    const nudoId = valor === '' ? null : Number(valor);
    if (nudoId === materia.nudoId) return;

    await this.ejecutar(async () => {
      const resultado = await this.servicio.asignarNudo(materia.id, nudoId);
      const destino = this.nombreDeNudo(nudoId);
      const afectados = resultado.porcentajesAfectados.map((a) => `${a.grado}° (${a.anio})`);

      const primero = resultado.porcentajesAfectados[0];
      this.avisoPendiente.set(primero ? { grado: primero.grado, anio: primero.anio } : null);
      this.aviso.set(
        afectados.length > 0
          ? `${materia.nombre} pasó a ${destino}. Tenía porcentajes en ${afectados.join(', ')}: revisa esos grados en Porcentajes por grado; mientras tanto usan promedio simple.`
          : `${materia.nombre} pasó a ${destino}.`,
      );
    }, null);
  }

  /**
   * Bloquea, ejecuta, recarga y traduce el error. Recarga también si
   * falla: así el select de la fila vuelve a mostrar el nudo real en vez
   * del que se eligió y no se guardó.
   */
  private async ejecutar(accion: () => Promise<unknown>, aviso: string | null): Promise<void> {
    this.guardando.set(true);
    this.errorDeAccion.set(null);
    this.avisoPendiente.set(null);
    if (aviso !== null) this.aviso.set(null);

    try {
      await accion();
      if (aviso !== null) this.aviso.set(aviso);
    } catch (err) {
      this.aviso.set(null);
      this.errorDeAccion.set(mensajeDeError(err, 'No se pudo completar la acción.'));
    } finally {
      try {
        this.catalogo.set(await this.servicio.catalogo());
      } catch {
        // El error de la acción ya está a la vista; no se pisa.
      }
      this.guardando.set(false);
    }
  }

  // ── Formato ──────────────────────────────────────────────────────

  // ── Modal de materia ─────────────────────────────────────────────

  /** Si se estaba viendo un nudo concreto, la materia nueva nace en él. */
  protected abrirAltaMateria(): void {
    const filtro = this.filtroNudo();
    this.abrirDialogoMateria(null, null, '', '', typeof filtro === 'number' ? filtro : null);
  }

  protected abrirEdicionMateria(materia: AsignaturaConNudo): void {
    this.abrirDialogoMateria(materia.id, materia.codigo, materia.nombre, materia.codigo, materia.nudoId);
  }

  private abrirDialogoMateria(
    id: number | null,
    codigoOriginal: string | null,
    nombre: string,
    codigo: string,
    nudoId: number | null,
  ): void {
    this.confirmandoBorradoMateria.set(null);
    this.dialogoMateria.set({ id, codigoOriginal });
    this.nombreMateria.set(nombre);
    this.codigoMateria.set(codigo);
    this.nudoMateria.set(nudoId);
    this.codigoTocado.set(codigoOriginal !== null);
    this.erroresMateria.set({});
    this.errorDialogoMateria.set(null);
  }

  protected cerrarDialogoMateria(): void {
    if (this.guardando()) return;
    this.dialogoMateria.set(null);
  }

  protected escribirNombreMateria(valor: string): void {
    this.nombreMateria.set(valor);
    if (!this.codigoTocado()) {
      this.codigoMateria.set(this.soloLetras(valor).slice(0, 3));
    }
  }

  /** Solo letras sin tilde, en mayúscula, hasta 6: lo mismo que exige el backend. */
  protected escribirCodigo(campo: HTMLInputElement): void {
    const limpio = this.soloLetras(campo.value).slice(0, 6);
    campo.value = limpio;
    this.codigoMateria.set(limpio);
    this.codigoTocado.set(true);
  }

  protected elegirNudoMateria(valor: string): void {
    this.nudoMateria.set(valor === '' ? null : Number(valor));
  }

  protected errorDeMateria(campo: string): string | null {
    return this.erroresMateria()[campo]?.[0] ?? null;
  }

  protected async guardarMateria(): Promise<void> {
    const dialogo = this.dialogoMateria();
    if (dialogo === null || !this.puedeGuardarMateria()) return;

    this.guardando.set(true);
    this.erroresMateria.set({});
    this.errorDialogoMateria.set(null);
    this.avisoPendiente.set(null);

    const nombre = this.nombreMateria().trim().replace(/\s+/g, ' ');
    const nudoId = this.nudoMateria();

    try {
      if (dialogo.id === null) {
        const nueva = await this.servicio.crearMateria({ nombre, codigo: this.codigoMateria(), nudo_pedagogico_id: nudoId });
        this.aviso.set(
          nudoId === null
            ? `Materia ${nueva.nombre} creada sin nudo: no entra en ningún boletín hasta que la ubiques.`
            : `Materia ${nueva.nombre} creada en ${this.nombreDeNudo(nudoId)}. Ya puedes asignarla en el módulo Asignaciones.`,
        );
        // Se muestra donde quedó, para que se vea recién creada.
        this.filtroNudo.set(nudoId ?? 'sin-nudo');
        this.busqueda.set('');
      } else {
        const resultado = await this.servicio.actualizarMateria(dialogo.id, { nombre, nudo_pedagogico_id: nudoId });
        const afectados = resultado.porcentajesAfectados;
        const primero = afectados[0];
        this.avisoPendiente.set(primero ? { grado: primero.grado, anio: primero.anio } : null);
        this.aviso.set(
          afectados.length > 0
            ? `Materia ${nombre} actualizada. Tenía porcentajes en ${afectados.map((a) => `${a.grado}° (${a.anio})`).join(', ')}: revisa esos grados en Porcentajes por grado; mientras tanto usan promedio simple.`
            : `Materia ${nombre} actualizada.`,
        );
      }

      this.dialogoMateria.set(null);
      this.catalogo.set(await this.servicio.catalogo());
    } catch (err) {
      const detalles = detallesDeError(err);
      if (Object.keys(detalles).length > 0) {
        this.erroresMateria.set(detalles);
      } else {
        this.errorDialogoMateria.set(mensajeDeError(err, 'No se pudo guardar la materia.'));
      }
    } finally {
      this.guardando.set(false);
    }
  }

  protected async eliminarMateria(materia: AsignaturaConNudo): Promise<void> {
    this.confirmandoBorradoMateria.set(null);
    await this.ejecutar(() => this.servicio.eliminarMateria(materia.id), `Materia ${materia.nombre} eliminada.`);
  }

  /** Por qué la papelera de una materia está apagada, o null si se puede borrar. */
  protected motivoNoBorrarMateria(materia: AsignaturaConNudo): string | null {
    if (materia.asignacionesTotales === 0) return null;
    if (materia.cursos.length > 0) {
      return `Se dicta en ${this.plural(materia.cursos.length, 'curso', 'cursos')}: quita sus asignaciones antes de eliminarla`;
    }
    return `Tiene ${this.plural(materia.asignacionesTotales, 'asignación', 'asignaciones')} de otros años: no se puede eliminar`;
  }

  private soloLetras(texto: string): string {
    return this.normalizar(texto).replace(/[^a-z]/g, '').toUpperCase();
  }

  protected cerrarAviso(): void {
    this.aviso.set(null);
    this.avisoPendiente.set(null);
  }

  /** ['6-A', '9-B'] -> '6° A, 9° B'; más de seis se resumen. */
  protected cursosTexto(cursos: string[]): string {
    if (cursos.length === 0) return `No se dicta en ${this.anio() ?? 'este año'}`;
    const legibles = cursos.map((c) => c.replace(/^(\d+)-/, '$1° '));
    return legibles.length > 6
      ? `${legibles.slice(0, 5).join(', ')} y ${legibles.length - 5} más`
      : legibles.join(', ');
  }

  protected nombreDeNudo(id: number | null): string {
    return this.nudos().find((n) => n.id === id)?.nombre ?? 'sin nudo';
  }

  /** [1,2,3,4,5,7] -> '1°–5°, 7°'. La malla es casi siempre un tramo seguido. */
  protected tramos(grados: number[]): string {
    if (grados.length === 0) return '';

    const partes: string[] = [];
    let inicio = grados[0];
    let previo = grados[0];

    for (const g of [...grados.slice(1), Number.NaN]) {
      if (g === previo + 1) {
        previo = g;
        continue;
      }
      partes.push(inicio === previo ? `${inicio}°` : `${inicio}°–${previo}°`);
      inicio = g;
      previo = g;
    }

    return partes.join(', ');
  }

  protected plural(n: number, singular: string, plural: string): string {
    return `${n} ${n === 1 ? singular : plural}`;
  }

  private normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
