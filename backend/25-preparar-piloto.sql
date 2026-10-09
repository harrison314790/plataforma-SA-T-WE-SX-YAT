-- ============================================================
-- 25-preparar-piloto.sql  --  SOLO para el servidor del piloto / producción
--
-- Los scripts 01..24 crean la estructura y el catálogo, pero varios de
-- ellos (03, 13, 17, 18, 23) también siembran PERSONAS DE PRUEBA (Marta
-- Ríos, Luis Pérez...) con la contraseña conocida `Prueba123!`, más sus
-- notas, matrículas y asignaciones. En un servidor al que entran
-- profesores reales eso no puede quedar.
--
-- Este script:
--   1. Borra todo lo de prueba: notas, historial, prórrogas, documentos,
--      matrículas, acudientes, asignaciones, porcentajes, estudiantes,
--      profesores, sesiones y TODAS las cuentas de usuario.
--   2. Borra las épocas de años que no son el del piloto (2024 y 2025
--      vienen del histórico de prueba de 18).
--   3. Conserva el catálogo: roles, módulos, recursos, permisos, nudos
--      pedagógicos, materias, malla curricular, sedes y oferta de grados.
--   4. Crea las DOS cuentas que la pantalla de Usuarios no puede crear:
--      super_admin (el operador del sistema) y admin (coordinación). Los
--      profesores y estudiantes los crea coordinación desde la pantalla.
--
-- Uso (en el servidor, como el superusuario de Postgres):
--
--   psql -U postgres -d sistema_academico \
--     -v anio=2026 \
--     -v super_email='tu.correo@colegio.edu.co' -v super_clave='UnaClaveLarga!' \
--     -v super_nombres='Harrison' -v super_apellidos='Valencia' -v super_documento='1234567890' \
--     -v admin_email='coordinacion@colegio.edu.co' -v admin_clave='OtraClaveLarga!' \
--     -v admin_nombres='Nombre' -v admin_apellidos='Apellido' -v admin_documento='9876543210' \
--     -f 25-preparar-piloto.sql
--
-- Las contraseñas se guardan con bcrypt (pgcrypto, costo 12), el mismo
-- algoritmo que valida Laravel. Pide a cada persona cambiarla... cuando
-- exista la pantalla para eso (hoy no existe: ver DESPLIEGUE.md).
--
-- DESTRUCTIVO: no se puede deshacer. Correrlo en una base con datos
-- reales borraría esos datos. Saca un respaldo antes (pg_dump).
-- ============================================================

\set ON_ERROR_STOP on

begin;

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------
-- 1. Datos y personas de prueba
-- ----------------------------------------------------------------
-- El trigger de auditoría de notas solo actúa en UPDATE; los DELETE
-- corren como superusuario (RLS no aplica al dueño de las tablas).
delete from historial_notas;
delete from notas;
delete from excepciones_plazo;
delete from documentos;
delete from estudiante_acudientes;
delete from matriculas;
delete from acudientes;
delete from pesos_nudo_grado;
delete from asignaciones;
delete from estudiantes;
delete from profesores;
-- La tabla de sesiones la crea Laravel (`php artisan migrate`); si este
-- script corre antes de eso, no existe todavía.
do $$ begin
  if to_regclass('public.personal_access_tokens') is not null then
    delete from personal_access_tokens;
  end if;
end $$;
delete from usuarios;

-- ----------------------------------------------------------------
-- 2. Épocas de otros años (histórico de prueba)
-- ----------------------------------------------------------------
delete from periodos_academicos where anio <> :anio;

-- ----------------------------------------------------------------
-- 3. Las dos cuentas de administración
-- ----------------------------------------------------------------
insert into usuarios (email, password_hash, rol_id, sede_id, nombres, apellidos, documento, activo)
select lower(btrim(:'super_email')),
       replace(crypt(:'super_clave', gen_salt('bf', 12)), '$2a$', '$2y$'),
       (select id from roles where nombre = 'super_admin'),
       (select id from sedes where tipo = 'principal' order by id limit 1),
       :'super_nombres', :'super_apellidos', :'super_documento', true;

insert into usuarios (email, password_hash, rol_id, sede_id, nombres, apellidos, documento, activo)
select lower(btrim(:'admin_email')),
       replace(crypt(:'admin_clave', gen_salt('bf', 12)), '$2a$', '$2y$'),
       (select id from roles where nombre = 'admin'),
       (select id from sedes where tipo = 'principal' order by id limit 1),
       :'admin_nombres', :'admin_apellidos', :'admin_documento', true;

commit;

-- Lo que queda (para revisar a ojo):
select 'usuarios' as que, count(*) from usuarios
union all select 'épocas ' || :anio, count(*) from periodos_academicos
union all select 'sedes', count(*) from sedes
union all select 'materias', count(*) from asignaturas
union all select 'nudos', count(*) from nudos_pedagogicos
union all select 'oferta de grados', count(*) from oferta_grados;
