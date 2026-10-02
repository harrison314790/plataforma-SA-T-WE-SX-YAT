import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  AnioBoletin,
  Boletin,
  EstudianteDeCurso,
  OpcionesBoletin,
} from '../../../../core/interfaces/nudo.interface';
import { AuthService } from '../../../../core/servicios/auth.service';
import { BoletinesService } from '../../../../core/servicios/boletines.service';
import { mensajeDeError } from '../../../../core/servicios/error-api';
import { EstadoCargandoComponent } from '../../../../shared/componentes/estado-cargando/estado-cargando.component';
import { EstadoErrorComponent } from '../../../../shared/componentes/estado-error/estado-error.component';
import { EstadoVacioComponent } from '../../../../shared/componentes/estado-vacio/estado-vacio.component';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { SinPermisoComponent } from '../../../../shared/componentes/sin-permiso/sin-permiso.component';
import { HojaBoletinComponent } from '../../componentes/hoja-boletin/hoja-boletin.component';

const EPOCAS = ['Primera Época', 'Segunda Época', 'Tercera Época', 'Cuarta Época'];

/**
 * Boletines por nudo pedagógico.
 *
 * Una pantalla, dos modos según el rol:
 * · admin: año + sede + curso arriba (como los filtros de Asignaciones),
 *   la lista del curso a la izquierda y el boletín a la derecha. Con
 *   Anterior/Siguiente se revisa el curso entero sin volver a elegir --
 *   que es lo que se hace al cierre de cada época.
 * · estudiante: directamente el suyo, con una pestaña por cada año que
 *   estuvo matriculado (2026, 2025, 2024...) para consultar los
 *   anteriores. Se muestran aunque haya un solo año: así el estudiante
 *   sabe de qué año es la hoja que está viendo.
 *
 * El modo por rol es solo presentación: el backend decide qué puede pedir
 * cada uno (`/boletines/mio` no recibe id; `/estudiantes/{id}` exige
 * admin) y RLS respalda las dos cosas.
 *
 * El profesor no llega acá (sin `vista_boletines`): RLS solo le deja ver
 * las notas de sus materias, y el nudo le saldría calculado con una sola.
 */
@Component({
  selector: 'app-boletines',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EstadoCargandoComponent,
    EstadoErrorComponent,
    EstadoVacioComponent,
    HojaBoletinComponent,
    IconoComponent,
    NgTemplateOutlet,
    SinPermisoComponent,
  ],
  host: { class: 'modulo-nudos' },
  templateUrl: './boletines.component.html',
})
export class BoletinesComponent {
  private readonly servicio = inject(BoletinesService);
  private readonly auth = inject(AuthService);

  protected readonly esAdmin = computed(() => ['admin', 'super_admin'].includes(this.auth.rol() ?? ''));

  // Selección (modo admin).
  protected readonly opciones = signal<OpcionesBoletin | null>(null);
  protected readonly anio = signal<number | null>(null);
  protected readonly sedeId = signal<number | null>(null);
  protected readonly curso = signal<string | null>(null); // "6|A"
  protected readonly estudiantes = signal<EstudianteDeCurso[]>([]);
  protected readonly cargandoEstudiantes = signal(false);
  protected readonly estudianteId = signal<string | null>(null);

  // Modo estudiante.
  protected readonly aniosPropios = signal<AnioBoletin[]>([]);

  protected readonly boletin = signal<Boletin | null>(null);
  protected readonly cargando = signal(true);
  protected readonly cargandoBoletin = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sinPermiso = signal(false);

  protected readonly cursos = computed(() =>
    (this.opciones()?.ofertaGrados ?? []).filter((o) => o.sedeId === this.sedeId()),
  );

  /** '6° A · Sede Principal', cabecera de la lista del curso. */
  protected readonly cursoTexto = computed(() => {
    const curso = this.curso();
    if (curso === null) return '';
    const [grado, grupo] = curso.split('|');
    const sede = this.opciones()?.sedes.find((s) => s.id === this.sedeId())?.nombre;
    return `${grado}° ${grupo}${sede ? ' · ' + sede : ''}`;
  });

  /** Cómo se calcularon los nudos de este boletín, dicho en una línea. */
  protected readonly calculo = computed(() => {
    const b = this.boletin();
    if (b === null) return '';
    return !b.esPrimaria && b.nudos.some((n) => n.materias.some((m) => m.peso !== null))
      ? 'Por porcentajes'
      : 'Promedio simple';
  });

  /** 'Cátedra de Paz y Emprendimiento': materias del curso sin nudo. */
  protected readonly nombresSinNudo = computed(() => {
    const nombres = (this.boletin()?.sinNudo ?? []).map((m) => m.nombre);
    if (nombres.length <= 1) return nombres.join('');
    return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
  });

  protected readonly posicion = computed(() =>
    this.estudiantes().findIndex((e) => e.id === this.estudianteId()),
  );

  /**
   * Lo que el admin quiere saber antes de imprimir, sacado del mismo
   * boletín (sin otra consulta): la época que se está entregando, su
   * promedio, qué nudos quedan en desempeño bajo y qué notas faltan.
   */
  protected readonly resumen = computed(() => {
    const b = this.boletin();
    if (b === null) return null;

    let epoca = -1;
    b.promedioGeneral.forEach((p, i) => {
      if (p !== null) epoca = i;
    });
    if (epoca === -1) return { epoca: null, promedio: null, enBajo: [], faltantes: [] };

    return {
      epoca: EPOCAS[epoca] ?? `Período ${epoca + 1}`,
      promedio: b.promedioGeneral[epoca],
      enBajo: b.nudos
        .filter((n) => (n.periodos[epoca]?.nota ?? 5) < 3)
        .map((n) => n.nombre),
      faltantes: b.nudos.flatMap((n) =>
        n.materias.filter((m) => m.notas[epoca] === null).map((m) => m.nombre),
      ),
    };
  });

  constructor() {
    void this.iniciar();
  }

  private async iniciar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);

    try {
      if (this.esAdmin()) {
        const opciones = await this.servicio.opciones();
        this.opciones.set(opciones);
        this.anio.set(opciones.anioSugerido);
      } else {
        const propio = await this.servicio.mio(null);
        this.aniosPropios.set(propio.anios);
        this.anio.set(propio.boletin.anio);
        this.boletin.set(propio.boletin);
      }
    } catch (err) {
      this.manejarError(err, 'No pudimos cargar el boletín.');
    } finally {
      this.cargando.set(false);
    }
  }

  protected reintentar(): void {
    if (this.esAdmin() && this.opciones() !== null) {
      void this.cargarBoletin();
    } else if (!this.esAdmin() && this.aniosPropios().length > 0) {
      // Reintentar el año que eligió, no volver al más reciente.
      void this.elegirAnio(String(this.anio()));
    } else {
      void this.iniciar();
    }
  }

  private manejarError(err: unknown, respaldo: string): void {
    if (err instanceof HttpErrorResponse && err.status === 403) {
      this.sinPermiso.set(true);
      return;
    }
    this.error.set(mensajeDeError(err, respaldo));
  }

  protected async elegirAnio(valor: string): Promise<void> {
    this.anio.set(Number(valor));
    this.error.set(null);

    if (this.esAdmin()) {
      await this.cargarEstudiantes();
      await this.cargarBoletin();
      return;
    }

    this.cargandoBoletin.set(true);
    try {
      const propio = await this.servicio.mio(this.anio());
      this.aniosPropios.set(propio.anios);
      this.boletin.set(propio.boletin);
    } catch (err) {
      this.manejarError(err, 'No pudimos cargar el boletín de ese año.');
    } finally {
      this.cargandoBoletin.set(false);
    }
  }

  protected elegirSede(valor: string): void {
    this.sedeId.set(valor === '' ? null : Number(valor));
    this.curso.set(null);
    this.estudiantes.set([]);
    this.estudianteId.set(null);
    this.boletin.set(null);
  }

  protected async elegirCurso(valor: string): Promise<void> {
    this.curso.set(valor === '' ? null : valor);
    this.estudianteId.set(null);
    this.boletin.set(null);
    await this.cargarEstudiantes();

    // Abrir el primero ahorra un clic en el caso más común (revisar el
    // curso de arriba abajo).
    const primero = this.estudiantes()[0];
    if (primero) await this.elegirEstudiante(primero.id);
  }

  protected async elegirEstudiante(id: string): Promise<void> {
    if (id === this.estudianteId() && this.boletin() !== null) return;
    this.estudianteId.set(id);
    await this.cargarBoletin();
  }

  protected async mover(paso: -1 | 1): Promise<void> {
    const siguiente = this.estudiantes()[this.posicion() + paso];
    if (siguiente) await this.elegirEstudiante(siguiente.id);
  }

  private async cargarEstudiantes(): Promise<void> {
    const anio = this.anio();
    const sede = this.sedeId();
    const curso = this.curso();

    if (anio === null || sede === null || curso === null) {
      this.estudiantes.set([]);
      return;
    }

    const [grado, grupo] = curso.split('|');

    this.cargandoEstudiantes.set(true);
    try {
      const lista = await this.servicio.estudiantes(anio, sede, Number(grado), grupo);
      this.estudiantes.set(lista);

      if (!lista.some((e) => e.id === this.estudianteId())) {
        this.estudianteId.set(null);
        this.boletin.set(null);
      }
    } catch (err) {
      this.manejarError(err, 'No pudimos cargar los estudiantes de ese curso.');
    } finally {
      this.cargandoEstudiantes.set(false);
    }
  }

  private async cargarBoletin(): Promise<void> {
    const anio = this.anio();
    const id = this.estudianteId();
    this.error.set(null);

    if (anio === null || id === null) {
      this.boletin.set(null);
      return;
    }

    this.cargandoBoletin.set(true);
    try {
      this.boletin.set(await this.servicio.deEstudiante(id, anio));
    } catch (err) {
      this.boletin.set(null);
      this.manejarError(err, 'No pudimos cargar el boletín.');
    } finally {
      this.cargandoBoletin.set(false);
    }
  }

  protected nota(valor: number | null): string {
    return valor === null ? '—' : valor.toFixed(1).replace('.', ',');
  }

  protected imprimir(): void {
    window.print();
  }
}
