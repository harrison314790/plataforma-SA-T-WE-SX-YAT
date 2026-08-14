import { Component } from '@angular/core';

/**
 * TODO: tabla editable de notas -- modelo Airtable/Google Sheets, ver
 * references/diseno-ui.md (densidad, celda activa, teclado) y
 * references/angular.md (implementación de referencia con signals).
 * Debe cubrir los 5 estados: cargando, vacío, error, sin permiso, sin conexión.
 */
@Component({
  selector: 'app-tabla-notas',
  standalone: true,
  templateUrl: './tabla-notas.component.html',
})
export class TablaNotasComponent {}
