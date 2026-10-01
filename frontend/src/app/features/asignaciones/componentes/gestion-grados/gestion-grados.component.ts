import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { OfertaGrado } from '../../../../core/interfaces/asignacion.interface';
import type { SedeResumen } from '../../../../core/interfaces/usuario.interface';
import {
  codigoDeError,
  detallesDeError,
  mensajeDeError,
} from '../../../../core/servicios/error-api';
import { OfertaGradosService } from '../../../../core/servicios/oferta-grados.service';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';

/**
 * Administra `oferta_grados`: qué grado y grupo existe en cada sede.
 *
 * UN SOLO MODAL, NO DOS. El diseño original traía "Nuevo grado/grupo" y
 * "Eliminar grado/grupo" como dos diálogos separados, y eso obligaba a
 * elegir a ciegas en el segundo: para borrar había que acordarse de qué
 * combinaciones existen y cuáles están en uso. Acá la lista ES la
 * pantalla -- se ve todo el catálogo con su estado y su uso, se da de
 * alta arriba, y cada fila trae la acción que le corresponde. Menos
 * código y menos memoria de por medio.
 *
 * POR QUÉ CADA FILA OFRECE UNA ACCIÓN DISTINTA
 * La llave foránea compuesta de `asignaciones`/`matriculas` contra esta
 * tabla impide borrar cualquier combinación que se haya usado alguna vez
 * (08-oferta-grados-por-sede.sql). Entonces:
 * · sin uso    -> "Eliminar", que funciona de verdad.
 * · con uso    -> "Desactivar": el histórico queda intacto y la
 *                 combinación deja de ofrecerse para trabajo nuevo.
 * · inactiva   -> "Reactivar".
 * El conteo viene con la lista, así que la fila ya sabe cuál mostrar sin
 * preguntar nada más.
 *
 * Es el único punto de este módulo que escribe en una tabla que NO es
 * `asignaciones`, y por eso pide su propio permiso
 * (`btn_gestionar_grados`).
 */
@Component({
  selector: 'app-gestion-grados',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, ModalDirective],
  templateUrl: './gestion-grados.component.html',
})
export class GestionGradosComponent implements OnInit {
  private readonly servicio = inject(OfertaGradosService);

  readonly sedes = input.required<SedeResumen[]>();
  /** La sede que está filtrada en la tabla de atrás, si hay una. */
  readonly sedeSugerida = input<number | null>(null);

  /**
   * Se emite cuando el catálogo cambió, para que la pantalla de atrás
   * recargue sus opciones: un grado nuevo tiene que aparecer en el
   * formulario de asignaciones sin recargar la página.
   */
  readonly cambio = output<void>();
  readonly cerrar = output<void>();

  protected readonly filas = signal<OfertaGrado[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);

  // Formulario de alta, arriba de la lista.
  protected readonly nuevaSede = signal<number | null>(null);
  protected readonly nuevoGrado = signal<number | null>(null);
  protected readonly nuevoGrupo = signal('');
  protected readonly erroresDeCampo = signal<Record<string, string[]>>({});

  /** 1..11, los que admite el `check` de la tabla. */
  protected readonly gradosPosibles = Array.from({ length: 11 }, (_, i) => i + 1);

  /**
   * `ngOnInit` y no el constructor, y la diferencia era un bug real: un
   * `input()` todavía NO está vinculado cuando corre el constructor, así
   * que `this.sedeSugerida()` devolvía su valor por defecto (`null`) y
   * la sede sugerida no se aplicaba nunca -- el modal abría siempre en
   * "Elige una sede" aunque la tabla de atrás estuviera filtrada por
   * una. Angular garantiza los inputs recién en `ngOnInit`.
   */
  ngOnInit(): void {
    this.nuevaSede.set(this.sedeSugerida());
    void this.cargar();
  }

  protected readonly puedeCrear = computed(
    () =>
      !this.guardando() &&
      this.nuevaSede() !== null &&
      this.nuevoGrado() !== null &&
      this.nuevoGrupo().trim() !== '',
  );

  /**
   * Agrupadas por sede, que es como se piensa el catálogo ("¿hasta dónde
   * llega La Laguna?"). Una lista plana de 30 filas ordenadas por id no
   * responde esa pregunta sin leerla entera.
   */
  protected readonly porSede = computed(() => {
    const filas = this.filas();

    return this.sedes()
      .map((sede) => ({ sede, filas: filas.filter((f) => f.sedeId === sede.id) }))
      .filter((grupo) => grupo.filas.length > 0);
  });

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);

    try {
      this.filas.set(await this.servicio.listar());
    } catch (err) {
      this.error.set(mensajeDeError(err, 'No pudimos cargar los grados y grupos.'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected async crear(): Promise<void> {
    if (!this.puedeCrear()) return;

    this.guardando.set(true);
    this.erroresDeCampo.set({});
    this.error.set(null);

    try {
      await this.servicio.crear({
        sede_id: this.nuevaSede()!,
        grado: this.nuevoGrado()!,
        // Ya viene normalizado del propio campo (ver `escribirGrupo`);
        // solo se recorta. El backend lo normaliza igual -- esa es la
        // regla que vale, esta es su espejo.
        grupo: this.nuevoGrupo().trim(),
      });

      // Se limpia solo el grupo: dar de alta A, B y C de un mismo grado
      // es el gesto normal acá.
      this.nuevoGrupo.set('');
      await this.cargar();
      this.cambio.emit();
    } catch (err) {
      this.erroresDeCampo.set(detallesDeError(err));

      if (Object.keys(detallesDeError(err)).length === 0) {
        this.error.set(mensajeDeError(err, 'No se pudo crear el grado y grupo.'));
      }
    } finally {
      this.guardando.set(false);
    }
  }

  protected async cambiarEstado(fila: OfertaGrado, activo: boolean): Promise<void> {
    await this.ejecutar(() => this.servicio.cambiarEstado(fila.id, activo));
  }

  protected async eliminar(fila: OfertaGrado): Promise<void> {
    await this.ejecutar(() => this.servicio.eliminar(fila.id));
  }

  /**
   * El envoltorio común de las acciones de fila: bloquea, recarga y
   * traduce el error.
   *
   * `OFERTA_EN_USO` tiene mensaje propio porque significa algo concreto:
   * la lista decía que esa fila no tenía uso y el servidor dice que sí.
   * Pasa si alguien matriculó a un estudiante ahí mientras este modal
   * estaba abierto. Recargar deja la fila mostrando la acción correcta
   * ("Desactivar") en vez de repetir un error que no lleva a ningún lado.
   */
  private async ejecutar(accion: () => Promise<unknown>): Promise<void> {
    this.guardando.set(true);
    this.error.set(null);

    try {
      await accion();
      await this.cargar();
      this.cambio.emit();
    } catch (err) {
      this.error.set(
        codigoDeError(err) === 'OFERTA_EN_USO'
          ? 'Mientras tanto se empezó a usar ese grado y grupo, así que ya no se puede eliminar. Se puede desactivar.'
          : mensajeDeError(err, 'No se pudo completar la acción.'),
      );
      await this.cargar();
    } finally {
      this.guardando.set(false);
    }
  }

  /**
   * Cualquier cosa que dependa de esta fila. Suma las notas aunque hoy
   * sean imposibles sin una asignación: si el conteo cambia de origen
   * algún día, este método no se queda corto en silencio.
   */
  protected totalUsos(fila: OfertaGrado): number {
    return fila.usos.asignaciones + fila.usos.matriculas + fila.usos.notas;
  }

  /** '1 asignación · 12 matrículas · 7 notas', o null si nunca se usó. */
  protected textoUsos(fila: OfertaGrado): string | null {
    const { asignaciones, matriculas, notas } = fila.usos;

    const partes = [
      asignaciones > 0 ? `${asignaciones} ${asignaciones === 1 ? 'asignación' : 'asignaciones'}` : null,
      matriculas > 0 ? `${matriculas} ${matriculas === 1 ? 'matrícula' : 'matrículas'}` : null,
      notas > 0 ? `${notas} ${notas === 1 ? 'nota' : 'notas'}` : null,
    ].filter((parte): parte is string => parte !== null);

    return partes.length > 0 ? partes.join(' · ') : null;
  }

  /**
   * `true` si esta combinación tiene notas de estudiantes adentro.
   *
   * La fila lo señala aparte del conteo porque es lo que cambia la
   * decisión: con notas, desactivar no es "la opción que queda" sino la
   * única correcta -- borrar rompería boletines de alumnos concretos.
   */
  protected tieneNotas(fila: OfertaGrado): boolean {
    return fila.usos.notas > 0;
  }

  protected errorDe(campo: string): string | null {
    return this.erroresDeCampo()[campo]?.[0] ?? null;
  }

  protected elegirSede(valor: string): void {
    this.nuevaSede.set(valor === '' ? null : Number(valor));
  }

  protected elegirGrado(valor: string): void {
    this.nuevoGrado.set(valor === '' ? null : Number(valor));
  }

  /**
   * Normaliza el grupo MIENTRAS SE ESCRIBE: mayúscula y sin tilde.
   *
   * El backend hace exactamente lo mismo en CrearOfertaGradoRequest, y
   * esa es la que vale -- esta no es una validación, es un espejo. Está
   * acá para que nadie escriba 'único' en minúscula, le dé a Agregar y
   * vea aparecer 'UNICO' sin entender por qué: el campo muestra desde el
   * primer carácter exactamente lo que se va a guardar.
   *
   * La Ñ se conserva a propósito (no es una vocal con tilde, es una
   * letra), igual que en el backend. Si las dos reglas se separaran, el
   * campo mentiría.
   */
  protected escribirGrupo(valor: string): void {
    const sinTilde: Record<string, string> = {
      Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U',
      À: 'A', È: 'E', Ì: 'I', Ò: 'O', Ù: 'U',
    };

    this.nuevoGrupo.set(
      valor
        .toUpperCase()
        .replace(/[ÁÉÍÓÚÜÀÈÌÒÙ]/g, (letra) => sinTilde[letra] ?? letra),
    );
  }
}
