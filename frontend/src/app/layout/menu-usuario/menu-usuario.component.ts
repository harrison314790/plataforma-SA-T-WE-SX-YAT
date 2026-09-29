import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/servicios/auth.service';
import type { UsuarioSesion } from '../../core/interfaces/usuario.interface';
import { IconoComponent } from '../../shared/componentes/icono/icono.component';

/**
 * Identidad de quien inició sesión y la salida.
 *
 * El avatar son iniciales, no una foto: no hay módulo de fotos, y un
 * marcador de imagen genérico no dice nada que las iniciales no digan mejor.
 * Las calcula el backend (`UsuarioResource`) para que sean idénticas en
 * cualquier vista que las muestre.
 *
 * El menú se cierra al hacer clic afuera y con Escape. Se implementa con
 * `HostListener` sobre `document` y no con un overlay que tape la pantalla:
 * un overlay bloquearía el scroll de la tabla de notas que hay detrás, y en un
 * ERP denso eso se siente como si la aplicación se hubiera trabado.
 */
@Component({
  selector: 'app-menu-usuario',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  templateUrl: './menu-usuario.component.html',
})
export class MenuUsuarioComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly anfitrion = inject(ElementRef<HTMLElement>);

  readonly usuario = input.required<UsuarioSesion>();

  protected readonly abierto = signal(false);
  protected readonly cerrando = signal(false);

  protected alternar(): void {
    this.abierto.update((valor) => !valor);
  }

  @HostListener('document:click', ['$event'])
  protected alClicFuera(evento: MouseEvent): void {
    if (!this.abierto()) return;
    if (!this.anfitrion.nativeElement.contains(evento.target as Node)) {
      this.abierto.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.abierto.set(false);
  }

  /**
   * El botón queda deshabilitado mientras se cierra la sesión. No es
   * cosmético: con la conectividad de una vereda, la petición puede tardar
   * varios segundos y un segundo clic dispararía un segundo `navigate` a
   * `/login` con la sesión ya limpia.
   */
  protected async cerrarSesion(): Promise<void> {
    if (this.cerrando()) return;

    this.cerrando.set(true);
    try {
      await this.auth.cerrarSesion();
      await this.router.navigateByUrl('/login');
    } finally {
      this.cerrando.set(false);
      this.abierto.set(false);
    }
  }
}
