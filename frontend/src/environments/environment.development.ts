export const environment = {
  production: false,
  // Relativa, igual que en producción: `ng serve` la reenvía a
  // http://localhost:3000 vía proxy.conf.json, así el interceptor JWT
  // (que solo adjunta el token si la URL empieza por /api) funciona igual
  // en dev y en producción.
  apiUrl: '/api',
};
