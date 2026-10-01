-- ============================================================
-- 15-notas-respetan-asignacion-activa.sql
-- Una asignación DESACTIVADA deja de aceptar notas nuevas.
--
-- ⚠️ ESTE ARCHIVO TOCA EL MÓDULO DE NOTAS, no el de asignaciones.
-- Reescribe `notas_profesor_inserta_dentro_de_plazo`, que es la
-- política más sensible del sistema. Leer entero antes de correr.
--
-- EL HUECO QUE CIERRA
-- `11-asignaciones-modulo.sql` agregó `asignaciones.activo` para
-- poder sacar de circulación una asignación que no se puede borrar
-- (porque tiene notas y `notas.asignacion_id` no tiene cascade).
-- Pero dejó dicho, al final de ese mismo archivo, que la columna no
-- impedía nada: la política de inserción de notas no la miraba, así
-- que un profesor con una asignación desactivada podía seguir
-- registrando notas ahí si conocía el id. La interfaz ya no se la
-- ofrecía; la interfaz no es seguridad.
--
-- Resultado: "Desactivar" prometía algo que no cumplía. Esto lo
-- cumple.
--
-- QUÉ CAMBIA EXACTAMENTE
-- Una sola condición, en el primer `exists`: `a.activo = true`.
-- Todo lo demás queda idéntico a como lo dejó
-- 09-asignaciones-por-anio.sql -- la comparación por año, el `grupo`
-- en el cruce con matrículas, y la excepción de plazo atada al
-- período puntual. Se transcribe completa y no se parchea, porque
-- Postgres no deja modificar una política: hay que soltarla y
-- recrearla, y una transcripción incompleta acá es un agujero.
--
-- A QUIÉN NO LE APLICA, Y ESO NO CAMBIA
-- Esta política es solo del rol `profesor`. `admin`/`super_admin`
-- entran por `notas_admin_gestiona`, que no tiene condición de plazo
-- ni de estado -- y así debe seguir: una corrección administrativa
-- sobre una asignación vieja y desactivada es justamente uno de los
-- casos para los que existe esa política.
--
-- LO QUE NO HACE: no toca las notas YA registradas. Desactivar
-- nunca invalida lo que ya existe -- siguen contando en
-- `vista_boletin_anual`, que consulta `notas` y no el estado de la
-- asignación. Solo se cierra la puerta a notas NUEVAS.
--
-- Corré esto DESPUÉS de 14-acciones-de-tabla.sql.
-- ============================================================

begin;

drop policy if exists "notas_profesor_inserta_dentro_de_plazo" on notas;

create policy "notas_profesor_inserta_dentro_de_plazo" on notas for insert
  to authenticated with check (
    -- 1. La asignación es suya Y ESTÁ VIGENTE.
    --    `a.activo` es lo único que agrega este archivo.
    exists (
      select 1 from asignaciones a
      where a.id = asignacion_id
        and a.profesor_id = fn_profesor_id_actual()
        and a.activo = true
    )
    -- 2. El estudiante está matriculado en ese sede+grado+grupo, en
    --    el período que se está calificando. `grupo` entra en la
    --    comparación desde 07: sin él, una asignación en 9-A
    --    alcanzaría a los estudiantes de 9-B.
    and exists (
      select 1 from matriculas m
      join asignaciones a on a.sede_id = m.sede_id
                          and a.grado = m.grado
                          and a.grupo = m.grupo
      where a.id = asignacion_id
        and m.estudiante_id = notas.estudiante_id
        and m.periodo_id = notas.periodo_id
    )
    -- 3. Está dentro del plazo del período, o hay una excepción
    --    vigente PARA ESE PERÍODO -- no para cualquiera de los 4 de
    --    la asignación (desde 09, una asignación cubre el año).
    and (
      exists (
        select 1 from periodos_academicos p
        where p.id = notas.periodo_id
          and p.notas_habilitadas = true
          and now() <= p.fecha_limite_notas
      )
      or exists (
        select 1 from excepciones_plazo ex
        where ex.asignacion_id = notas.asignacion_id
          and ex.profesor_id = fn_profesor_id_actual()
          and ex.periodo_id = notas.periodo_id
          and now() <= ex.fecha_limite_extendida
      )
    )
  );

commit;

-- ============================================================
-- Verificación (correr aparte, y conviene hacerla de verdad)
-- ============================================================
-- -- 1. La condición quedó en la política:
-- select case when with_check::text like '%a.activo%' then 'OK: mira activo'
--             else 'FALTA' end
-- from pg_policies
-- where tablename = 'notas' and policyname = 'notas_profesor_inserta_dentro_de_plazo';
--
-- -- 2. La prueba real, como `app_user` y NUNCA como `postgres` (que
-- --    salta RLS y haría parecer que funciona sin evaluarse). Sacar
-- --    los uuid en una sesión aparte y pasarlos literales -- ver la
-- --    trampa del punto 9 del checklist en references/base-datos.md.
-- --
-- --    a) desactivar una asignación de Marta:
-- --       update asignaciones set activo = false where id = '<uuid>';
-- --    b) como Marta (set_config('app.usuario_id', '<su uuid>', false)),
-- --       intentar insertar una nota en esa asignación
-- --       -> debe fallar con "new row violates row-level security policy"
-- --    c) reactivarla y repetir -> debe insertar
-- --    d) como Yolanda (admin), insertar en la asignación DESACTIVADA
-- --       -> debe insertar igual: `notas_admin_gestiona` no mira estado.
-- --    e) borrar las notas de prueba para no alterar la semilla.
