import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { sesionExpiradaInterceptor } from './core/interceptores/sesion-expirada.interceptor';
import { tokenInterceptor } from './core/interceptores/token.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),

    provideRouter(
      routes,
      // `data: { modulo: 'Matrículas' }` de una ruta llega como `input()` del
      // componente. Es lo que permite que un solo
      // ModuloEnConstruccionComponent sirva a todos los módulos sin una clase
      // por cada uno.
      withComponentInputBinding(),
      // Al navegar entre módulos se vuelve arriba; al usar el botón atrás se
      // recupera la posición previa. Sin esto, entrar a un módulo desde el
      // final de una tabla larga deja la pantalla a mitad de la nueva vista.
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),

    // El ORDEN importa: `tokenInterceptor` firma la petición y
    // `sesionExpiradaInterceptor` la envuelve para atrapar el 401 de la
    // respuesta. Al revés también funcionaría (son fases distintas del mismo
    // pipe), pero este orden se lee como lo que pasa: primero se manda el
    // token, después se reacciona a lo que el servidor diga de él.
    provideHttpClient(withInterceptors([tokenInterceptor, sesionExpiradaInterceptor])),
  ],
};
