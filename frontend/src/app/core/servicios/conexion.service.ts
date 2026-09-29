import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/**
 * El quinto de los cinco estados obligatorios: sin conexión
 * (references/diseno-ui.md). Vive en un service y no en un componente porque
 * el aviso es global -- da igual en qué módulo esté la persona cuando se cae
 * la señal.
 *
 * `navigator.onLine` es una señal imperfecta y hay que saberlo: dice si hay
 * interfaz de red, no si el servidor responde. En una vereda con el router
 * encendido pero sin enlace hacia afuera puede reportar `true` estando
 * incomunicado. Igual sirve para el caso frecuente (el dispositivo pierde el
 * wifi o los datos), y el caso que no cubre lo agarra el fallo de la petición
 * misma. Lo que NO hay que hacer es reemplazarlo por un ping periódico al
 * servidor: gastaría datos móviles todo el día para detectar algo que la
 * primera petición fallida ya revela.
 */
@Injectable({ providedIn: 'root' })
export class ConexionService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly _enLinea = signal(navigator.onLine);
  readonly enLinea = this._enLinea.asReadonly();

  constructor() {
    const alConectar = () => this._enLinea.set(true);
    const alDesconectar = () => this._enLinea.set(false);

    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);

    // Los listeners de `window` no se limpian solos al destruirse el
    // inyector; con un service `providedIn: 'root'` eso solo pasa en pruebas,
    // pero dejarlo colgando es la forma más común de fuga de memoria en una
    // suite de tests.
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
    });
  }
}
