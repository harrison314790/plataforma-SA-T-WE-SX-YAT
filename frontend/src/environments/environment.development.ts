export const environment = {
  production: false,
  // Relativa, igual que en producción: `ng serve` la reenvía al Laravel de
  // desarrollo (http://127.0.0.1:8000) vía proxy.conf.json. Así el
  // tokenInterceptor, que solo firma las peticiones cuya URL empieza por este
  // valor, se comporta igual en dev y en producción -- y el token nunca viaja
  // a un host de terceros.
  //
  // Incluye /v1: la API de Laravel está versionada desde el arranque
  // (routes/api.php agrega el prefijo), así que los endpoints reales son
  // /api/v1/autenticacion/login, /api/v1/notas, etc.
  apiUrl: '/api/v1',
};
