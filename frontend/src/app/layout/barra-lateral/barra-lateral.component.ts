import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/servicios/auth.service';
import { NavegacionService } from '../../core/servicios/navegacion.service';
import { IconoComponent } from '../../shared/componentes/icono/icono.component';

/**
 * La navegación del sistema. Los módulos NO están escritos acá: vienen de las
 * tablas `modulos`/`recursos`/`permisos` vía la respuesta del login, así que
 * `super_admin` puede cambiar qué módulos trae una instalación sin desplegar
 * (ver 05-navegacion.sql).
 *
 * DECISIONES DE DISEÑO, PARA QUE NO SE "CORRIJAN" DESPUÉS SIN SABER POR QUÉ
 *
 * · Es el único lugar del sistema, junto con la barra superior, donde se usa
 *   el morado de marca. En las tablas de notas está prohibido: ahí el color
 *   significa estado de calificación (verde/amarillo/rojo) y un morado
 *   institucional compitiendo con eso rompería la señal.
 *
 * · El ítem activo no es una píldora redondeada con fondo suave -- eso es el
 *   gesto por defecto de cualquier plantilla. Acá es una barra vertical de
 *   hilo sobre fondo plano, con esquinas rectas, y los rótulos de grupo van
 *   precedidos de un tramo de cuatro hilos de distinto grosor: una cita al
 *   chumbe (la faja tejida nasa), que es literalmente franjas de anchos
 *   distintos. El motivo se repite en las fichas del escritorio, así que
 *   funciona como marca del sistema y no como adorno de una pantalla.
 *
 * · Un módulo con permiso pero sin pantalla construida se muestra igual, como
 *   texto no accionable con el rótulo "pronto". Esconderlo haría que un
 *   profesor no sepa que le corresponde; dejarlo clicable lo mandaría a una
 *   pantalla en blanco. Mostrarlo y decir la verdad es la única opción que no
 *   engaña.
 *
 * · El pie lleva la sede con su estrella: llena = sede principal, contorno =
 *   escuela satélite. Es una regla con función del sistema de diseño -- una
 *   profesora que trabaja en dos sedes sabe en cuál está sin leer el nombre.
 */
@Component({
  selector: 'app-barra-lateral',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconoComponent],
  templateUrl: './barra-lateral.component.html',
})
export class BarraLateralComponent {
  private readonly auth = inject(AuthService);
  protected readonly navegacion = inject(NavegacionService);

  protected readonly usuario = this.auth.usuario;
  protected readonly grupos = this.navegacion.grupos;
  protected readonly colapsada = this.navegacion.colapsada;

  protected alternar(): void {
    this.navegacion.alternarColapsada();
  }

  /** En móvil la barra tapa el contenido, así que navegar tiene que cerrarla. */
  protected alNavegar(): void {
    this.navegacion.cerrarEnMovil();
  }
}
