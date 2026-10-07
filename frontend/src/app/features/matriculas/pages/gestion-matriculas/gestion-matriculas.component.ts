import { TitleCasePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { AccionDeModulo } from '../../../../core/interfaces/asignacion.interface';
import type {
  AcudienteAgregado,
  DatosMatriculas,
  EstudianteMatriculable,
  Matricula,
  OpcionesMatriculas,
  ResultadoAnio,
} from '../../../../core/interfaces/matricula.interface';
import { ConexionService } from '../../../../core/servicios/conexion.service';
import { mensajeDeError } from '../../../../core/servicios/error-api';
import { MatriculasService } from '../../../../core/servicios/matriculas.service';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { SinPermisoComponent } from '../../../../shared/componentes/sin-permiso/sin-permiso.component';
import { HasRoleDirective } from '../../../../shared/directivas/has-role.directive';
import { DialogoCambiarGrupoComponent } from '../../componentes/dialogo-cambiar-grupo/dialogo-cambiar-grupo.component';
import {
  DialogoConfirmarLoteComponent,
  type DestinoLote,
} from '../../componentes/dialogo-confirmar-lote/dialogo-confirmar-lote.component';
import { DialogoRetirarComponent } from '../../componentes/dialogo-retirar/dialogo-retirar.component';
import { FormularioMatriculaComponent } from '../../componentes/formulario-matricula/formulario-matricula.component';
import {
  CatalogoCursos,
  type ChipResultado,
  type Pendiente,
  type Sugerencia,
  chipResultado,
  curso,
  fechaCorta,
  iniciales,
  motivoLegible,
  normalizar,
  plural,
  rotuloGrupo,
  sugerir,
} from '../../reglas';

type Pestana = 'pm' | 'mt';
type FiltroEstado = 'activa' | 'retirada' | 'todas';

interface FiltrosPendientes {
  q: string;
  sede: string;
  /** '8' = todo 8°, '8-B' = solo ese grupo. */
  gradoGrupo: string;
  resultado: '' | ResultadoAnio;
  vista: 'pendientes' | 'graduados';
}

interface FiltrosMatriculados {
  q: string;
  sede: string;
  grado: string;
  grupo: string;
  estado: FiltroEstado;
}

interface MenuAbierto {
  id: string;
  top: string;
  bottom: string;
  right: string;
}

const FILTROS_PENDIENTES: FiltrosPendientes = { q: '', sede: '', gradoGrupo: '', resultado: '', vista: 'pendientes' };
const FILTROS_MATRICULADOS: FiltrosMatriculados = { q: '', sede: '', grado: '', grupo: '', estado: 'todas' };

const ESTADOS: { valor: FiltroEstado; rotulo: string }[] = [
  { valor: 'activa', rotulo: 'Activas' },
  { valor: 'retirada', rotulo: 'Retiradas' },
  { valor: 'todas', rotulo: 'Todas' },
];

/**
 * Lo que se muestra antes de que llegue `/opciones`: sin esto, el botón
 * principal parpadea con el código crudo ("btn_matricular_estudiante")
 * durante la carga. La base sigue mandando: en cuanto llega, se usa lo suyo.
 */
const ACCIONES_POR_DEFECTO: Record<string, AccionDeModulo> = {
  btn_matricular_estudiante: { etiqueta: 'Matricular estudiante', icono: null },
  btn_cambiar_grupo: { etiqueta: 'Cambiar de grupo', icono: 'intercambiar' },
  btn_retirar_matricula: { etiqueta: 'Retirar del año', icono: 'retirar' },
};

const ordenarPorApellido = (a: EstudianteMatriculable, b: EstudianteMatriculable): number =>
  a.apellidos.localeCompare(b.apellidos, 'es') || a.nombres.localeCompare(b.nombres, 'es');

const coincide = (e: EstudianteMatriculable, termino: string): boolean =>
  !termino ||
  normalizar(`${e.nombres} ${e.apellidos}`).includes(termino) ||
  normalizar(`${e.apellidos} ${e.nombres}`).includes(termino) ||
  e.documento.includes(termino);

/**
 * El módulo de Matrículas: ubicar a cada estudiante en una sede, grado y
 * grupo para el año escolar. Calcado del mockup aprobado ("Matrículas -
 * Módulo admin.html").
 *
 * Componente de ruta y dueño del estado de la pantalla, como
 * GestionUsuariosComponent. Los modales reciben datos y devuelven la
 * matrícula ya guardada: cada uno llama a su endpoint (matricular,
 * retirar, cambiar de grupo) porque es él quien sabe pintar sus errores
 * al lado del campo.
 *
 * DOS PESTAÑAS SOBRE LOS MISMOS DATOS. Una petición trae las matrículas
 * del año elegido y del anterior; "Por matricular" es "estaba el año
 * pasado y este no", "Matriculados" es "las de este año". Filtros y
 * conteos se calculan en el cliente: con la señal de una vereda, un
 * round-trip por tecla se siente.
 *
 * LOS CINCO ESTADOS
 * · cargando -> skeleton con la forma de la fila, pestañas visibles.
 * · vacío -> "todos ya matriculados" / "aún no hay matrículas", con salida.
 * · error -> bloque con Reintentar.
 * · sin permiso -> 403 en vuelo (el guard ya cubre la entrada).
 * · sin conexión -> se puede mirar, no escribir: los botones se
 *   deshabilitan con su motivo (el aviso global lo pone el shell).
 */
@Component({
  selector: 'app-gestion-matriculas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogoCambiarGrupoComponent,
    DialogoConfirmarLoteComponent,
    DialogoRetirarComponent,
    FormularioMatriculaComponent,
    HasRoleDirective,
    IconoComponent,
    SinPermisoComponent,
    TitleCasePipe,
  ],
  templateUrl: './gestion-matriculas.component.html',
  host: {
    '(document:mousedown)': 'cerrarMenuSiEsFuera($event)',
    '(document:keydown.escape)': 'cerrarMenu()',
  },
})
export class GestionMatriculasComponent {
  private readonly servicio = inject(MatriculasService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly conexion = inject(ConexionService);

  protected readonly enLinea = this.conexion.enLinea;
  protected readonly estados = ESTADOS;
  protected readonly anchosEsqueleto = [
    ['22%', '14%'], ['18%', '20%'], ['26%', '12%'], ['20%', '16%'], ['24%', '18%'], ['16%', '14%'],
  ];

  // Funciones de presentación que usa el template.
  protected readonly curso = curso;
  protected readonly fechaCorta = fechaCorta;
  protected readonly iniciales = iniciales;
  protected readonly plural = plural;
  protected readonly rotuloGrupo = rotuloGrupo;
  protected readonly motivoLegible = motivoLegible;

  protected readonly opciones = signal<OpcionesMatriculas | null>(null);
  protected readonly datos = signal<DatosMatriculas | null>(null);
  protected readonly anio = signal<number | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly sinPermiso = signal(false);

  protected readonly pestana = signal<Pestana>('pm');
  protected readonly f1 = signal<FiltrosPendientes>(FILTROS_PENDIENTES);
  protected readonly f2 = signal<FiltrosMatriculados>(FILTROS_MATRICULADOS);

  /** Los estudiantes marcados para matricular en lote. */
  protected readonly seleccion = signal<ReadonlySet<string>>(new Set());
  /** El destino que eligió la secretaria en la barra; `null` = el sugerido. */
  private readonly destinoElegido = signal<DestinoLote | null>(null);
  protected readonly confirmandoLote = signal(false);

  protected readonly plegados = signal<ReadonlySet<string>>(new Set());
  protected readonly menu = signal<MenuAbierto | null>(null);

  /** `undefined` = cerrado · `null` = matricular a alguien nuevo · id = desde su fila. */
  protected readonly formulario = signal<string | null | undefined>(undefined);
  protected readonly enRetiro = signal<Matricula | null>(null);
  protected readonly enCambio = signal<Matricula | null>(null);

  protected readonly aviso = signal<{ tipo: 'ok' | 'neutral'; texto: string } | null>(null);
  /** Filas recién guardadas, resaltadas unos segundos (matrículas y estudiantes). */
  protected readonly resaltadas = signal<ReadonlySet<string>>(new Set());

  // ─────────────────────────────────────────────────────────────
  // Derivados
  // ─────────────────────────────────────────────────────────────

  protected readonly catalogo = computed(() => {
    const o = this.opciones();
    return o === null ? null : new CatalogoCursos(o);
  });

  private readonly estudiantesPorId = computed(
    () => new Map((this.datos()?.estudiantes ?? []).map((e) => [e.id, e])),
  );

  /** Las del año elegido (activas y retiradas). */
  private readonly delAnio = computed(() => {
    const anio = this.anio();
    return (this.datos()?.matriculas ?? []).filter((m) => m.anio === anio);
  });

  private readonly activasDelAnio = computed(() => this.delAnio().filter((m) => m.estado === 'activa'));

  /** Todos los del año anterior sin matrícula activa este año, con su sugerencia. */
  private readonly pendientesYGraduados = computed<Pendiente[]>(() => {
    const datos = this.datos();
    const catalogo = this.catalogo();
    const anio = this.anio();
    if (datos === null || catalogo === null || anio === null) return [];

    const yaMatriculados = new Set(this.activasDelAnio().map((m) => m.estudianteId));
    const porId = this.estudiantesPorId();

    return datos.matriculas
      .filter((m) => m.anio === anio - 1 && m.estado === 'activa' && !yaMatriculados.has(m.estudianteId))
      .flatMap((anterior) => {
        // Una cuenta desactivada no llega en `estudiantes`: no se ofrece.
        const estudiante = porId.get(anterior.estudianteId);
        if (estudiante === undefined) return [];
        return [{
          estudiante,
          anterior,
          resultado: datos.resultados[estudiante.id] ?? 'P',
          sugerencia: sugerir(estudiante.id, datos.matriculas, anio, datos.resultados, catalogo),
        }];
      });
  });

  protected readonly graduados = computed(() =>
    this.pendientesYGraduados().filter((p) => p.sugerencia.tipo === 'graduado'),
  );

  protected readonly pendientes = computed(() =>
    this.pendientesYGraduados().filter((p) => p.sugerencia.tipo !== 'graduado'),
  );

  protected readonly conteoPestanas = computed(() => ({
    pm: this.pendientes().length,
    mt: this.activasDelAnio().length,
  }));

  // ── Pestaña "Por matricular" ──

  protected readonly vistaGraduados = computed(() => this.f1().vista === 'graduados');

  protected readonly kpis = computed(() => {
    const p = this.pendientes();
    const enProgreso = p.filter((x) => x.resultado === 'P').length;
    const f = this.f1();
    const elegido = f.vista === 'graduados' ? 'G' : f.resultado === '' ? 'pend' : f.resultado;

    return [
      { clave: 'pend', rotulo: 'Por matricular', n: p.length, icono: '●', tono: 'pendiente',
        sub: enProgreso ? `Incluye ${enProgreso} en progreso` : 'Pendientes este año',
        filtros: { resultado: '' as const, vista: 'pendientes' as const } },
      { clave: 'A', rotulo: 'Aprobaron', n: p.filter((x) => x.resultado === 'A').length, icono: '✓', tono: 'ok',
        sub: 'Pasan al grado siguiente', filtros: { resultado: 'A' as const, vista: 'pendientes' as const } },
      { clave: 'N', rotulo: 'No aprobaron', n: p.filter((x) => x.resultado === 'N').length, icono: '✕', tono: 'error',
        sub: 'Se sugiere repetir el grado', filtros: { resultado: 'N' as const, vista: 'pendientes' as const } },
      { clave: 'G', rotulo: 'Graduados', n: this.graduados().length, icono: '–', tono: 'neutro',
        sub: 'Terminaron 11° · no cuentan', filtros: { resultado: '' as const, vista: 'graduados' as const } },
    ].map((k) => ({ ...k, elegido: k.clave === elegido }));
  });

  private readonly baseF1 = computed(() => (this.vistaGraduados() ? this.graduados() : this.pendientes()));

  /** Opciones del filtro de grado anterior: "8°" y, si tuvo varios grupos, "8-A", "8-B". */
  protected readonly opcionesGradoAnterior = computed(() => {
    const grupos = new Map<number, Set<string>>();
    for (const p of this.baseF1()) {
      grupos.set(p.anterior.grado, (grupos.get(p.anterior.grado) ?? new Set()).add(p.anterior.grupo));
    }

    return [...grupos.keys()].sort((a, b) => a - b).flatMap((grado) => {
      const varios = [...grupos.get(grado)!].sort();
      return [
        { valor: String(grado), rotulo: varios.length > 1 ? `${grado}° · todos los grupos` : `${grado}°` },
        ...(varios.length > 1 ? varios.map((g) => ({ valor: `${grado}-${g}`, rotulo: curso(grado, g) })) : []),
      ];
    });
  });

  protected readonly filasPendientes = computed(() => {
    const f = this.f1();
    const termino = normalizar(f.q.trim());

    return this.baseF1()
      .filter((p) =>
        (this.vistaGraduados() || !f.resultado || p.resultado === f.resultado) &&
        (!f.sede || p.anterior.sedeId === Number(f.sede)) &&
        (!f.gradoGrupo || (f.gradoGrupo.includes('-')
          ? `${p.anterior.grado}-${p.anterior.grupo}` === f.gradoGrupo
          : p.anterior.grado === Number(f.gradoGrupo))) &&
        coincide(p.estudiante, termino),
      )
      .sort((a, b) =>
        a.anterior.grado - b.anterior.grado ||
        a.anterior.sedeId - b.anterior.sedeId ||
        a.anterior.grupo.localeCompare(b.anterior.grupo) ||
        ordenarPorApellido(a.estudiante, b.estudiante),
      );
  });

  protected readonly hayFiltrosF1 = computed(() => {
    const f = this.f1();
    return !!(f.q || f.sede || f.gradoGrupo || f.resultado);
  });

  // ── Selección y lote ──

  /** Lo seleccionado que sigue pendiente (lo ya matriculado se cae solo). */
  protected readonly seleccionados = computed(() => {
    const ids = this.seleccion();
    return this.pendientes().filter((p) => ids.has(p.estudiante.id));
  });

  private readonly idsVisibles = computed(() =>
    this.vistaGraduados() ? [] : this.filasPendientes().map((p) => p.estudiante.id),
  );

  protected readonly estadoSeleccionTodos = computed<'true' | 'false' | 'mixed'>(() => {
    const visibles = this.idsVisibles();
    const marcados = visibles.filter((id) => this.seleccion().has(id)).length;
    if (visibles.length === 0 || marcados === 0) return 'false';
    return marcados === visibles.length ? 'true' : 'mixed';
  });

  /**
   * A dónde va el lote: lo que eligió la secretaria o, si no tocó nada,
   * la sugerencia del primero -- con el grupo común si todos venían del
   * mismo.
   */
  protected readonly destinoLote = computed<DestinoLote | null>(() => {
    const elegido = this.destinoElegido();
    if (elegido !== null) return elegido;

    const sel = this.seleccionados();
    const catalogo = this.catalogo();
    const primera = sel[0]?.sugerencia;
    if (!primera || catalogo === null || primera.sedeId === null || primera.grado === null) return null;

    const mismoGrupo = sel.every((p) =>
      p.sugerencia.sedeId === primera.sedeId && p.sugerencia.grado === primera.grado && p.sugerencia.grupo === primera.grupo,
    );

    return {
      sedeId: primera.sedeId,
      grado: primera.grado,
      grupo: mismoGrupo ? primera.grupo : catalogo.grupoAutomatico(primera.sedeId, primera.grado, primera.grupo),
    };
  });

  protected readonly barraLoteAbierta = computed(
    () => this.pestana() === 'pm' && !this.vistaGraduados() && this.seleccionados().length > 0,
  );

  // ── Pestaña "Matriculados" ──

  private readonly matriculadosFiltrados = computed(() => {
    const f = this.f2();
    const termino = normalizar(f.q.trim());
    const porId = this.estudiantesPorId();

    return this.delAnio().filter((m) => {
      const e = porId.get(m.estudianteId);
      return (
        e !== undefined &&
        (!f.sede || m.sedeId === Number(f.sede)) &&
        (!f.grado || m.grado === Number(f.grado)) &&
        (!f.grupo || m.grupo === f.grupo) &&
        coincide(e, termino)
      );
    });
  });

  protected readonly conteoEstados = computed(() => {
    const lista = this.matriculadosFiltrados();
    const activa = lista.filter((m) => m.estado === 'activa').length;
    return { activa, retirada: lista.length - activa, todas: lista.length };
  });

  /** Agrupadas por curso (grado · sede · grupo), por apellido adentro. */
  protected readonly grupos = computed(() => {
    const estado = this.f2().estado;
    const porId = this.estudiantesPorId();
    const porCurso = new Map<string, Matricula[]>();

    for (const m of this.matriculadosFiltrados()) {
      if (estado !== 'todas' && m.estado !== estado) continue;
      const clave = `${m.grado}|${m.sedeId}|${m.grupo}`;
      porCurso.set(clave, [...(porCurso.get(clave) ?? []), m]);
    }

    return [...porCurso.entries()]
      .sort(([a], [b]) => {
        const [ga, sa, xa] = a.split('|');
        const [gb, sb, xb] = b.split('|');
        return Number(ga) - Number(gb) || Number(sa) - Number(sb) || xa.localeCompare(xb);
      })
      .map(([clave, lista]) => {
        const filas = lista
          .map((m) => ({ m, e: porId.get(m.estudianteId)! }))
          .sort((a, b) => ordenarPorApellido(a.e, b.e));
        const activas = filas.filter((f) => f.m.estado === 'activa').length;
        return {
          clave,
          curso: curso(lista[0].grado, lista[0].grupo),
          sede: this.catalogo()?.nombreSede(lista[0].sedeId) ?? '',
          activas,
          retiradas: filas.length - activas,
          filas,
        };
      });
  });

  protected readonly totalFilasF2 = computed(() => this.grupos().reduce((n, g) => n + g.filas.length, 0));

  protected readonly todosPlegados = computed(() => {
    const grupos = this.grupos();
    return grupos.length > 0 && grupos.every((g) => this.plegados().has(g.clave));
  });

  protected readonly hayFiltrosF2 = computed(() => {
    const f = this.f2();
    return !!(f.q || f.sede || f.grado || f.grupo || f.estado !== 'todas');
  });

  /** Los grupos que existen en la oferta, para el filtro de Matriculados. */
  protected readonly opcionesGrupo = computed(() =>
    [...new Set((this.opciones()?.ofertaGrados ?? []).map((o) => o.grupo))].sort(),
  );

  protected readonly opcionesGrado = computed(() =>
    [...new Set((this.opciones()?.ofertaGrados ?? []).map((o) => o.grado))].sort((a, b) => a - b),
  );

  protected readonly matriculaDelMenu = computed(() => {
    const menu = this.menu();
    return menu === null ? null : this.delAnio().find((m) => m.id === menu.id) ?? null;
  });

  constructor() {
    this.leerUrl();
    void this.cargar();

    // El menú es `position: fixed`: si la página se desplaza, quedaría
    // flotando sobre otra fila. Se cierra (mismo criterio que Usuarios).
    const alDesplazar = () => this.cerrarMenu();
    window.addEventListener('scroll', alDesplazar, true);
    window.addEventListener('resize', alDesplazar);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('scroll', alDesplazar, true);
      window.removeEventListener('resize', alDesplazar);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Carga
  // ─────────────────────────────────────────────────────────────

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.sinPermiso.set(false);

    try {
      let opciones = this.opciones();
      if (opciones === null) {
        opciones = await this.servicio.opciones();
        this.opciones.set(opciones);
      }

      // El año de la URL solo vale si está en la lista; si no, el sugerido.
      const anio = this.anio();
      const valido = anio !== null && opciones.anios.includes(anio) ? anio : opciones.anioSugerido;
      this.anio.set(valido);

      this.datos.set(await this.servicio.listar(valido));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 403) {
        this.sinPermiso.set(true);
      } else {
        this.error.set(mensajeDeError(err, 'Puede ser la señal o el servidor. No se perdió ninguna matrícula guardada.'));
      }
    } finally {
      this.cargando.set(false);
    }
  }

  protected elegirAnio(valor: string): void {
    this.anio.set(Number(valor));
    this.seleccion.set(new Set());
    this.destinoElegido.set(null);
    this.f1.set(FILTROS_PENDIENTES);
    this.f2.set(FILTROS_MATRICULADOS);
    this.plegados.set(new Set());
    this.aviso.set(null);
    this.cerrarMenu();
    this.escribirUrl();
    void this.cargar();
  }

  // ─────────────────────────────────────────────────────────────
  // Pestañas y filtros (pestaña y año en la URL)
  // ─────────────────────────────────────────────────────────────

  protected elegirPestana(pestana: Pestana): void {
    this.pestana.set(pestana);
    this.cerrarMenu();
    this.escribirUrl();
  }

  protected filtrarF1(cambio: Partial<FiltrosPendientes>): void {
    this.f1.update((f) => ({ ...f, ...cambio }));
  }

  protected limpiarF1(): void {
    this.f1.update((f) => ({ ...FILTROS_PENDIENTES, vista: f.vista }));
  }

  protected elegirKpi(filtros: Pick<FiltrosPendientes, 'resultado' | 'vista'>): void {
    this.f1.update((f) => ({ ...f, ...filtros, gradoGrupo: filtros.vista !== f.vista ? '' : f.gradoGrupo }));
  }

  protected filtrarF2(cambio: Partial<FiltrosMatriculados>): void {
    this.f2.update((f) => ({ ...f, ...cambio }));
    this.cerrarMenu();
  }

  protected limpiarF2(): void {
    this.f2.set(FILTROS_MATRICULADOS);
    this.plegados.set(new Set());
  }

  private leerUrl(): void {
    const p = this.ruta.snapshot.queryParamMap;
    if (p.get('pestana') === 'matriculados') this.pestana.set('mt');
    const anio = Number(p.get('anio'));
    if (Number.isInteger(anio) && anio > 0) this.anio.set(anio);
  }

  private escribirUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: {
        pestana: this.pestana() === 'mt' ? 'matriculados' : null,
        anio: this.anio() !== this.opciones()?.anioSugerido ? this.anio() : null,
      },
      replaceUrl: true,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Selección y lote
  // ─────────────────────────────────────────────────────────────

  protected alternarSeleccion(id: string): void {
    this.seleccion.update((s) => {
      const nueva = new Set(s);
      if (nueva.has(id)) nueva.delete(id);
      else nueva.add(id);
      return nueva;
    });
    if (this.seleccion().size === 0) this.destinoElegido.set(null);
  }

  protected alternarTodos(): void {
    const visibles = this.idsVisibles();
    const marcar = this.estadoSeleccionTodos() !== 'true';
    this.seleccion.update((s) => {
      const nueva = new Set(s);
      for (const id of visibles) {
        if (marcar) nueva.add(id);
        else nueva.delete(id);
      }
      return nueva;
    });
    if (this.seleccion().size === 0) this.destinoElegido.set(null);
  }

  protected cancelarLote(): void {
    this.seleccion.set(new Set());
    this.destinoElegido.set(null);
  }

  protected cambiarDestino(campo: 'sede' | 'grado' | 'grupo', valor: string): void {
    const actual = this.destinoLote();
    const catalogo = this.catalogo();
    if (actual === null || catalogo === null) return;

    if (campo === 'sede') {
      const sedeId = Number(valor);
      const grados = catalogo.grados(sedeId);
      const grado = grados.includes(actual.grado) ? actual.grado : (grados[grados.length - 1] ?? actual.grado);
      this.destinoElegido.set({ sedeId, grado, grupo: catalogo.grupoAutomatico(sedeId, grado, actual.grupo) });
    } else if (campo === 'grado') {
      const grado = Number(valor);
      this.destinoElegido.set({ ...actual, grado, grupo: catalogo.grupoAutomatico(actual.sedeId, grado, actual.grupo) });
    } else {
      this.destinoElegido.set({ ...actual, grupo: valor });
    }
  }

  protected loteGuardado(matriculas: Matricula[]): void {
    const destino = this.destinoLote();
    this.confirmandoLote.set(false);
    this.agregarMatriculas(matriculas);
    this.cancelarLote();
    if (destino !== null) {
      this.avisar('ok', `${plural(matriculas.length, 'estudiante matriculado', 'estudiantes matriculados')} en ${curso(destino.grado, destino.grupo)}, ${this.catalogo()?.nombreSede(destino.sedeId)}, año ${this.anio()}.`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Plegar grupos
  // ─────────────────────────────────────────────────────────────

  protected alternarGrupo(clave: string): void {
    this.plegados.update((s) => {
      const nueva = new Set(s);
      if (nueva.has(clave)) nueva.delete(clave);
      else nueva.add(clave);
      return nueva;
    });
    this.cerrarMenu();
  }

  protected alternarTodosLosGrupos(): void {
    this.plegados.set(this.todosPlegados() ? new Set() : new Set(this.grupos().map((g) => g.clave)));
  }

  // ─────────────────────────────────────────────────────────────
  // Menú "Más opciones"
  // ─────────────────────────────────────────────────────────────

  protected alternarMenu(evento: MouseEvent, m: Matricula): void {
    evento.stopPropagation();
    if (this.menu()?.id === m.id) {
      this.cerrarMenu();
      return;
    }

    const caja = (evento.currentTarget as HTMLElement).getBoundingClientRect();
    const alto = this.enLinea() ? 104 : 150;
    const haciaArriba = caja.bottom + 4 + alto > window.innerHeight - 8 && caja.top - 4 - alto > 8;
    const right = Math.min(Math.max(8, window.innerWidth - caja.right), window.innerWidth - 238);

    this.menu.set({
      id: m.id,
      top: haciaArriba ? 'auto' : `${caja.bottom + 4}px`,
      bottom: haciaArriba ? `${window.innerHeight - caja.top + 4}px` : 'auto',
      right: `${right}px`,
    });
  }

  protected cerrarMenu(): void {
    if (this.menu() !== null) this.menu.set(null);
  }

  protected cerrarMenuSiEsFuera(evento: MouseEvent): void {
    if (this.menu() === null) return;
    const objetivo = evento.target as HTMLElement | null;
    if (objetivo?.closest('.menu-opciones, [aria-haspopup="menu"]')) return;
    this.cerrarMenu();
  }

  // ─────────────────────────────────────────────────────────────
  // Modales
  // ─────────────────────────────────────────────────────────────

  protected abrirFormulario(estudianteId: string | null): void {
    if (!this.enLinea()) return;
    this.cerrarMenu();
    this.formulario.set(estudianteId);
  }

  /** Una matrícula individual guardada. Si `seguir`, el formulario queda abierto. */
  protected matriculaGuardada(evento: { matricula: Matricula; seguir: boolean }): void {
    this.agregarMatriculas([evento.matricula]);
    this.seleccion.update((s) => {
      const nueva = new Set(s);
      nueva.delete(evento.matricula.estudianteId);
      return nueva;
    });
    if (!evento.seguir) this.formulario.set(undefined);
  }

  /** El formulario se cerró: si hubo una tanda, se resume en el aviso. */
  protected formularioCerrado(evento: { guardadas: number; ultima: string | null }): void {
    this.formulario.set(undefined);
    if (evento.guardadas > 1) {
      this.avisar('ok', `${evento.guardadas} matrículas guardadas en esta tanda. La última: ${evento.ultima}, año ${this.anio()}.`);
    } else if (evento.guardadas === 1) {
      this.avisar('ok', `Matrícula guardada: ${evento.ultima}, año ${this.anio()}.`);
    }
  }

  /** Un acudiente nuevo queda en la ficha del estudiante, también en esta pantalla. */
  protected acudienteAgregado(evento: { estudianteId: string; agregado: AcudienteAgregado }): void {
    this.datos.update((d) => d === null ? d : {
      ...d,
      estudiantes: d.estudiantes.map((e) => e.id === evento.estudianteId
        ? { ...e, acudientes: [...e.acudientes, evento.agregado.acudiente] }
        : e),
    });
  }

  protected abrirRetiro(m: Matricula): void {
    this.cerrarMenu();
    this.enRetiro.set(m);
  }

  protected retiroGuardado(m: Matricula): void {
    this.enRetiro.set(null);
    this.reemplazarMatricula(m);
    this.avisar('neutral', `${this.nombreDe(m.estudianteId)} quedó retirado del año ${m.anio}. Sus notas se conservan.`);
  }

  protected abrirCambio(m: Matricula): void {
    this.cerrarMenu();
    this.enCambio.set(m);
  }

  protected cambioGuardado(m: Matricula): void {
    this.enCambio.set(null);
    this.reemplazarMatricula(m);
    this.avisar('ok', `${this.nombreDe(m.estudianteId)} pasó a ${curso(m.grado, m.grupo)}, ${this.catalogo()?.nombreSede(m.sedeId)}.`);
  }

  // ─────────────────────────────────────────────────────────────
  // Presentación
  // ─────────────────────────────────────────────────────────────

  /** Rótulo e ícono de una acción, como los define `recursos` (con respaldo mientras carga). */
  protected accion(codigo: string): AccionDeModulo {
    return this.opciones()?.acciones[codigo] ?? ACCIONES_POR_DEFECTO[codigo] ?? { etiqueta: codigo, icono: null };
  }

  protected nombreDe(estudianteId: string): string {
    const e = this.estudiantesPorId().get(estudianteId);
    return e ? `${e.nombres} ${e.apellidos}` : '';
  }

  protected acudienteDe(m: Matricula): { nombre: string; parentesco: string } | null {
    if (m.acudienteId === null) return null;
    return this.estudiantesPorId().get(m.estudianteId)?.acudientes.find((a) => a.id === m.acudienteId) ?? null;
  }

  protected chip(p: Pendiente): ChipResultado {
    return chipResultado(p.resultado, p.anterior.grado);
  }

  protected textoSugerencia(s: Sugerencia): string {
    const base = s.tipo === 'repite' ? 'Repite' : s.tipo === 'provisional' ? 'Provisional' : 'Sugerido';
    return s.cambiaDeSede ? `${base} · ${this.catalogo()?.nombreSede(s.sedeId)}` : base;
  }

  protected cerrarAviso(): void {
    this.aviso.set(null);
  }

  private avisar(tipo: 'ok' | 'neutral', texto: string): void {
    this.aviso.set({ tipo, texto });
  }

  private agregarMatriculas(nuevas: Matricula[]): void {
    this.datos.update((d) => d === null ? d : { ...d, matriculas: [...d.matriculas, ...nuevas] });
    this.resaltar(nuevas.flatMap((m) => [m.id, m.estudianteId]));
  }

  private reemplazarMatricula(m: Matricula): void {
    this.datos.update((d) => d === null ? d : {
      ...d,
      matriculas: d.matriculas.map((x) => (x.id === m.id ? m : x)),
    });
    this.resaltar([m.id]);
  }

  private resaltar(ids: string[]): void {
    this.resaltadas.set(new Set(ids));
    setTimeout(() => {
      if (ids.some((id) => this.resaltadas().has(id))) this.resaltadas.set(new Set());
    }, 4000);
  }
}
