import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../../core/servicios/auth.service';

/**
 * Capa 1 de seguridad (UX): oculta/muestra un elemento según el mapa de
 * permisos cacheado en AuthService. NO es seguridad -- el mismo `codigo`
 * debe estar verificado en Laravel y respaldado por RLS. Ver
 * references/permisos.md.
 *
 * Uso: <button *appHasRole="'btn_registrar_nota'">Registrar nota</button>
 *
 * EL BUG QUE TENÍA, Y POR QUÉ TARDÓ EN APARECER
 * El código venía en una propiedad normal (`private codigo = ''`, escrita
 * desde un `@Input()` con setter) y el `effect` la leía adentro. Un
 * `effect` solo se vuelve a ejecutar cuando cambia una SEÑAL que leyó, y
 * una propiedad de clase no lo es: en la primera pasada el input todavía
 * no estaba asignado, así que preguntaba por el permiso de la cadena
 * vacía, obtenía `false` y no insertaba nada. Cuando Angular asignaba el
 * código de verdad, el efecto no se enteraba.
 *
 * Funcionó igual durante meses por casualidad: el shell dispara
 * `auth.revalidarSesion()` al arrancar, eso reemplaza la señal `_sesion`,
 * y ESE cambio sí re-ejecutaba el efecto -- para entonces el input ya
 * estaba puesto y el botón aparecía. Una carrera que se ganaba casi
 * siempre. Dejó de ganarse al agregar una tercera acción por fila en la
 * tabla de asignaciones: las filas se pintaban después de que la
 * revalidación ya había pasado, y la columna de acciones salía
 * completamente vacía con todos los permisos en `true`.
 *
 * `input()` devuelve una señal, así que ahora el efecto depende de las
 * dos cosas que de verdad lo determinan: el código y el mapa de permisos.
 */
@Directive({
  selector: '[appHasRole]',
  standalone: true,
})
export class HasRoleDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);
  private insertado = false;

  /** El `codigo` del recurso, como está en la tabla `recursos`. */
  readonly appHasRole = input.required<string>();

  constructor() {
    effect(
      () => {
        const habilitado = this.auth.tienePermiso(this.appHasRole());

        if (habilitado && !this.insertado) {
          this.viewContainer.createEmbeddedView(this.templateRef);
          this.insertado = true;
        } else if (!habilitado && this.insertado) {
          this.viewContainer.clear();
          this.insertado = false;
        }
      },
      // `allowSignalWrites` hace falta de verdad, y el síntoma sin él es
      // desconcertante: el botón simplemente no aparece, con el permiso
      // en `true` y sin nada raro en el HTML más que el ancla de la
      // directiva.
      //
      // El motivo: `createEmbeddedView()` modifica el árbol de vistas, y
      // eso marca como "sucias" las consultas `viewChild()`/`contentChild()`
      // de los componentes de arriba -- que desde Angular 17 son SEÑALES.
      // Escribir una señal dentro de un efecto lanza NG0600 y aborta el
      // efecto a mitad de camino, justo antes de insertar la vista.
      //
      // Por eso funcionó durante meses: nadie había puesto un
      // `viewChild()` en un componente que contuviera un `*appHasRole`.
      // El día que la tabla de asignaciones agregó uno (para preparar el
      // formulario tras "Guardar y crear otra"), la columna de acciones
      // se vació entera sin un solo error visible en pantalla.
      //
      // La escritura es legítima: este efecto EXISTE para cambiar el
      // árbol de vistas. No es el caso que NG0600 quiere prevenir (un
      // efecto que dispara otro en cascada).
      { allowSignalWrites: true },
    );
  }
}
