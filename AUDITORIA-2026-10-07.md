# Auditoría del sistema académico — 2026-10-07

**Alcance:** login/sesión, Notas (registro y seguimiento), Asignaciones + Oferta de grados, Nudos y materias, Porcentajes, Boletines, Usuarios y Matrículas.

**Método:** Postgres real en Docker (`mi-postgres`), Laravel y Angular levantados. Hice peticiones reales con un token Sanctum de cada rol (super_admin, admin, dos profesores, dos estudiantes) y sin token. Después de cada escritura verifiqué la base con SQL directo: como `postgres` para ver el dato real, y como `app_user` con `app.usuario_id` seteado para probar RLS sin falsos positivos. Además revisé el código Angular de cada formulario. Los scripts de prueba están en el scratchpad de la sesión; no forman parte del repo.

**Datos de prueba:** saqué un respaldo completo (`pg_dump`) antes de empezar y lo restauré al terminar. La base local quedó exactamente como estaba: verifiqué conteos, políticas (60), RLS activado en 22 tablas, funciones y login.

**No corregí nada.** Espero tu visto bueno.

---

## Resumen

| Severidad | Cantidad |
|---|---|
| CRÍTICO | 3 |
| ALTO | 2 |
| MEDIO | 8 |
| BAJO | 10 |

Lo más grave, en una línea cada uno:

1. **Una asignación con notas se puede editar** (curso, materia o año) y sus notas quedan colgando del curso, la materia o el año equivocado.
2. **Dos profesores pueden tener la misma materia en el mismo curso y año**. La materia entra dos veces en el nudo, y el boletín muestra en la fila una nota que no es la que usó para calcular el nudo.
3. **La política RLS del admin sobre `notas` permite DELETE.** La regla "nadie borra una nota" no está garantizada en la base.

---

## CRÍTICO

### C1. Editar una asignación con notas mueve esas notas a otro curso, materia o año

- **Módulo:** Asignaciones.
- **Esperaba:** que una asignación con notas no pudiera cambiar de curso, materia ni año. Las notas se registraron para *ese* curso y *esa* materia.
- **Pasó:** `PUT /asignaciones/{id}` acepta cualquier cambio aunque la asignación tenga notas. Las notas siguen apuntando a la misma fila, que ahora dice otra cosa.
- **Cómo reproducir** (admin, asignación "Español 9-B 2026" de Carlos, con 3 notas):
  ```
  PUT /api/v1/asignaciones/037b8328-…   {"profesor_id":"d47d…","asignatura_id":2,"anio":2026,"grado":8,"grupo":"A"}   → 200
  PUT …   {"…","asignatura_id":1, "grado":9,"grupo":"B"}   → 200   (Español → Matemáticas)
  PUT …   {"…","anio":2025}                                → 200   (2026 → 2025)
  ```
- **Evidencia (SQL tras cada cambio):**
  - Tras pasarla a 8-A: `Notas ahora colgadas de 8-A, de estudiantes matriculados en: Daniela(9-B), Luis(9-B), Valeria(9-B)`. Hay notas de estudiantes de 9-B en un curso 8-A.
  - Tras cambiar la materia: las 3 notas de Español pasan a contar como Matemáticas en el boletín.
  - Tras cambiar el año: `Notas 2026 colgando de asignación 2025: 2026-3`.

  Lo revertí en la misma prueba y además restauré la base.
- **Causa:** las tres capas permiten la edición.
  - `backend/app/Services/AsignacionService.php:262-271`: `actualizar()` hace `update` de todos los campos sin mirar si hay notas.
  - `frontend/src/app/features/asignaciones/pages/formulario-asignacion/formulario-asignacion.component.ts`: el formulario de edición no usa `cantidadNotas`, que sí llega en el listado (`AsignacionResource.php:77`).
  - En la base no hay ningún trigger ni restricción que lo impida.
- **Corrección propuesta:**
  - En `AsignacionService::actualizar`, si `notas()->exists()`, permitir solo cambiar `profesor_id` (reemplazo de docente) y lanzar `ErrorDeNegocio` ("Esta asignación ya tiene notas: no se puede cambiar de curso, materia ni año. Desactívala y crea una nueva.") si cambia asignatura, sede, grado, grupo o año.
  - En Angular, bloquear esos campos en el formulario cuando `cantidadNotas > 0`, con el mismo mensaje.
  - Como respaldo en la base, un trigger `before update on asignaciones` que rechace esos cambios si existen notas.

### C2. La misma materia en el mismo curso y año con dos profesores: la nota cuenta doble y el boletín no cuadra

- **Módulo:** Asignaciones → Notas → Boletines.
- **Esperaba:** una sola asignación por materia, curso y año, o al menos que el boletín no se corrompa.
- **Pasó:**
  - La unicidad incluye `profesor_id`, así que se acepta "Matemáticas 9-B 2026" para Carlos aunque ya la tiene Marta.
  - Cada profesor sube su nota y Luis queda con **dos** notas de Matemáticas en la misma época.
  - La vista del nudo promedia las dos, pero la fila de la materia en el boletín muestra solo la primera.
- **Cómo reproducir:**
  ```
  POST /api/v1/asignaciones (admin)  {"profesor_id":<Carlos>,"asignatura_id":1,"anio":2026,"grado":9,"grupo":"B"}  → 201
  POST /api/v1/notas/lote   (Carlos) {"asignacion_id":<nueva>,"periodo_id":3,"notas":[{"estudiante_id":<Luis>,"valor":1.0}]} → 201
  GET  /api/v1/boletines/estudiantes/<Luis>?anio=2026 (admin)
  ```
- **Evidencia:**
  ```
  ANTES   nudo 4 época 3: 4.0   materia Matemáticas: [4.2, 3.8, 4.0, null]
  DESPUÉS nudo 4 época 3: 2.5   materia Matemáticas: [4.2, 3.8, 4.0, null]   ← la fila sigue diciendo 4.0
  SQL notas de Luis en Matemáticas 2026-3: 4, 1
  ```
  El nudo pasa de Alto a **Bajo (2,5)**, y en el papel se ve una materia con 4,0 que no explica ese resultado.
- **Causa:**
  - `backend/09-asignaciones-por-anio.sql:126`: `asignaciones_unicidad_anual` es `(profesor_id, asignatura_id, sede_id, grado, grupo, anio)`. Incluir `profesor_id` permite el duplicado.
  - `backend/app/Http/Requests/AsignacionRequest.php` (`reglaDeUnicidad`): mismo criterio.
  - `backend/app/Services/BoletinService.php:189`: `$notaDe` toma la primera nota de la materia.
  - `vista_boletin_nudo_periodo` (16) promedia todas.
- **Corrección propuesta:** decisión de producto.
  - **Recomiendo** unicidad por `(asignatura_id, sede_id, grado, grupo, anio)`, sin profesor: una materia de un curso la dicta un solo docente por año, y cambiarlo es *editar* la asignación.
  - Si el colegio de verdad tiene dos docentes para la misma materia de un curso, entonces hay que definir cómo se combinan sus notas antes de permitirlo.
  - Antes de agregar la restricción nueva hay que revisar la base: hoy no hay duplicados (el que creé fue restaurado).

### C3. RLS permite que un admin borre notas

- **Módulo:** Notas (capa 3).
- **Esperaba:** que "nadie borra una nota, ni siquiera admin" lo garantizara RLS, como dice el comentario en `02-politicas-rls.sql:350`.
- **Pasó:** la política del admin es `FOR ALL`, que incluye DELETE.
- **Cómo reproducir** (como `app_user`, con el `app.usuario_id` de Yolanda, dentro de una transacción con `rollback`):
  ```sql
  delete from notas where id = '<una nota sin historial>';   -- DELETE 1
  ```
  El profesor recibe `DELETE 0`, como corresponde.
- **Mitigante:** hoy no existe ninguna ruta que borre notas, así que no se puede explotar desde la API. Pero la capa 3 no cumple su papel: si mañana aparece un endpoint con un bug, nada lo frena. Las notas que ya tienen correcciones sí están protegidas de rebote, por la llave foránea de `historial_notas`.
- **Causa:** `backend/02-politicas-rls.sql:347`: `create policy "notas_admin_gestiona" on notas for all …`.
- **Corrección propuesta:** reemplazar esa política por tres explícitas (`for select`, `for insert`, `for update`), sin `delete`. Agregar además `revoke delete on notas from authenticated` como cinturón de seguridad.

---

## ALTO

### A1. La pantalla de Asignaciones no carga: `GET /asignaciones/opciones` → 500

- **Módulo:** Asignaciones (también afecta el alta y la edición).
- **Pasó:** 500 "No se pudo completar la operación" para admin y super_admin. Es una **regresión que introduje yo** con `22-epocas-por-fecha.sql`, que quitó la columna `periodos_academicos.activo`.
- **Evidencia (`storage/logs/laravel.log`):**
  `SQLSTATE[42703]: column "activo" does not exist … select "anio" from "periodos_academicos" where "activo" = 1`
- **Causa:** `backend/app/Services/AsignacionService.php:231-232`. Es la única referencia que quedó; revisé todo `app/`.
- **Corrección:** usar `PeriodoAcademico::anioEscolarActual()`, igual que en Matrículas, Nudos y Porcentajes.

### A2. El login no limita los intentos fallidos

- **Módulo:** Sesión.
- **Esperaba:** un 429 después de N intentos fallidos.
- **Pasó:** 70 intentos seguidos con contraseña mala dieron 70 respuestas 422 y ningún bloqueo. Cualquiera puede probar contraseñas de profesores sin límite, y con una cuenta de profesor se registran notas.
- **Causa:** `backend/routes/api.php:30`: la ruta de login no tiene un `throttle` propio. El límite general de la API no se activó en la prueba.
- **Corrección:** `->middleware('throttle:5,1')` en la ruta del login, por IP y correo (`RateLimiter::for('login', …)` con `by(email|ip)`), con un mensaje en español del tipo "Demasiados intentos, espera un minuto".

---

## MEDIO

### M1. Un profesor que sube notas en una asignación desactivada recibe un 500

- **Esperaba:** un 422 claro. La regla en sí se cumple: la nota no entra.
- **Cómo reproducir:** admin `PATCH /asignaciones/{id}/activo {"activo":false}`; luego el profesor hace `POST /notas/lote` sobre esa asignación → `500 ERROR_INTERNO`.
- **Causa:** `backend/app/Services/NotaService.php:107-150`. `registrarLote()` no revisa `$asignacion->activo` antes de `Nota::create` (línea 143), así que la violación de RLS sube cruda. El profesor sí puede ver su asignación desactivada (política `asignaciones_profesor_ve_las_suyas`), por eso pasa el `exists`.
- **Corrección:** en la rama del profesor, `if (! $asignacion->activo) throw new ErrorDeNegocio('Esta asignación está desactivada y ya no recibe notas. Comunícate con coordinación.')`.

### M2. El token de un usuario desactivado sigue valiendo si la desactivación no pasa por la pantalla de Usuarios

- **Pasó:** con `usuarios.activo = false` puesto por SQL, el token anterior sigue respondiendo 200 en `/autenticacion/yo` y en `/boletines/mio`.
- **Mitigante:** desactivar desde la API (`PUT /usuarios/{id}`) **sí** borra los tokens; lo verifiqué: 401 y 0 tokens en la base. El hueco aparece si la desactivación entra por otro camino (un script, un futuro endpoint).
- **Causa:** `backend/app/Http/Middleware/EstablecerUsuarioActual.php:45`: valida el token pero no `usuarios.activo`. RLS tampoco lo mira.
- **Corrección:** en el middleware, después de `findToken`, rechazar con 401 si el dueño está inactivo; se puede hacer con `fn_usuario_para_login` o una función `security definer` mínima. Otra opción: un trigger que borre los tokens al pasar `activo` a false.

### M3. Ids no numéricos o tipos inválidos devuelven 500 en lugar de 404/422

| Petición (admin) | Respuesta |
|---|---|
| `DELETE /oferta-grados/abc` · `PATCH /oferta-grados/abc/activo` | 500 |
| `PUT /nudos/abc` · `DELETE /nudos/abc` | 500 |
| `PATCH/PUT/DELETE /nudos/asignaturas/abc` | 500 |
| `POST /asignaciones` con `"grado":"nueve"` | 500 (`invalid input syntax for type smallint: "nueve"`) |

- **Causa:**
  - `backend/routes/api.php:182,185,205-210`: las rutas `{ofertaGrado}`, `{nudo}` y `{asignatura}` no llevan `whereNumber`, cuando las de uuid sí llevan `whereUuid`.
  - `backend/app/Http/Requests/AsignacionRequest.php:137-143` (`reglaDeOferta`) y la regla de malla usan `grado` crudo dentro de una consulta, antes de que falle la validación `integer`.
- **Corrección:**
  - `->whereNumber('ofertaGrado' | 'nudo' | 'asignatura')` en esas rutas.
  - En `AsignacionRequest`, aplicar las reglas `exists` con `grado` solo si es entero (`Rule::when(is_numeric(...))`), o castear en `prepareForValidation`.

### M4. El login distingue mayúsculas en el correo

- **Pasó:** `SECRETARIA@sedeprincipal.edu.co` responde "Correo o contraseña incorrectos". Los correos se **guardan** en minúsculas (`UsuarioRequest::prepareForValidation`), pero el login no normaliza lo que escribe la persona. En celular el teclado suele poner la primera letra en mayúscula.
- **Causa:** `backend/app/Http/Requests/LoginRequest.php:18` no normaliza, y `backend/04-login-function.sql:24` compara con `u.email = p_email`.
- **Corrección:** en `LoginRequest::prepareForValidation`, `email = mb_strtolower(trim(...))`. Opcionalmente, `lower()` en la función.

### M5. Matrículas guarda la fecha en UTC: después de las 7 p. m. queda la fecha de mañana

- **Causa:** `backend/app/Services/MatriculaService.php:57,137,167,209` usan `now()->toDateString()`, y `config/app.php` tiene `timezone = UTC`. Esto afecta `fecha_matricula`, `fecha_retiro` y el "hoy" que recibe la pantalla.
- **Evidencia:** está en el código. No la reproduje en vivo porque las pruebas corrieron antes de las 7 p. m. de Colombia.
- **Corrección:** usar `PeriodoAcademico::hoy()`, que ya existe y usa la fecha de Colombia.

### M6. Filtros que no quedan en la URL y se pierden al recargar

- **Matrículas:** solo `pestana` y `anio` van a la URL. La búsqueda, sede, grado/grupo, resultado y estado de las dos pestañas se pierden. Causa: `frontend/src/app/features/matriculas/pages/gestion-matriculas/gestion-matriculas.component.ts:545-562` (`leerUrl`/`escribirUrl`).
- **Seguimiento de notas:** ningún filtro, orden ni vista va a la URL (lo construí así en el módulo de notas).
- **Usuarios** guarda tipo, estado y búsqueda; **Asignaciones** guarda sus 6 filtros y "Quitar filtros" también limpia la URL. Esos dos están bien.
- **Corrección:** el mismo patrón de Asignaciones (`queryParams` con `null` para quitar y `replaceUrl`).

### M7. Los scripts SQL no se pueden correr desde cero fuera de 2026

- **Pasó:** `backend/03-datos-prueba.sql:109-121` siembra las épocas 2026 con fechas relativas a `current_date` (por ejemplo `current_date - 220 days`) y el año fijo en 2026. Desde la 22, la restricción `periodos_fechas_en_su_anio` exige que las fechas caigan dentro de su año. Una instalación nueva a partir de diciembre de 2026 (o antes de marzo) **aborta en la migración 22**.
- **Corrección:** fechas fijas en 03 (o calcular el año desde `current_date`). La 23 ya las corrige, pero corre después de la 22.

### M8. Correcciones simultáneas de la misma nota: la última gana sin aviso

- **Cómo reproducir:** dos sesiones de admin corrigen la misma nota a la vez, una a 2,2 y otra a 3,3. Las dos reciben 200.
- **Evidencia:** valor final 2,2; historial `4.2->3.3 ; 3.3->2.2`.
- **Problema:** el historial queda fiel, pero el segundo admin corrigió creyendo que el valor anterior era 4,2.
- **Corrección:** enviar el `valor` que vio el admin y rechazar con 409 ("Esta nota cambió mientras la editabas") si ya no coincide.

---

## BAJO

| # | Módulo | Hallazgo | Dónde | Propuesta |
|---|---|---|---|---|
| B1 | Validación | Mensajes en inglés: "The nudo pedagogico id field must be present." y "The nudos.0.nudo_id field has a duplicate value." | `backend/lang/es/validation.php` (faltan `present` y `distinct`) | Agregar las claves en español |
| B2 | Validación | "El asignación seleccionado no existe" (concordancia de género) y "El campo notas.0.valor debe ser un número" (nombre de campo crudo) | `lang/es/validation.php` (atributos) y `GuardarNotasRequest::messages` | `attributes()`: `notas.*.valor` → "nota"; mensaje propio para `asignacion_id.exists` |
| B3 | Oferta de grados | Acepta el grupo `"b c!"` (se guardó "B C!") | `backend/app/Http/Requests/CrearOfertaGradoRequest.php:75` | `regex:/^[A-Z0-9]{1,3}$/` o la lista que use el colegio (A, B, UNICO…) |
| B4 | Permisos | Recurso huérfano `btn_exportar_notas` (habilitado para admin y profesor) sin ruta ni botón | `backend/03-datos-prueba.sql:220,229` | Borrarlo, o dejarlo anotado como pendiente |
| B5 | Seguridad | `personal_access_tokens` no tiene RLS: cualquier rol, vía `app_user`, puede leer los hashes de los 110 tokens. No es explotable sin el texto plano y ningún endpoint los expone | Tabla de Sanctum | Defensa en profundidad: `revoke select … from authenticated` si `app_user` no la necesita bajo `authenticated` |
| B6 | Persistencia | Ningún service revisa las filas afectadas en sus `update` (`quitarProrroga`, `cambiarPlazo`, `guardarCalendario`, `AsignacionService::actualizar/cambiarEstado`, `NotaService::corregir`). Hoy solo llega admin y RLS lo deja pasar, así que no hay éxito falso; pero si cambiara un permiso, RLS bloquearía en silencio y la API diría "ok" | Esos métodos | Patrón de los deletes: contar filas afectadas y lanzar `ErrorDeNegocio` si es 0 |
| B7 | Scripts SQL | 21 y 22 no son idempotentes (`create table`, `add constraint` sin `if not exists`) | `21-notas-modulo.sql`, `22-epocas-por-fecha.sql` | Envolver o documentar que corren una sola vez |
| B8 | UI | La barra superior dice "Cierra en 14 días" y la banda del módulo "faltan 13 días" (días de calendario contra horas reales) | `PeriodoActivoResource` vs `features/notas/reglas.ts` | Usar el mismo criterio en los dos |
| B9 | Boletines | En un año sin épocas creadas, `promedioGeneral` llega como `[null]` en vez de `[]` | `backend/app/Services/BoletinService.php:273` | `range(0, n-1)` solo si `n > 0` |
| B10 | Laravel | En rutas con `{modelo}`, el route-model binding corre antes que `requiere.permiso`: un rol sin permiso recibe 404 (RLS oculta la fila) en vez de 403. No filtra nada, pero los códigos son inconsistentes | Prioridad de middleware en `bootstrap/app.php` | Poner `RequierePermiso` antes de `SubstituteBindings` en la lista de prioridad |

---

## Verificado y correcto

**Sesión**
- Credenciales malas y correo inexistente dan el mismo mensaje.
- Campos vacíos o JSON roto dan 422 en español.
- Cerrar sesión revoca el token.
- Un usuario inactivo no entra.
- Ninguna respuesta (login, `/yo`, listado de usuarios) expone `password_hash`.
- Desactivar por API revoca los tokens.

**Matriz de autorización**
- Las 47 rutas probadas × 5 roles: ningún rol accede a algo que no le toca. Sin token, siempre 401.
- Todas las rutas protegidas usan `auth.rls` y su `requiere.permiso`; los Form Requests de escritura de coordinación exigen nivel admin en `authorize()`.
- El menú por rol coincide con los permisos.
- Cada ruta de Angular tiene su `tienePermisoGuard` con el mismo código que Laravel.
- Un 401 descarta la sesión y redirige al login.

**Notas**
- Inserción única: la repetida da 422 y el doble envío simultáneo guarda 1 fila (3 hilos → 201 + 422 + 422).
- Valores 5,1 / 0,9 / 0 / 4,55 / "abc" / null / "4,5" → 422.
- Estudiante de otro curso, asignación ajena, época pasada o futura → 422.
- Lote todo o nada.
- Con la carga cerrada no se acepta nada; una prórroga de **otra** época no sirve; la de esta época sí; al revocarla deja de servir.
- El profesor no edita (API 403, SQL `UPDATE 0`) ni borra (`DELETE 0`); el estudiante no inserta (RLS).
- La corrección exige motivo, rechaza el mismo valor y deja historial.
- El historial no se puede reescribir (`UPDATE 0` / `DELETE 0` como admin).
- Los valores en la base son exactos: `numeric`, con 1 decimal.

**Asignaciones**
- Unicidad con mensaje amable.
- La materia tiene que estar en la malla y el grado/grupo en la oferta de la sede.
- La sede se infiere del profesor e ignora la que manda el cliente.
- Con notas no se borra (409); con una prórroga tampoco (422 amable); sin dependencias se borra (204, verificado en la base).
- Los **12 filtros**, solos y combinados, coinciden con `count(*)` en SQL.

**Nudos y materias**
- No se borra un nudo con materias ni una materia con asignaciones.
- El código de la materia no cambia al editar (verificado en la base).
- Duplicados y longitudes se validan.

**Porcentajes**
- Solo grados 6–11 (Laravel y check en la base).
- Por grado+año, compartido entre grupos.
- Todas las materias del nudo o ninguna; suma exacta 100 (33,33×3 se rechaza y "repartir igual" da 33,34+33,33+33,33).
- Transacción: nudo válido + nudo inválido no guarda nada.
- Un nudo vacío vuelve a promedio simple.

**Boletines: recálculo a mano**
- Hice un cálculo independiente en Python a partir de las notas crudas y la regla de negocio (no de las vistas). Coincidió en **8 casos y en todos los nudos, épocas, definitiva, desempeño y aprobado**:
  - primaria simple (Nelly, 1°);
  - secundaria ponderada 50/30/20 (Esteban, 6-A);
  - secundaria con materia sin nota (Sandra, 6-A: falta Ética, divide por los pesos presentes y marca `incompleto`);
  - años completos 2024 y 2025 (Andrés: definitiva, "Bajo 2,7" y reprobado);
  - año incompleto (definitiva, desempeño y aprobado en null);
  - estudiante sin notas (Camila 2027).
- Escala y redondeo correctos.
- **Acceso:**
  - el estudiante solo ve el suyo (el de otro da 404; el parámetro `estudiante_id` inyectado en `/mio` se ignora);
  - el profesor recibe 403;
  - RLS en las vistas no deja ver filas ajenas.

**Usuarios**
- No se crea admin ni super_admin, y el `rol_id` inyectado se ignora.
- Correo y documento duplicados se detectan normalizados.
- La sede del estudiante está prohibida; la del profesor es obligatoria.
- Un admin no ve, no edita y no borra al super_admin ni a sí mismo.
- RLS bloquea el escalamiento directo (`update rol_id` → violación de RLS).
- No se borra una cuenta con historia (409); una sin historia sí, y su fila de `estudiantes` también se va.

**Matrículas**
- En la base real la matrícula **es por año** (columna `anio`, índice único de activa por estudiante+año).
- Duplicado, grupo cerrado, lote todo o nada y retiro con motivo y detalle se validan.

**Payloads de Angular**
- Asignación, Matrícula, Usuario, Nudo, Materia, Porcentajes y Notas mandan los nombres de campo del Form Request, números como números y `null` (no `""`) en los opcionales.
- El mapeo de errores de Porcentajes por id de nudo coincide con el backend.

**Robustez**
- Tres prórrogas simultáneas sobre la misma asignación dejan 1 viva.
- Todas las pantallas tienen los estados cargando, error, vacío y sin permiso. Sin conexión, los botones de escritura se deshabilitan; el aviso global lo pone el shell.

---

## Lo que NO pude probar, y por qué

- **Recorrido completo en el navegador mirando la pestaña de red.** La ventana de Chrome quedaba oculta detrás de otras y Chrome no dibuja pestañas ocultas, así que las capturas fallaban. Hice las pruebas de UI por script dentro de la página y revisé los payloads en el código; los flujos de Notas sí los recorrí en el navegador en la sesión anterior.
- **Pérdida de conexión a mitad de un guardado.** No hay forma de cortar la red del contenedor en medio de una petición sin herramientas que no tengo aquí. Por código: el request corre en una transacción que hace rollback ante cualquier error, y Notas mantiene el borrador local.
- **Fecha UTC de Matrículas (M5) en vivo.** Las pruebas corrieron antes de las 7 p. m. de Colombia; el hallazgo sale del código.
- **Nudo de una sola materia en Porcentajes.** En 6° 2026 ningún nudo tiene una sola materia. La regla está en el código (`PorcentajeGradoService.php:136`), pero no la ejecuté.
- **Asistencia, Documentos, Reportes y Configuración:** son pantallas "en construcción", sin endpoints que auditar.
- **Pruebas automatizadas (PHPUnit/Pest):** el repo no tiene tests de feature para estos módulos. Todo fue con peticiones reales y SQL; no dejé tests escritos en el repo porque la consigna era no modificar código.
