import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  AccionDeModulo,
  Asignacion,
  FiltrosAsignaciones,
  OpcionesAsignaciones,
} from '../../../../core/interfaces/asignacion.interface';
import { AsignacionesService } from '../../../../core/servicios/asignaciones.service';
import { AuthService } from '../../../../core/servicios/auth.service';
import { ConexionService } from '../../../../core/servicios/conexion.service';
import {
  codigoDeError,
  detallesDeError,
  mensajeDeError,
} from '../../../../core/servicios/error-api';
import { EstadoCargandoComponent } from '../../../../shared/componentes/estado-cargando/estado-cargando.component';
import { EstadoErrorComponent } from '../../../../shared/componentes/estado-error/estado-error.component';
import { EstadoVacioComponent } from '../../../../shared/componentes/estado-vacio/estado-vacio.component';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { SinPermisoComponent } from '../../../../shared/componentes/sin-permiso/sin-permiso.component';
import { HasRoleDirective } from '../../../../shared/directivas/has-role.directive';
import { DialogoEliminarAsignacionComponent } from '../../componentes/dialogo-eliminar-asignacion/dialogo-eliminar-asignacion.component';
import { FiltrosAsignacionesComponent } from '../../componentes/filtros-asignaciones/filtros-asignaciones.component';
import { GestionGradosComponent } from '../../componentes/gestion-grados/gestion-grados.component';
import {
  FormularioAsignacionComponent,
  type GuardadoAsignacion,
} from '../formulario-asignacion/formulario-asignacion.component';

const SIN_FILTROS: FiltrosAsignaciones = {
  anio: null,
  sedeId: null,
  grado: null,
  grupo: null,
  profesorId: null,
  asignaturaId: null,
};

/**
 * El "list" del módulo: qué asignatura dicta cada profesor, en qué grado
 * y grupo, para un año escolar.
 *
 * Es el componente de ruta y el dueño del estado de la pantalla. Los
 * filtros, el formulario y el diálogo de borrado son piezas sin estado
 * propio: reciben datos y emiten intenciones, y todo lo que persiste vive
 * acá. Un solo lugar donde mirar cuando algo queda desincronizado.
 *
 * LOS CINCO ESTADOS OBLIGATORIOS, Y DÓNDE ESTÁ CADA UNO
 * · cargando -> `<app-estado-cargando>`, skeleton de filas: la estructura
 *   de la tabla se ve mientras llegan los datos.
 * · vacío -> dos textos distintos según haya filtros o no. "No hay
 *   asignaciones todavía" y "ningún resultado con estos filtros" tienen
 *   salidas opuestas (crear una / limpiar los filtros), y un solo mensaje
 *   para las dos manda a la persona al lado equivocado.
 * · error -> `<app-estado-error>` con reintento, nunca el error crudo.
 * · sin permiso -> el guard de ruta ya evita entrar, pero un 403 en vuelo
 *   también se maneja: pasa si super_admin le quita el permiso al rol
 *   mientras la pestaña está abierta.
 * · sin conexión -> el banner global del shell lo anuncia para toda la
 *   app, y acá además se BLOQUEA el guardado, con el motivo escrito
 *   dentro del formulario. Este módulo no guarda en el equipo, a
 *   diferencia de la tabla de notas: ver el porqué en el docblock de
 *   `sinConexion` en FormularioAsignacionComponent.
 *
 * POR QUÉ LOS FILTROS VIVEN EN LA URL
 * Para que recargar la página, o volver con el botón atrás, no pierda lo
 * que la persona estaba mirando. En una zona con conectividad
 * intermitente la pestaña se recarga sola más seguido de lo que uno
 * quisiera, y volver a poner cuatro filtros a mano cada vez es la clase
 * de fricción que hace que la gente deje de usar los filtros.
 */
@Component({
  selector: 'app-tabla-asignaciones',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogoEliminarAsignacionComponent,
    EstadoCargandoComponent,
    EstadoErrorComponent,
    EstadoVacioComponent,
    FiltrosAsignacionesComponent,
    FormularioAsignacionComponent,
    GestionGradosComponent,
    HasRoleDirective,
    IconoComponent,
    SinPermisoComponent,
  ],
  templateUrl: './tabla-asignaciones.component.html',
})
export class TablaAsignacionesComponent {
  private readonly servicio = inject(AsignacionesService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);
  private readonly conexion = inject(ConexionService);

  /**
   * El formulario abierto, para poder dejarlo listo para la siguiente
   * alta después de un "Guardar y crear otra". Es una llamada a un método
   * y no un input más porque es un EVENTO ("ya guardé, prepará la
   * siguiente"), no un estado: modelarlo como input obligaría a un
   * contador que se incrementa, que es la misma orden disfrazada de dato.
   */
  private readonly formulario = viewChild(FormularioAsignacionComponent);

  /** El quinto estado, leído del service global. */
  protected readonly enLinea = this.conexion.enLinea;

  protected readonly asignaciones = signal<Asignacion[]>([]);
  protected readonly opciones = signal<OpcionesAsignaciones | null>(null);
  protected readonly filtros = signal<FiltrosAsignaciones>(SIN_FILTROS);

  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly sinPermiso = signal(false);

  /** La asignación que está abierta en el formulario. `null` = alta. */
  protected readonly enFormulario = signal<Asignacion | null>(null);
  protected readonly formularioAbierto = signal(false);
  protected readonly guardando = signal(false);
  protected readonly erroresDeCampo = signal<Record<string, string[]>>({});
  protected readonly errorDelFormulario = signal<string | null>(null);

  /** El modal de administración de grados y grupos (`oferta_grados`). */
  protected readonly gestionGradosAbierta = signal(false);

  /** La asignación que está en el diálogo de eliminar/desactivar. */
  protected readonly enBorrado = signal<Asignacion | null>(null);
  protected readonly errorDelBorrado = signal<string | null>(null);

  /** Confirmación breve de la última acción ("Asignación creada"). */
  protected readonly aviso = signal<string | null>(null);

  /**
   * Error de una acción sobre una fila (reactivar, por ejemplo), separado
   * de `error()` a propósito.
   *
   * `error()` es el estado de la PANTALLA: reemplaza la tabla entera por
   * el mensaje con "Reintentar", que es lo correcto cuando la carga
   * falló y no hay nada que mostrar. Usarlo también para un reactivar
   * fallido haría desaparecer una tabla que está perfectamente cargada,
   * por un problema que afecta a una sola fila. Este va como aviso arriba
   * de la tabla, que sigue ahí.
   */
  protected readonly errorDeAccion = signal<string | null>(null);

  protected readonly hayFiltros = computed(
    () => Object.values(this.filtros()).some((valor) => valor !== null),
  );

  constructor() {
    this.filtros.set(this.leerFiltrosDeLaUrl());
    void this.cargar();
  }

  // ─────────────────────────────────────────────────────────────
  // Carga
  // ─────────────────────────────────────────────────────────────

  /**
   * Catálogos y listado en paralelo, no en cadena: son independientes y
   * encadenarlos duplicaría la espera en una conexión lenta. Los
   * catálogos se piden una sola vez por visita; el listado, cada vez que
   * cambia un filtro.
   */
  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.sinPermiso.set(false);

    try {
      const [asignaciones, opciones] = await Promise.all([
        this.servicio.listar(this.filtros()),
        this.opciones() === null ? this.servicio.opciones() : Promise.resolve(this.opciones()!),
      ]);

      this.asignaciones.set(asignaciones);
      this.opciones.set(opciones);
    } catch (err) {
      this.manejarErrorDeCarga(err);
    } finally {
      this.cargando.set(false);
    }
  }

  private async recargarListado(): Promise<void> {
    try {
      this.asignaciones.set(await this.servicio.listar(this.filtros()));
    } catch (err) {
      this.manejarErrorDeCarga(err);
    }
  }

  /**
   * El 403 se distingue del resto: no es un fallo, es una respuesta
   * legítima ("ya no podés ver esto"). Mostrar "reintentar" ahí haría que
   * la persona insista contra una puerta que no se va a abrir.
   */
  private manejarErrorDeCarga(err: unknown): void {
    if (err instanceof HttpErrorResponse && err.status === 403) {
      this.sinPermiso.set(true);
      return;
    }

    this.error.set(mensajeDeError(err, 'No pudimos cargar las asignaciones.'));
  }

  // ─────────────────────────────────────────────────────────────
  // Filtros
  // ─────────────────────────────────────────────────────────────

  protected aplicarFiltros(filtros: FiltrosAsignaciones): void {
    this.filtros.set(filtros);
    this.escribirFiltrosEnLaUrl(filtros);
    void this.recargarListado();
  }

  /** Un clic deja los seis filtros en "todos". */
  protected limpiarFiltros(): void {
    this.aplicarFiltros({ ...SIN_FILTROS });
  }

  private leerFiltrosDeLaUrl(): FiltrosAsignaciones {
    const parametros = this.ruta.snapshot.queryParamMap;
    const numero = (clave: string): number | null => {
      const crudo = parametros.get(clave);
      if (crudo === null || crudo === '') return null;
      const valor = Number(crudo);

      // Un query param se escribe a mano y se comparte por chat: `?grado=x`
      // no debe dejar la pantalla en un estado raro, simplemente se ignora.
      return Number.isFinite(valor) ? valor : null;
    };

    return {
      anio: numero('anio'),
      sedeId: numero('sede'),
      grado: numero('grado'),
      grupo: parametros.get('grupo'),
      profesorId: parametros.get('profesor'),
      asignaturaId: numero('asignatura'),
    };
  }

  private escribirFiltrosEnLaUrl(filtros: FiltrosAsignaciones): void {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: {
        anio: filtros.anio,
        sede: filtros.sedeId,
        grado: filtros.grado,
        grupo: filtros.grupo,
        profesor: filtros.profesorId,
        asignatura: filtros.asignaturaId,
      },
      // `null` quita el parámetro de la URL en vez de dejar `?grado=`.
      // `replaceUrl` para no llenar el historial con un paso por cada
      // filtro tocado -- el botón atrás tiene que salir de la pantalla,
      // no deshacer filtros de a uno.
      replaceUrl: true,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Alta y edición
  // ─────────────────────────────────────────────────────────────

  protected abrirAlta(): void {
    this.enFormulario.set(null);
    this.abrirFormulario();
  }

  protected abrirEdicion(asignacion: Asignacion): void {
    this.enFormulario.set(asignacion);
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

  /**
   * Guardar recarga el listado desde el servidor en vez de insertar la
   * fila devuelta en el array local. Es una petición más, y es a
   * propósito: el orden de la tabla es por grado/grupo/asignatura, así
   * que una fila nueva casi nunca va al final. Reordenar a mano acá sería
   * duplicar en TypeScript el `order by` del backend, con la garantía de
   * que un día dejen de coincidir.
   */
  protected async guardarFormulario({ datos, continuar }: GuardadoAsignacion): Promise<void> {
    this.guardando.set(true);
    this.erroresDeCampo.set({});
    this.errorDelFormulario.set(null);

    const editando = this.enFormulario();

    try {
      if (editando !== null) {
        await this.servicio.actualizar(editando.id, datos);
        this.avisar('Asignación actualizada.');
      } else {
        await this.servicio.crear(datos);
        this.avisar('Asignación creada.');
      }

      await this.recargarListado();

      // "Guardar y crear otra" deja el modal abierto para la siguiente:
      // armar el año escolar son diez o quince altas seguidas. El
      // formulario conserva profesor, grado, grupo y año, y limpia solo la
      // asignatura -- ver `reiniciarParaOtra()`.
      if (continuar && editando === null) {
        this.formulario()?.reiniciarParaOtra();
      } else {
        this.cerrarFormulario();
      }
    } catch (err) {
      this.erroresDeCampo.set(detallesDeError(err));
      this.errorDelFormulario.set(
        Object.keys(detallesDeError(err)).length > 0
          ? null
          : mensajeDeError(err, 'No se pudo guardar la asignación.'),
      );
    } finally {
      this.guardando.set(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Grados y grupos (oferta_grados)
  // ─────────────────────────────────────────────────────────────

  protected abrirGestionGrados(): void {
    this.gestionGradosAbierta.set(true);
  }

  protected cerrarGestionGrados(): void {
    this.gestionGradosAbierta.set(false);
  }

  /**
   * Vuelve a pedir los catálogos después de que se tocó la oferta de
   * grados.
   *
   * Hace falta de verdad: un grado recién dado de alta tiene que
   * aparecer en el formulario de asignaciones sin recargar la página, y
   * uno recién desactivado tiene que dejar de ofrecerse. Los catálogos
   * se piden UNA vez por visita (ver `cargar()`), así que sin esto la
   * copia en memoria quedaría vieja justo después de haberla cambiado.
   *
   * El listado también se recarga: desactivar un grado no borra las
   * asignaciones que ya estaban ahí, pero sí cambia lo que los filtros
   * pueden ofrecer.
   */
  protected async recargarOpciones(): Promise<void> {
    try {
      this.opciones.set(await this.servicio.opciones());
      await this.recargarListado();
    } catch (err) {
      this.errorDeAccion.set(
        mensajeDeError(err, 'Se guardó el cambio, pero no pudimos refrescar la pantalla.'),
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Desactivar, reactivar, eliminar
  // ─────────────────────────────────────────────────────────────

  protected abrirBorrado(asignacion: Asignacion): void {
    this.errorDelBorrado.set(null);
    this.enBorrado.set(asignacion);
  }

  protected cerrarBorrado(): void {
    this.enBorrado.set(null);
  }

  protected async eliminar(): Promise<void> {
    const asignacion = this.enBorrado();
    if (asignacion === null) return;

    this.guardando.set(true);
    this.errorDelBorrado.set(null);

    try {
      await this.servicio.eliminar(asignacion.id);
      this.avisar('Asignación eliminada.');
      this.cerrarBorrado();
      await this.recargarListado();
    } catch (err) {
      // El diálogo abrió creyendo que no había notas (`cantidadNotas` era
      // 0) y el servidor dice que sí: alguien cargó una nota entremedio.
      // Se refresca la fila para que el diálogo cambie de cara y pase a
      // ofrecer "Desactivar", en vez de repetir un error que no se
      // entiende.
      if (codigoDeError(err) === 'ASIGNACION_CON_NOTAS') {
        this.errorDelBorrado.set(
          'Mientras tanto se registró una nota en esta asignación, así que ya no se puede eliminar.',
        );
        await this.recargarListado();
        this.enBorrado.set(
          this.asignaciones().find((a) => a.id === asignacion.id) ?? null,
        );
        return;
      }

      this.errorDelBorrado.set(mensajeDeError(err, 'No se pudo eliminar la asignación.'));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async cambiarEstado(asignacion: Asignacion, activo: boolean): Promise<void> {
    this.guardando.set(true);
    this.errorDelBorrado.set(null);
    this.errorDeAccion.set(null);

    try {
      await this.servicio.cambiarEstado(asignacion.id, activo);
      this.avisar(activo ? 'Asignación reactivada.' : 'Asignación desactivada.');
      this.cerrarBorrado();
      await this.recargarListado();
    } catch (err) {
      const mensaje = mensajeDeError(err, 'No se pudo cambiar el estado de la asignación.');

      // Si el diálogo está abierto, el error va adentro (donde está
      // mirando la persona); si no, como aviso arriba de la tabla. Nunca
      // en `error()`: eso reemplazaría una tabla bien cargada por una
      // pantalla de error, por un fallo de una sola fila.
      if (this.enBorrado() !== null) {
        this.errorDelBorrado.set(mensaje);
      } else {
        this.errorDeAccion.set(mensaje);
      }
    } finally {
      this.guardando.set(false);
    }
  }

  /**
   * Desactivar desde la fila, sin diálogo de confirmación.
   *
   * No lleva confirmación a propósito: es completamente reversible (el
   * botón de al lado la reactiva) y no toca ninguna nota. Pedir "¿estás
   * seguro?" para algo que se deshace en un clic entrena a la gente a
   * confirmar sin leer, que es justo lo que NO se quiere el día que
   * aparezca el diálogo de eliminar, que sí es irreversible.
   */
  protected desactivarDesdeDialogo(): void {
    const asignacion = this.enBorrado();
    if (asignacion !== null) void this.cambiarEstado(asignacion, false);
  }

  /**
   * La vuelta. El diálogo es la única puerta para reactivar, igual que
   * es la única para desactivar -- ninguna de las dos es una acción de
   * la tabla.
   */
  protected reactivarDesdeDialogo(): void {
    const asignacion = this.enBorrado();
    if (asignacion !== null) void this.cambiarEstado(asignacion, true);
  }

  // ─────────────────────────────────────────────────────────────
  // Utilidades de presentación
  // ─────────────────────────────────────────────────────────────

  /**
   * El rótulo y el ícono de una acción, como los define la base.
   *
   * El respaldo (`{ etiqueta: codigo, icono: null }`) cubre el caso de
   * un `codigo` que el código conoce pero la base todavía no tiene
   * sembrado -- pasa entre desplegar y correr la migración. Mejor un
   * botón con el código crudo por unos minutos que una fila de acciones
   * en blanco.
   */
  protected accion(codigo: string): AccionDeModulo {
    return this.opciones()?.acciones[codigo] ?? { etiqueta: codigo, icono: null };
  }

  /** '9-B': la notación informal con la que todos hablan en la sede. */
  protected gradoGrupo(asignacion: Asignacion): string {
    return `${asignacion.grado}-${asignacion.grupo}`;
  }

  private avisar(mensaje: string): void {
    this.errorDeAccion.set(null);
    this.aviso.set(mensaje);
    // Se va solo: es una confirmación, no algo que haya que atender. El
    // `role="status"` del elemento hace que igual lo anuncie un lector de
    // pantalla antes de desaparecer.
    setTimeout(() => this.aviso.set(null), 4000);
  }
}
