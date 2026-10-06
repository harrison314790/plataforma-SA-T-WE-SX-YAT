import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import type {
  CuentaParaActualizar,
  CuentaParaCrear,
  CuentaUsuario,
  OpcionesUsuarios,
  TipoCuenta,
} from '../../../../core/interfaces/cuenta-usuario.interface';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';
import { ModalDirective } from '../../../../shared/directivas/modal.directive';
import { generarContrasena } from '../../contrasena';

/** Lo que el formulario emite al guardar: alta o edición, nunca las dos. */
export type GuardadoCuenta =
  | { modo: 'alta'; datos: CuentaParaCrear }
  | { modo: 'edicion'; datos: CuentaParaActualizar };

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_DOCUMENTO = /^\d{6,11}$/;

/**
 * Alta y edición de una cuenta, en un solo modal. Sin estado que persista:
 * recibe la cuenta (o `null` para alta) y emite lo que hay que guardar.
 * Quién guarda, recarga y muestra la contraseña es GestionUsuariosComponent.
 *
 * LAS DIFERENCIAS ENTRE LOS CUATRO CASOS
 * · Profesor pide sede; estudiante no (la suya es la de su matrícula).
 * · Estudiante nuevo recibe un email SUGERIDO a partir del documento,
 *   editable. En cuanto la persona toca el email, se deja de sugerir:
 *   pisar lo que alguien escribió a mano sería peor que no sugerir nada.
 * · Alta pide contraseña inicial, ya generada al abrir (con "Generar"
 *   para otra). Edición no la muestra: no hay forma de verla después.
 * · Edición agrega el toggle "Cuenta activa".
 *
 * La validación de acá es una CORTESÍA (marca el campo antes de viajar);
 * la que manda es la del backend, cuyos errores llegan en `errores` y se
 * pintan en el mismo lugar.
 */
@Component({
  selector: 'app-formulario-usuario',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, ModalDirective],
  templateUrl: './formulario-usuario.component.html',
})
export class FormularioUsuarioComponent {
  readonly opciones = input.required<OpcionesUsuarios>();
  /** El tipo de la pestaña activa. Solo cuenta en el alta. */
  readonly tipoNuevo = input<TipoCuenta>('profesor');
  /** `null` = alta. */
  readonly cuenta = input<CuentaUsuario | null>(null);
  readonly guardando = input(false);
  readonly errores = input<Record<string, string[]>>({});
  readonly errorGeneral = input<string | null>(null);
  /**
   * Sin conexión no se guarda, y se dice por qué dentro del formulario.
   * No hay cola local: una cuenta creada "después" con una contraseña que
   * ya se entregó en persona sería un problema peor que esperar la señal.
   */
  readonly sinConexion = input(false);

  readonly guardar = output<GuardadoCuenta>();
  readonly cerrar = output<void>();

  protected readonly nombres = signal('');
  protected readonly apellidos = signal('');
  protected readonly documento = signal('');
  protected readonly email = signal('');
  protected readonly emailTocado = signal(false);
  protected readonly sedeId = signal<number | null>(null);
  protected readonly contrasena = signal(generarContrasena());
  protected readonly activo = signal(true);

  /** Errores de la validación local, que se calculan solo al intentar guardar. */
  private readonly erroresLocales = signal<Record<string, string>>({});

  /**
   * Campos tocados DESPUÉS del último error del servidor. El error del
   * backend llega por input y este componente no puede borrarlo, pero sí
   * dejar de mostrarlo en cuanto la persona corrige ese campo: un "ya
   * existe" pegado a un documento que ya se cambió confunde.
   */
  private readonly corregidos = signal<ReadonlySet<string>>(new Set());

  protected readonly esEdicion = computed(() => this.cuenta() !== null);
  protected readonly tipo = computed<TipoCuenta>(() => this.cuenta()?.tipo ?? this.tipoNuevo());
  protected readonly esProfesor = computed(() => this.tipo() === 'profesor');

  protected readonly titulo = computed(
    () => `${this.esEdicion() ? 'Editar' : 'Nuevo'} ${this.esProfesor() ? 'profesor' : 'estudiante'}`,
  );

  protected readonly subtitulo = computed(() => {
    const cuenta = this.cuenta();
    if (cuenta !== null) return cuenta.nombreCompleto;

    return this.esProfesor()
      ? 'Solo la cuenta. Las materias se asignan después en Asignaciones.'
      : 'Solo la cuenta. El grado y grupo se asignan después en Matrículas.';
  });

  /** El email se está mostrando como sugerencia (no lo escribió nadie). */
  protected readonly emailSugerido = computed(
    () => !this.esEdicion() && !this.esProfesor() && !this.emailTocado() && this.email() !== '',
  );

  protected readonly ayudaEmail = computed(() => {
    if (this.emailSugerido()) return 'Sugerido a partir del documento, puedes cambiarlo.';
    if (!this.esEdicion() && !this.esProfesor() && this.email() === '') {
      return `Al escribir el documento se sugiere uno con @${this.opciones().dominioEstudiantes}.`;
    }
    return 'Con este email iniciará sesión.';
  });

  constructor() {
    // Llena el formulario al abrir en modo edición. `effect` y no
    // `ngOnInit` porque `cuenta` es un input signal: así también funciona
    // si el padre reemplaza la cuenta con el modal abierto (pasa cuando se
    // refresca la fila después de un 409).
    effect(
      () => {
        const cuenta = this.cuenta();
        if (cuenta === null) return;

        this.nombres.set(cuenta.nombres);
        this.apellidos.set(cuenta.apellidos);
        this.documento.set(cuenta.documento);
        this.email.set(cuenta.email);
        this.emailTocado.set(true);
        this.sedeId.set(cuenta.sede?.id ?? null);
        this.activo.set(cuenta.activo);
      },
      { allowSignalWrites: true },
    );

    // Cada respuesta nueva del servidor vuelve a mostrar todos sus errores.
    effect(
      () => {
        this.errores();
        this.corregidos.set(new Set());
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Campos
  // ─────────────────────────────────────────────────────────────

  protected cambiarTexto(campo: 'nombres' | 'apellidos', valor: string): void {
    this[campo].set(valor);
    this.limpiarError(campo);
  }

  /**
   * Solo dígitos, máximo 11. Se filtra al escribir y no solo al validar:
   * una cédula se copia con puntos ("10.612.233") y es más claro verlos
   * desaparecer que recibir un error por ellos.
   */
  protected cambiarDocumento(valor: string, campo: HTMLInputElement): void {
    const limpio = valor.replace(/\D/g, '').slice(0, 11);
    this.documento.set(limpio);
    // El input conserva lo tecleado aunque la signal no cambie (pasa al
    // escribir una letra): se le reescribe el valor para que la letra no
    // quede a la vista.
    campo.value = limpio;
    this.limpiarError('documento');

    if (!this.esEdicion() && !this.esProfesor() && !this.emailTocado()) {
      this.email.set(limpio ? `${limpio}@${this.opciones().dominioEstudiantes}` : '');
      this.limpiarError('email');
    }
  }

  protected cambiarEmail(valor: string): void {
    this.email.set(valor);
    this.emailTocado.set(true);
    this.limpiarError('email');
  }

  protected cambiarSede(valor: string): void {
    this.sedeId.set(valor === '' ? null : Number(valor));
    this.limpiarError('sede_id');
  }

  protected cambiarContrasena(valor: string): void {
    this.contrasena.set(valor);
    this.limpiarError('password');
  }

  protected generar(): void {
    this.contrasena.set(generarContrasena());
    this.limpiarError('password');
  }

  protected alternarActivo(): void {
    this.activo.update((valor) => !valor);
  }

  // ─────────────────────────────────────────────────────────────
  // Guardar
  // ─────────────────────────────────────────────────────────────

  protected enviar(evento: Event): void {
    evento.preventDefault();
    if (this.guardando() || this.sinConexion()) return;

    const nombres = this.nombres().trim().replace(/\s+/g, ' ');
    const apellidos = this.apellidos().trim().replace(/\s+/g, ' ');
    const documento = this.documento().trim();
    const email = this.email().trim().toLowerCase();
    const contrasena = this.contrasena().trim();
    const sedeId = this.sedeId();

    const errores: Record<string, string> = {};
    if (!nombres) errores['nombres'] = 'Escribe los nombres.';
    if (!apellidos) errores['apellidos'] = 'Escribe los apellidos.';
    if (!REGEX_DOCUMENTO.test(documento)) errores['documento'] = 'Solo números, de 6 a 11 dígitos.';
    if (!REGEX_EMAIL.test(email)) {
      errores['email'] = 'Escribe un email válido, por ejemplo nombre@dominio.edu.co.';
    }
    if (this.esProfesor() && sedeId === null) errores['sede_id'] = 'Elige la sede.';
    if (!this.esEdicion() && contrasena.length < 8) {
      errores['password'] = 'Mínimo 8 caracteres. Usa “Generar” si prefieres.';
    }

    this.erroresLocales.set(errores);
    if (Object.keys(errores).length > 0) return;

    const sede = this.esProfesor() && sedeId !== null ? { sede_id: sedeId } : {};

    if (this.esEdicion()) {
      this.guardar.emit({
        modo: 'edicion',
        datos: { nombres, apellidos, documento, email, activo: this.activo(), ...sede },
      });
    } else {
      this.guardar.emit({
        modo: 'alta',
        datos: { tipo: this.tipo(), nombres, apellidos, documento, email, password: contrasena, ...sede },
      });
    }
  }

  /** El error de un campo: primero el local, si no el del servidor. */
  protected errorDe(campo: string): string | null {
    const local = this.erroresLocales()[campo];
    if (local !== undefined) return local;
    if (this.corregidos().has(campo)) return null;

    return this.errores()[campo]?.[0] ?? null;
  }

  private limpiarError(campo: string): void {
    if (!this.corregidos().has(campo)) {
      this.corregidos.update((campos) => new Set(campos).add(campo));
    }
    if (this.erroresLocales()[campo] === undefined) return;

    this.erroresLocales.update((errores) => {
      const copia = { ...errores };
      delete copia[campo];
      return copia;
    });
  }
}
