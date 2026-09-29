import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../core/servicios/auth.service';
import { NavegacionService } from '../../core/servicios/navegacion.service';
import { IconoComponent } from '../../shared/componentes/icono/icono.component';
import { MenuUsuarioComponent } from '../menu-usuario/menu-usuario.component';

type TonoPlazo = 'normal' | 'por-vencer' | 'vencido';

/**
 * Quién está conectado, y en qué punto del calendario está la institución.
 *
 * LA REGLA DE PERÍODO ES EL ELEMENTO CENTRAL, NO UN ADORNO
 * Cuatro segmentos (los cuatro períodos del año), el activo marcado, y los
 * días que faltan para el cierre de notas. Está ahí porque el plazo es lo que
 * gobierna el trabajo real de este sistema: una vez vencido, la política RLS
 * `notas_profesor_inserta_dentro_de_plazo` deja de aceptar notas y la única
 * salida es reportarse en persona con la coordinación. Que un profesor
 * descubra eso al intentar guardar, y no al entrar, es el fallo que esta tira
 * evita.
 *
 * `diasRestantes` viene del SERVIDOR. No se recalcula acá con `Date.now()` a
 * propósito: varios equipos de la escuela tienen la fecha mal puesta, y es el
 * reloj del servidor el que evalúa la política.
 *
 * El tono nunca va solo por color: cada estado lleva ícono y texto, porque
 * parte de los profesores puede tener alguna forma de daltonismo (regla dura
 * de references/diseno-ui.md).
 */
@Component({
  selector: 'app-barra-superior',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, MenuUsuarioComponent],
  templateUrl: './barra-superior.component.html',
})
export class BarraSuperiorComponent {
  private readonly auth = inject(AuthService);
  private readonly navegacion = inject(NavegacionService);

  protected readonly usuario = this.auth.usuario;
  protected readonly periodo = this.auth.periodoActivo;

  /** Los cuatro períodos del año escolar, para pintar la regla completa. */
  protected readonly segmentos = [1, 2, 3, 4] as const;

  protected readonly tonoPlazo = computed<TonoPlazo>(() => {
    const periodo = this.periodo();
    if (periodo === null) return 'normal';
    if (!periodo.dentroDePlazo || periodo.diasRestantes < 0) return 'vencido';
    // Tres días es el umbral porque en las veredas la conectividad se cae por
    // días enteros: avisar con 24 horas no le sirve a quien necesita bajar al
    // pueblo para tener señal.
    return periodo.diasRestantes <= 3 ? 'por-vencer' : 'normal';
  });

  /**
   * El texto del plazo, no solo el número. Se arma acá y no en la plantilla
   * porque son cuatro casos con concordancia de singular/plural, y encadenar
   * eso en el HTML lo vuelve ilegible.
   */
  protected readonly textoPlazo = computed<string>(() => {
    const periodo = this.periodo();
    if (periodo === null) return '';

    const dias = periodo.diasRestantes;

    if (!periodo.notasHabilitadas) return 'Registro de notas cerrado';
    if (dias < 0) return `Cerró hace ${this.enDias(-dias)}`;
    if (dias === 0) return 'Cierra hoy';
    return `Cierra en ${this.enDias(dias)}`;
  });

  protected abrirMenuMovil(): void {
    this.navegacion.abrirEnMovil();
  }

  private enDias(cantidad: number): string {
    return cantidad === 1 ? '1 día' : `${cantidad} días`;
  }
}
