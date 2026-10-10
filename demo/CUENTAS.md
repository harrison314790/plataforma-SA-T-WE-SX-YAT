# Cuentas de la demo

**Contraseña de todas: `Prueba123!`** (son las cuentas de prueba de
`backend/03`, `13` y `17`; los datos son inventados). No hay cambio de
contraseña obligatorio al entrar.

Solo sirven en la demo. Nunca crear estas cuentas en el servidor real
(allí `25-preparar-piloto.sql` las borra).

| Para quién | Rol | Correo | Qué mostrar |
|---|---|---|---|
| Tú (operador) | super_admin | `admin@sedeprincipal.edu.co` | Todo, incluida la configuración de módulos |
| Secretaria / rector | admin | `secretaria@sedeprincipal.edu.co` | Usuarios, matrículas, asignaciones, seguimiento de notas, calendario de épocas, boletines de cualquier estudiante |
| Profesor A, **Sede Principal** | profesor | `rubiela.ipia@sedeprincipal.edu.co` | Registro de notas: 6-A (varias materias), 6-B, 7-A |
| Profesor B, **Escuela Guaitalá** | profesor | `aldemar.ulcue@sedeprincipal.edu.co` | Registro de notas: 1-ÚNICO (primaria). No ve nada de la profesora A |
| Estudiante **primaria** | estudiante | `nelly.quiguanas@sedeprincipal.edu.co` | Boletín de 1° (2026, en progreso) |
| Estudiante **secundaria, boletín completo** | estudiante | `andres.yule@sedeprincipal.edu.co` | Boletín 2025 (7°) con las 4 épocas cerradas; también 2024 y el 2026 en curso |
| Estudiante **"En progreso"** | estudiante | `luis.perez@sedeprincipal.edu.co` | Boletín 2026 de 9-B: faltan épocas, sale "● En progreso" |

Otras cuentas que existen (misma contraseña): profesores `marta.rios@…`,
`carlos.medina@…` (Escuela La Laguna) y `orlando.yatacue@…` (Sede
Principal); estudiantes `daniela.chocue@…`, `valeria.mestizo@…`,
`camila.tumina@…`, `sandra.pito@…`, `esteban.dagua@…`.

**Calendario (datos de prueba de 2026):** la época activa se calcula con
la fecha de hoy. 3ª época: 7 sep a 27 nov de 2026. Si haces la demo fuera
de esas fechas, coordinación cambia las fechas en Seguimiento de notas →
"Editar fechas".

Para dejarlo todo como estaba después de que la gente juegue con la demo:
`bash demo/reset.sh`.
