import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICONOS, type NombreDeIcono, esNombreDeIcono } from '../../../core/navegacion/iconos';

/**
 * Pinta un ícono del set del sistema a partir de su nombre (ver
 * `core/navegacion/iconos.ts`).
 *
 * Un solo `<svg>` con un `<path>` en vez de un archivo por ícono: son 15
 * trazos cortos, y servirlos como sprite o como archivos sueltos costaría más
 * peticiones que bytes ahorra. Nada de una librería de íconos -- traería cien
 * que no se usan.
 *
 * `aria-hidden` por defecto, y es lo correcto casi siempre: el ícono acompaña
 * a un texto que ya dice lo mismo, y anunciarlo dos veces es ruido para quien
 * usa lector de pantalla. Cuando el ícono va SOLO (un botón sin rótulo
 * visible), se pasa `etiqueta` y pasa a ser `img` con su `title`.
 */
@Component({
  selector: 'app-icono',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="icono"
      [class.icono--relleno]="relleno()"
      viewBox="0 0 24 24"
      fill="none"
      [attr.width]="tamano()"
      [attr.height]="tamano()"
      [attr.role]="etiqueta() ? 'img' : null"
      [attr.aria-hidden]="etiqueta() ? null : 'true'"
      [attr.aria-label]="etiqueta()"
    >
      @if (trazo()) {
        <path
          [attr.d]="trazo()"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      }
    </svg>
  `,
})
export class IconoComponent {
  readonly nombre = input.required<string>();
  readonly tamano = input(20);
  /** Solo para `estrella`: llena = sede principal, contorno = escuela satélite. */
  readonly relleno = input(false);
  readonly etiqueta = input<string | undefined>(undefined);

  /**
   * `null` si el nombre no existe en el set: el elemento que lo acompaña se
   * pinta igual, solo sin ícono. Un `modulos.icono` mal tipeado en la base no
   * debería dejar a nadie sin poder navegar.
   */
  protected readonly trazo = computed<string | null>(() => {
    const nombre = this.nombre();
    return esNombreDeIcono(nombre) ? ICONOS[nombre as NombreDeIcono] : null;
  });
}
