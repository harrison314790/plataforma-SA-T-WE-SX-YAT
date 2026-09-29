export const environment = {
  production: true,
  // En producción, Angular y Laravel se sirven desde el mismo origen en el VPS,
  // así que la ruta relativa apunta al backend sin necesidad de CORS.
  apiUrl: '/api/v1',
};
