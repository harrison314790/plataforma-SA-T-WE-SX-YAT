import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { AccionDeModulo } from '../../../../core/interfaces/asignacion.interface';
import type {
  CuentaUsuario,
  OpcionesUsuarios,
  TipoCuenta,
} from '../../../../core/interfaces/cuenta-usuario.interface';
import { AuthService } from '../../../../core/servicios/auth.service';
import { ConexionService } from '../../../../core/servicios/conexion.service';
import { codigoDeError, detallesDeError, mensajeDeError } from '../../../../core/servicios/error-api';
import { UsuariosService } from '../../../../core/servicios/usuarios.service';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { SinPermisoComponent } from '../../../../shared/componentes/sin-permiso/sin-permiso.component';
import { HasRoleDirective } from '../../../../shared/directivas/has-role.directive';
import { DialogoCuentaCreadaComponent } from '../../componentes/dialogo-cuenta-creada/dialogo-cuenta-creada.component';
import { DialogoEliminarUsuarioComponent } from '../../componentes/dialogo-eliminar-usuario/dialogo-eliminar-usuario.component';
import {
  FormularioUsuarioComponent,
  type GuardadoCuenta,
} from '../../componentes/formulario-usuario/formulario-usuario.component';

type FiltroEstado = 'activos' | 'inactivos' | 'todos';

/** El menú "Más opciones" abierto: de qué fila, y dónde pintarlo. */
interface MenuAbierto {
  id: string;
  /** Se abre hacia arriba cuando no cabe debajo del botón. */
  haciaArriba: boolean;
  top: string;
  bottom: string;
  right: string;
}

const PESTANAS: { tipo: TipoCuenta; rotulo: string }[] = [
  { tipo: 'profesor', rotulo: 'Profesores' },
  { tipo: 'estudiante', rotulo: 'Estudiantes' },
];

const ESTADOS: { valor: FiltroEstado; rotulo: string }[] = [
  { valor: 'activos', rotulo: 'Activos' },
  { valor: 'inactivos', rotulo: 'Inactivos' },
  { valor: 'todos', rotulo: 'Todos' },
];

/** Para buscar "Chocue" y encontrar "Chocué": sin tildes y en minúsculas. */
const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * El módulo de Usuarios: cuentas de profesores y estudiantes. SOLO la
 * cuenta y su identidad -- el grado/grupo/sede del estudiante son de
 * Matrículas, y las materias del profesor, de Asignaciones.
 *
 * Componente de ruta y dueño de todo el estado de la pantalla, como
 * TablaAsignacionesComponent: el formulario y los dos diálogos reciben
 * datos y emiten intenciones.
 *
 * TODO SE FILTRA EN EL CLIENTE. La lista completa (las dos pestañas)
 * llega en una petición, y el buscador y el filtro de estado trabajan
 * sobre ella. Es lo que permite que los conteos de "Activos 12 /
 * Inactivos 3 / Todos 15" se actualicen al escribir sin pedir nada al
 * servidor -- con la señal de una vereda, cada round-trip por tecla se
 * siente.
 *
 * LOS CINCO ESTADOS
 * · cargando -> skeleton con la forma de la fila (avatar + nombre), con
 *   las pestañas y el buscador ya visibles.
 * · vacío -> dos textos: "todavía no hay cuentas" (salida: crear la
 *   primera) y "nadie coincide" (salida: limpiar filtros).
 * · error -> bloque propio con Reintentar (mismo diseño del mockup).
 * · sin permiso -> 403 en vuelo (el guard ya cubre la entrada).
 * · sin conexión -> los botones de escribir se deshabilitan con su
 *   motivo, y el formulario lo dice adentro.
 */
@Component({
  selector: 'app-gestion-usuarios',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogoCuentaCreadaComponent,
    DialogoEliminarUsuarioComponent,
    FormularioUsuarioComponent,
    HasRoleDirective,
    IconoComponent,
    SinPermisoComponent,
  ],
  templateUrl: './gestion-usuarios.component.html',
  host: {
    '(document:mousedown)': 'cerrarMenuSiEsFuera($event)',
    '(document:keydown.escape)': 'cerrarMenu()',
  },
})
export class GestionUsuariosComponent {
  private readonly servicio = inject(UsuariosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);
  private readonly conexion = inject(ConexionService);

  protected readonly pestanas = PESTANAS;
  /** Anchos del skeleton: desparejos, como nombres reales. */
  protected readonly anchosEsqueleto = ['58%', '44%', '66%', '50%', '62%', '40%'];
  protected readonly estados = ESTADOS;
  protected readonly enLinea = this.conexion.enLinea;

  protected readonly cuentas = signal<CuentaUsuario[]>([]);
  protected readonly opciones = signal<OpcionesUsuarios | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly sinPermiso = signal(false);

  protected readonly pestana = signal<TipoCuenta>('profesor');
  protected readonly busqueda = signal('');
  protected readonly estado = signal<FiltroEstado>('activos');

  protected readonly menu = signal<MenuAbierto | null>(null);

  protected readonly formularioAbierto = signal(false);
  protected readonly enFormulario = signal<CuentaUsuario | null>(null);
  protected readonly guardando = signal(false);
  protected readonly erroresDeCampo = signal<Record<string, string[]>>({});
  protected readonly errorDelFormulario = signal<string | null>(null);

  /** La cuenta recién creada y su contraseña: lo único que la muestra. */
  protected readonly creada = signal<{ cuenta: CuentaUsuario; contrasena: string } | null>(null);

  protected readonly enBorrado = signal<CuentaUsuario | null>(null);
  protected readonly errorDelBorrado = signal<string | null>(null);

  /**
   * Confirmación de la última acción. `neutral` para desactivar: no es un
   * error, pero tampoco una buena noticia que pintar en turquesa.
   */
  protected readonly aviso = signal<{ tipo: 'ok' | 'neutral'; texto: string } | null>(null);
  /** Error de una acción que no tiene modal abierto donde mostrarse. */
  protected readonly errorDeAccion = signal<string | null>(null);

  /** La fila recién creada o editada, resaltada unos segundos para encontrarla. */
  protected readonly resaltada = signal<string | null>(null);

  // ─────────────────────────────────────────────────────────────
  // Derivados
  // ─────────────────────────────────────────────────────────────

  protected readonly esProfesores = computed(() => this.pestana() === 'profesor');

  protected readonly conteoPorTipo = computed(() => {
    const conteo: Record<TipoCuenta, number> = { profesor: 0, estudiante: 0 };
    for (const cuenta of this.cuentas()) conteo[cuenta.tipo]++;
    return conteo;
  });

  /** Las de la pestaña que coinciden con el buscador (antes del filtro de estado). */
  private readonly coincidentes = computed(() => {
    const termino = normalizar(this.busqueda().trim());

    return this.cuentas().filter((cuenta) => {
      if (cuenta.tipo !== this.pestana()) return false;
      if (!termino) return true;

      return (
        normalizar(`${cuenta.nombres} ${cuenta.apellidos}`).includes(termino) ||
        normalizar(`${cuenta.apellidos} ${cuenta.nombres}`).includes(termino) ||
        cuenta.documento.includes(termino)
      );
    });
  });

  protected readonly conteoPorEstado = computed(() => {
    const lista = this.coincidentes();
    const activos = lista.filter((cuenta) => cuenta.activo).length;
    return { activos, inactivos: lista.length - activos, todos: lista.length };
  });

  /** Lo que pinta la tabla. El orden por apellido lo trae ya el backend. */
  protected readonly visibles = computed(() => {
    const estado = this.estado();
    return this.coincidentes().filter((cuenta) =>
      estado === 'todos' ? true : estado === 'activos' ? cuenta.activo : !cuenta.activo,
    );
  });

  protected readonly hayFiltros = computed(
    () => this.busqueda().trim() !== '' || this.estado() !== 'todos',
  );

  protected readonly textoConteo = computed(() => {
    const n = this.visibles().length;
    const sustantivo = this.esProfesores()
      ? n === 1 ? 'profesor' : 'profesores'
      : n === 1 ? 'estudiante' : 'estudiantes';
    const estado = this.estado();
    const adjetivo = estado === 'todos' ? '' : ` ${n === 1 ? estado.slice(0, -1) : estado}`;
    return `${n} ${sustantivo}${adjetivo}`;
  });

  protected readonly textoNuevo = computed(() =>
    this.esProfesores() ? 'Nuevo profesor' : 'Nuevo estudiante',
  );

  protected readonly cuentaDelMenu = computed(() => {
    const menu = this.menu();
    return menu === null ? null : this.cuentas().find((cuenta) => cuenta.id === menu.id) ?? null;
  });

  constructor() {
    this.leerUrl();
    void this.cargar();

    // El menú es `position: fixed` y se pinta donde estaba el botón al
    // abrirlo. Si la página se desplaza, quedaría flotando sobre otra
    // fila: se cierra. `true` = fase de captura, para enterarse también
    // del scroll del `<main>` del shell y del de la tabla, que no burbujean.
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
      const [cuentas, opciones] = await Promise.all([
        this.servicio.listar(),
        this.opciones() === null ? this.servicio.opciones() : Promise.resolve(this.opciones()!),
      ]);
      this.cuentas.set(cuentas);
      this.opciones.set(opciones);
    } catch (err) {
      this.manejarErrorDeCarga(err);
    } finally {
      this.cargando.set(false);
    }
  }

  private async recargarListado(): Promise<void> {
    try {
      this.cuentas.set(await this.servicio.listar());
    } catch (err) {
      this.manejarErrorDeCarga(err);
    }
  }

  private manejarErrorDeCarga(err: unknown): void {
    if (err instanceof HttpErrorResponse && err.status === 403) {
      this.sinPermiso.set(true);
      return;
    }
    this.error.set(mensajeDeError(err, 'Puede ser la señal o el servidor. No se perdió nada.'));
  }

  // ─────────────────────────────────────────────────────────────
  // Pestañas y filtros (en la URL, para sobrevivir a una recarga)
  // ─────────────────────────────────────────────────────────────

  protected elegirPestana(tipo: TipoCuenta): void {
    if (tipo === this.pestana()) return;
    this.pestana.set(tipo);
    this.busqueda.set('');
    this.aviso.set(null);
    this.cerrarMenu();
    this.escribirUrl();
  }

  protected buscar(texto: string): void {
    this.busqueda.set(texto);
    this.cerrarMenu();
    this.escribirUrl();
  }

  protected elegirEstado(estado: FiltroEstado): void {
    this.estado.set(estado);
    this.cerrarMenu();
    this.escribirUrl();
  }

  protected limpiarFiltros(): void {
    this.busqueda.set('');
    this.estado.set('todos');
    this.escribirUrl();
  }

  private leerUrl(): void {
    const parametros = this.ruta.snapshot.queryParamMap;
    if (parametros.get('tipo') === 'estudiante') this.pestana.set('estudiante');

    const estado = parametros.get('estado');
    if (estado === 'inactivos' || estado === 'todos') this.estado.set(estado);

    this.busqueda.set(parametros.get('q') ?? '');
  }

  private escribirUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: {
        // Los valores por defecto no viajan: la URL limpia es la pantalla
        // como se abre desde el menú.
        tipo: this.pestana() === 'profesor' ? null : this.pestana(),
        estado: this.estado() === 'activos' ? null : this.estado(),
        q: this.busqueda().trim() || null,
      },
      replaceUrl: true,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Menú "Más opciones"
  // ─────────────────────────────────────────────────────────────

  protected alternarMenu(evento: MouseEvent, cuenta: CuentaUsuario): void {
    evento.stopPropagation();

    if (this.menu()?.id === cuenta.id) {
      this.cerrarMenu();
      return;
    }

    // Alto aproximado del menú + el tooltip de "Eliminar" deshabilitado:
    // si no cabe debajo del botón, se abre hacia arriba. Sin esto, el
    // menú de las últimas filas quedaba cortado por el borde inferior.
    const caja = (evento.currentTarget as HTMLElement).getBoundingClientRect();
    const altoMenu = 104;
    const altoTooltip = 72;
    const haciaArriba =
      caja.bottom + 4 + altoMenu + altoTooltip > window.innerHeight && caja.top - 4 - altoMenu > 8;
    const right = Math.min(Math.max(8, window.innerWidth - caja.right), window.innerWidth - 228);

    this.menu.set({
      id: cuenta.id,
      haciaArriba,
      top: haciaArriba ? 'auto' : `${caja.bottom + 4}px`,
      bottom: haciaArriba ? `${window.innerHeight - caja.top + 4}px` : 'auto',
      right: `${right}px`,
    });
  }

  protected cerrarMenu(): void {
    if (this.menu() !== null) this.menu.set(null);
  }

  /** Clic fuera del menú (y fuera de su propio botón, que ya lo alterna). */
  protected cerrarMenuSiEsFuera(evento: MouseEvent): void {
    if (this.menu() === null) return;
    const objetivo = evento.target as HTMLElement | null;
    if (objetivo?.closest('.menu-opciones, [aria-haspopup="menu"]')) return;
    this.cerrarMenu();
  }

  // ─────────────────────────────────────────────────────────────
  // Alta y edición
  // ─────────────────────────────────────────────────────────────

  protected abrirAlta(): void {
    this.cerrarMenu();
    this.enFormulario.set(null);
    this.abrirFormulario();
  }

  protected abrirEdicion(cuenta: CuentaUsuario): void {
    this.cerrarMenu();
    this.enFormulario.set(cuenta);
    this.abrirFormulario();
  }

  private abrirFormulario(): void {
    this.erroresDeCampo.set({});
    this.errorDelFormulario.set(null);
    this.formularioAbierto.set(true);
  }

  protected cerrarFormulario(): void {
    this.formularioAbierto.set(false);
    this.enFormulario.set(null);
  }

  protected async guardarFormulario(guardado: GuardadoCuenta): Promise<void> {
    this.guardando.set(true);
    this.erroresDeCampo.set({});
    this.errorDelFormulario.set(null);

    try {
      if (guardado.modo === 'alta') {
        const cuenta = await this.servicio.crear(guardado.datos);
        this.cerrarFormulario();

        // La fila nueva tiene que verse: se limpia el buscador y, si se
        // estaba mirando "Inactivos", se pasa a "Activos" (nace activa).
        this.busqueda.set('');
        if (this.estado() === 'inactivos') this.estado.set('activos');
        this.escribirUrl();

        this.aviso.set(null);
        this.creada.set({ cuenta, contrasena: guardado.datos.password });
        this.resaltar(cuenta.id, 5000);
      } else {
        const previa = this.enFormulario()!;
        const cuenta = await this.servicio.actualizar(previa.id, guardado.datos);
        this.cerrarFormulario();

        if (previa.activo && !cuenta.activo) {
          this.avisar('neutral', `Cuenta de ${cuenta.nombreCompleto} desactivada. Ya no podrá iniciar sesión; sus datos se conservan.`);
        } else if (!previa.activo && cuenta.activo) {
          this.avisar('ok', `Cuenta de ${cuenta.nombreCompleto} activada de nuevo.`);
        } else {
          this.avisar('ok', `Cambios guardados · ${cuenta.nombreCompleto}.`);
        }
        this.resaltar(cuenta.id, 3000);
      }

      await this.recargarListado();
    } catch (err) {
      const detalles = detallesDeError(err);
      this.erroresDeCampo.set(detalles);
      this.errorDelFormulario.set(
        Object.keys(detalles).length > 0 ? null : mensajeDeError(err, 'No se pudo guardar la cuenta.'),
      );
    } finally {
      this.guardando.set(false);
    }
  }

  protected cerrarCreada(): void {
    const creada = this.creada();
    this.creada.set(null);
    if (creada !== null) this.avisar('ok', `Cuenta de ${creada.cuenta.nombreCompleto} creada.`);
  }

  // ─────────────────────────────────────────────────────────────
  // Eliminar
  // ─────────────────────────────────────────────────────────────

  protected abrirBorrado(cuenta: CuentaUsuario): void {
    this.cerrarMenu();
    this.errorDelBorrado.set(null);
    this.enBorrado.set(cuenta);
  }

  protected cerrarBorrado(): void {
    this.enBorrado.set(null);
  }

  protected async eliminar(): Promise<void> {
    const cuenta = this.enBorrado();
    if (cuenta === null) return;

    this.guardando.set(true);
    this.errorDelBorrado.set(null);

    try {
      await this.servicio.eliminar(cuenta.id);
      this.cerrarBorrado();
      this.avisar('ok', `Cuenta de ${cuenta.nombreCompleto} eliminada.`);
      await this.recargarListado();
    } catch (err) {
      // Se abrió como eliminable y el servidor dice que ya no: alguien le
      // cargó datos entremedio (la matricularon, le asignaron una
      // materia). Se cierra el diálogo y se refresca, para que el menú
      // pase a mostrar "Eliminar" deshabilitado con su explicación.
      if (codigoDeError(err) === 'USUARIO_CON_DATOS') {
        this.cerrarBorrado();
        this.errorDeAccion.set(mensajeDeError(err, 'Esta cuenta ya tiene datos asociados.'));
        await this.recargarListado();
        return;
      }

      this.errorDelBorrado.set(mensajeDeError(err, 'No se pudo eliminar la cuenta.'));
    } finally {
      this.guardando.set(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Presentación
  // ─────────────────────────────────────────────────────────────

  /** Rótulo e ícono de una acción, como los define `recursos`. */
  protected accion(codigo: string): AccionDeModulo {
    return this.opciones()?.acciones[codigo] ?? { etiqueta: codigo, icono: null };
  }

  protected cerrarAviso(): void {
    this.aviso.set(null);
  }

  private avisar(tipo: 'ok' | 'neutral', texto: string): void {
    this.errorDeAccion.set(null);
    this.aviso.set({ tipo, texto });
  }

  private resaltar(id: string, ms: number): void {
    this.resaltada.set(id);
    setTimeout(() => {
      if (this.resaltada() === id) this.resaltada.set(null);
    }, ms);
  }
}
