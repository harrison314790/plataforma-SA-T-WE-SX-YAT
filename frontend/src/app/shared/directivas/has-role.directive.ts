import { Directive, Input, TemplateRef, ViewContainerRef, effect, inject } from '@angular/core';
import { AuthService } from '../../core/servicios/auth.service';

/**
 * Capa 1 de seguridad (UX): oculta/muestra un elemento según el mapa de
 * permisos cacheado en AuthService. NO es seguridad -- el mismo `codigo`
 * debe estar verificado en Node y respaldado por RLS. Ver references/permisos.md.
 *
 * Uso: <button *appHasRole="'btn_registrar_nota'">Registrar nota</button>
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
  private codigo = '';

  @Input({ required: true }) set appHasRole(codigo: string) {
    this.codigo = codigo;
  }

  constructor() {
    effect(() => {
      const habilitado = this.auth.tienePermiso(this.codigo);
      if (habilitado && !this.insertado) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.insertado = true;
      } else if (!habilitado && this.insertado) {
        this.viewContainer.clear();
        this.insertado = false;
      }
    });
  }
}
