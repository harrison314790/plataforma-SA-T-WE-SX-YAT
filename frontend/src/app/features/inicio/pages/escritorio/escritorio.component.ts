import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/servicios/auth.service';
import { NavegacionService } from '../../../../core/servicios/navegacion.service';
import { IconoComponent } from '../../../../shared/componentes/icono/icono.component';

/**
 * La primera pantalla después de entrar: el mapa completo del sistema, con el
 * estado real de cada módulo para esta persona.
 *
 * POR QUÉ MUESTRA TAMBIÉN LOS MÓDULOS QUE NO PUEDE ABRIR
 * La barra lateral lista solo lo accesible, porque un menú es para navegar. El
 * escritorio hace lo contrario: muestra los siete módulos y dice de cada uno
 * por qué no está disponible. Un módulo que simplemente no aparece se lee como
 * "el sistema no lo tiene" y termina en una llamada a la coordinación; uno
 * atenuado que dice "no habilitado para tu rol" ya respondió la pregunta. Es la
 * misma razón por la que el proyecto distingue el estado "sin permiso" del
 * estado "vacío".
 *
 * El conteo del encabezado ("4 de 7") existe por lo mismo: explica de entrada
 * que falta algo y que es por el rol, no por un error.
 */
@Component({
  selector: 'app-escritorio',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent],
  templateUrl: './escritorio.component.html',
})
export class EscritorioComponent {
  private readonly auth = inject(AuthService);
  private readonly navegacion = inject(NavegacionService);

  protected readonly usuario = this.auth.usuario;
  protected readonly periodo = this.auth.periodoActivo;
  protected readonly modulos = this.navegacion.modulos;
  protected readonly disponibles = this.navegacion.totalDisponibles;
  protected readonly total = this.navegacion.total;

  /**
   * El rótulo de contexto de la cabecera: sede y período. Se arma acá porque
   * las dos partes pueden faltar por separado (un super_admin sin sede
   * adscrita; el hueco entre dos años escolares) y encadenar eso en la
   * plantilla la vuelve ilegible.
   */
  protected readonly contexto = computed<string>(() => {
    const partes = [this.usuario()?.sede?.nombre, this.periodo()?.nombre].filter(
      (parte): parte is string => typeof parte === 'string' && parte !== '',
    );
    return partes.join(' · ');
  });

  /**
   * El texto que explica por qué un módulo no se puede abrir. Nunca "No
   * disponible" a secas: dice cuál de las dos cosas falta, porque son dos
   * situaciones con salidas distintas -- una se resuelve pidiendo permiso, la
   * otra esperando a que se construya.
   */
  protected motivo(estado: string): string {
    return estado === 'en-construccion'
      ? 'En construcción'
      : 'No habilitado para tu rol';
  }
}
