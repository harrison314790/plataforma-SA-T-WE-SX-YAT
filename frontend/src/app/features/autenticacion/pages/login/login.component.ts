import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/servicios/auth.service';

/**
 * Punto de entrada de la app. Autenticación real la maneja Supabase Auth
 * (nunca hash manual acá) -- este componente solo llama a
 * AuthService.iniciarSesion, que le pega a POST /api/autenticacion/login.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

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
    if (this.formulario.invalid) return;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.formulario.getRawValue();
      await this.auth.iniciarSesion(email, password);
      await this.router.navigateByUrl('/notas');
    } catch (err) {
      // El backend manda un mensaje ya pensado para mostrarse tal cual
      // (ErrorDeNegocio, ver manejarError.ts) -- solo cae al genérico si
      // no hay body de error (por ejemplo, el backend no respondió).
      const mensaje = err instanceof HttpErrorResponse ? (err.error as { error?: string } | null)?.error : undefined;
      this.error.set(mensaje ?? 'No se pudo iniciar sesión. Intenta de nuevo.');
    } finally {
      this.cargando.set(false);
    }
  }
}
