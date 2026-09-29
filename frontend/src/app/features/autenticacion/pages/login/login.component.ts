import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../../core/servicios/auth.service';

/** Forma del error de esta API: `{ error: { codigo, mensaje, detalles? } }`. */
interface CuerpoDeError {
  error?: {
    codigo?: string;
    mensaje?: string;
    detalles?: Record<string, string[]>;
  };
}

/**
 * Punto de entrada. Las credenciales las valida Laravel con `Hash::check()`
 * contra `usuarios.password_hash` -- nunca nada de hashing acá.
 *
 * `regresarA` devuelve a la persona a donde iba antes de que la mandaran al
 * login (lo pone `autenticadoGuard` o `sesionExpiradaInterceptor`). Se valida
 * que sea una ruta interna antes de usarla: sin ese control, un enlace como
 * `/login?regresarA=https://otro-sitio` convertiría la pantalla de ingreso en un
 * redirector abierto hacia una copia falsa del sistema.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly mostrarPassword = signal(false);

  readonly formulario = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  alternarPassword(): void {
    this.mostrarPassword.update((valor) => !valor);
  }

  async enviar(): Promise<void> {
    if (this.formulario.invalid || this.cargando()) return;

    this.cargando.set(true);
    this.error.set(null);

    try {
      const { email, password } = this.formulario.getRawValue();
      await this.auth.iniciarSesion(email, password);
      await this.router.navigateByUrl(this.destino());
    } catch (err) {
      this.error.set(this.mensajeDe(err));
    } finally {
      this.cargando.set(false);
    }
  }

  /**
   * El backend manda un mensaje ya pensado para mostrarse tal cual
   * (`ErrorDeNegocio` -> "Correo o contraseña incorrectos").
   *
   * Ojo con la ruta de lectura: es `err.error.error.mensaje`. El primer `error`
   * es el cuerpo de la respuesta que envuelve Angular, el segundo es la clave
   * del formato de esta API, y `mensaje` es el texto. La versión anterior de
   * este componente leía `err.error.error` esperando un string plano -- eso era
   * el formato del backend Node, y contra Laravel habría pintado
   * "[object Object]" en la pantalla de ingreso.
   */
  private mensajeDe(err: unknown): string {
    if (!(err instanceof HttpErrorResponse)) {
      return 'No se pudo iniciar sesión. Intenta de nuevo.';
    }

    // status 0 = la petición no llegó a salir: sin señal, o el backend caído.
    // Distinguirlo importa: "revisa tu conexión" es accionable, "error interno"
    // manda a la persona a buscar ayuda que no necesita.
    if (err.status === 0) {
      return 'Sin conexión con el servidor. Revisa tu señal e intenta de nuevo.';
    }

    const cuerpo = err.error as CuerpoDeError | null;
    const detalles = cuerpo?.error?.detalles;

    // En un 422 de validación, el detalle del campo es más útil que el mensaje
    // general ("Los datos enviados no son válidos").
    if (detalles) {
      const primero = Object.values(detalles)[0]?.[0];
      if (primero) return primero;
    }

    return cuerpo?.error?.mensaje ?? 'No se pudo iniciar sesión. Intenta de nuevo.';
  }

  /**
   * Solo se acepta una ruta relativa de este mismo sitio. Se descarta cualquier
   * cosa que empiece por `//` o que traiga esquema: `//evil.com` es una URL
   * absoluta protocol-relative, y `router.navigateByUrl` la seguiría.
   */
  private destino(): string {
    const solicitado = this.ruta.snapshot.queryParamMap.get('regresarA');

    if (solicitado === null || !solicitado.startsWith('/') || solicitado.startsWith('//')) {
      return '/inicio';
    }

    return solicitado;
  }
}
