-- ============================================================
-- 16-pesos-nudo-por-grado.sql
-- Nudos pedagógicos + porcentajes por grado + boletín por nudo.
--
-- AUTOCONTENIDO: crea todo lo que necesita (catálogo de nudos,
-- columna en asignaturas, tabla de porcentajes, vistas, módulos).
-- No depende de ningún "12-nudos-pedagogicos.sql" -- ese archivo
-- nunca llegó al repo y su contenido quedó absorbido acá.
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- QUÉ ES UN NUDO (del boletín oficial en papel de la institución)
-- Las materias se agrupan en 5 nudos pedagógicos, y la nota que se
-- imprime es la del NUDO. Cada materia la sigue dictando su propio
-- profesor y cada profesor sigue subiendo la nota de SU materia,
-- exactamente igual que antes -- el nudo se calcula encima.
--
-- CÓMO SE CALCULA LA NOTA DEL NUDO
--   · Secundaria (6 a 11): por PORCENTAJES. El admin los fija una
--     vez por grado al iniciar el año (6° y después 7°, 8°, 9°, 10°,
--     11°). Grupo A y B del mismo grado comparten la configuración.
--     La idea del rector: pesar más las materias donde los
--     estudiantes tienen falencias, para que se esfuercen más ahí.
--   · Primaria (1 a 5): SIEMPRE promedio simple. Nunca porcentajes.
--   · Un nudo de secundaria sin porcentajes configurados (o que no
--     suman 100) también cae a promedio simple -- no es un error.
--
-- Corré esto DESPUÉS de 15-notas-respetan-asignacion-activa.sql.
-- ============================================================

begin;

-- ----------------------------------------------------------------
-- 1. Catálogo de nudos pedagógicos
--
-- `orden` es el orden en que salen en el boletín impreso -- no es
-- alfabético, es el de la institución.
-- ----------------------------------------------------------------
create table if not exists nudos_pedagogicos (
  id integer generated always as identity primary key,
  nombre text not null unique,
  orden smallint not null default 100
);

alter table nudos_pedagogicos enable row level security;

drop policy if exists "nudos_pedagogicos_lectura" on nudos_pedagogicos;
create policy "nudos_pedagogicos_lectura" on nudos_pedagogicos for select
  to authenticated using (true);
drop policy if exists "nudos_pedagogicos_admin_escribe" on nudos_pedagogicos;
create policy "nudos_pedagogicos_admin_escribe" on nudos_pedagogicos for all
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

grant select, insert, update, delete on nudos_pedagogicos to authenticated;
grant usage, select on nudos_pedagogicos_id_seq to authenticated;

insert into nudos_pedagogicos (nombre, orden) values
  ('EW NẼESNXI', 10),
  ('KWE''SX KIWETE ÇXHÃCX CXHÃCXA FXI''ZENXI', 20),
  ('KWE''SX WE''WNXIS PHUSE''JEKA', 30),
  ('SEK YAK A''TE DXI''JTHE ATXAHN MJINXI', 40),
  ('WẼT WẼT PA''YAHTX UUTHASXI''JN FXI''ZENXI', 50)
on conflict (nombre) do nothing;

-- ----------------------------------------------------------------
-- 2. Cada materia pertenece a un nudo
--
-- Nullable: una materia nueva puede existir antes de que el admin
-- decida en qué nudo va. Mientras esté en NULL no entra en ningún
-- cálculo de nudo -- el boletín la señala aparte para que no se
-- pierda en silencio.
-- ----------------------------------------------------------------
alter table asignaturas
  add column if not exists nudo_pedagogico_id integer references nudos_pedagogicos(id);

create index if not exists idx_asignaturas_nudo on asignaturas (nudo_pedagogico_id);

-- ----------------------------------------------------------------
-- 3. Las materias del boletín oficial, con su nudo
--
-- Sacadas de los boletines reales de 6° (secundaria) y 5° (primaria)
-- de 2026. Las tres que ya existían (MAT, ESP, CNA) solo reciben su
-- nudo. Es un CATÁLOGO, no datos de prueba: el admin lo puede
-- corregir desde la pantalla de Nudos pedagógicos.
-- ----------------------------------------------------------------
insert into asignaturas (nombre, codigo) values
  ('Educación Física', 'EFI'),
  ('Educación Artística', 'ART'),
  ('Ética y Valores', 'ETI'),
  ('Geografía', 'GEO'),
  ('Historia', 'HIS'),
  ('Democracia', 'DEM'),
  ('Constitución Política', 'CPO'),
  ('Inglés', 'ING'),
  ('Kwe''sx We''wnxi', 'KWE'),
  ('Kwe''sx Yuwe', 'NYU'),
  ('Tecnología e Informática', 'TEC'),
  ('Estadística', 'EST'),
  ('Aritmética', 'ARI'),
  ('Geometría', 'GEM'),
  ('Producción Agrícola', 'PAG'),
  ('Producción Pecuaria', 'PPE'),
  ('Biología', 'BIO'),
  ('Tul A''s Dxi''janxi', 'TUL')
on conflict (codigo) do nothing;

update asignaturas a
set nudo_pedagogico_id = n.id
from (values
  ('EFI', 10), ('ART', 10), ('ETI', 10),
  ('GEO', 20), ('HIS', 20), ('DEM', 20), ('CPO', 20),
  ('ESP', 30), ('ING', 30), ('KWE', 30), ('NYU', 30), ('TEC', 30),
  ('MAT', 40), ('EST', 40), ('ARI', 40), ('GEM', 40),
  ('CNA', 50), ('PAG', 50), ('PPE', 50), ('BIO', 50), ('TUL', 50)
) as m(codigo, orden_nudo)
join nudos_pedagogicos n on n.orden = m.orden_nudo
where a.codigo = m.codigo
  and a.nudo_pedagogico_id is null;   -- no pisar lo que el admin ya cambió

-- Malla curricular mínima, derivada de los mismos dos boletines:
-- secundaria (6-11) con la lista de 6°, primaria (1-5) con la de 5°.
-- Sin esto el formulario de Asignaciones no deja asignar ninguna de
-- las materias nuevas (filtra contra la malla). ⚠️ Es el piso, no
-- la malla real grado por grado -- la institución la ajusta.
insert into malla_curricular (grado, asignatura_id)
select g.grado, a.id
from generate_series(6, 11) as g(grado)
cross join asignaturas a
where a.codigo in ('EFI','ART','ETI','GEO','HIS','DEM','ESP','ING','KWE','TEC',
                   'EST','ARI','PAG','PPE','BIO','TUL')
union all
select g.grado, a.id
from generate_series(1, 5) as g(grado)
cross join asignaturas a
where a.codigo in ('ART','EFI','ETI','HIS','GEO','CPO','ESP','NYU',
                   'ARI','EST','GEM','CNA','BIO','PAG','PPE','TUL')
on conflict (grado, asignatura_id) do nothing;

-- ----------------------------------------------------------------
-- 4. Porcentajes por grado (solo secundaria)
--
-- Por grado + materia + año. NO por grupo (A y B comparten), NO por
-- sede, NO por asignación. La versión descartada los guardaba en
-- `asignaciones.peso_porcentual`, lo que obligaba a repetir la
-- configuración por cada grupo -- se quita por si llegó a correrse.
--
-- `check (grado between 6 and 11)`: primaria nunca usa porcentajes,
-- y que la base lo impida evita que un dato de primaria cambie el
-- cálculo de un boletín por accidente.
--
-- Lo que la base NO puede validar es que los porcentajes de un nudo
-- sumen 100 (es una regla entre filas). Lo hace Laravel
-- (PorcentajeGradoService) antes de guardar, y la vista de abajo
-- igual lo re-verifica: si no suman 100, usa promedio simple.
-- ----------------------------------------------------------------
alter table asignaciones drop column if exists peso_porcentual;

create table if not exists pesos_nudo_grado (
  id integer generated always as identity primary key,
  grado smallint not null check (grado between 6 and 11),
  asignatura_id integer not null references asignaturas(id),
  anio integer not null,
  peso_porcentual numeric(5,2) not null check (peso_porcentual > 0 and peso_porcentual <= 100),
  actualizado_por uuid references usuarios(id),
  updated_at timestamptz not null default now(),
  unique (grado, asignatura_id, anio)
);

alter table pesos_nudo_grado enable row level security;

drop policy if exists "pesos_nudo_grado_lectura" on pesos_nudo_grado;
create policy "pesos_nudo_grado_lectura" on pesos_nudo_grado for select
  to authenticated using (true);
drop policy if exists "pesos_nudo_grado_admin_escribe" on pesos_nudo_grado;
create policy "pesos_nudo_grado_admin_escribe" on pesos_nudo_grado for all
  to authenticated using (fn_es_admin()) with check (fn_es_admin());

grant select, insert, update, delete on pesos_nudo_grado to authenticated;
grant usage, select on pesos_nudo_grado_id_seq to authenticated;

-- ----------------------------------------------------------------
-- 5. El estudiante puede ver las asignaciones de SU grupo
--
-- HUECO REAL: la única política de lectura de `asignaciones` era
-- "profesor dueño o admin". Cualquier vista de boletín cruza
-- notas -> asignaciones, así que para un estudiante devolvía CERO
-- filas -- su propio boletín le salía vacío (también le pasaba a
-- vista_boletin_anual).
--
-- La condición va en una función `security definer` y no en un
-- `exists (select ... from matriculas)` directo: `matriculas` ya
-- tiene una política que consulta `asignaciones`, y dos políticas
-- que se consultan entre sí hacen que Postgres corte con "infinite
-- recursion detected in policy". La función lee `matriculas` sin
-- RLS, pero solo para el estudiante de la sesión -- no expone nada
-- de nadie más.
--
-- Qué ve: profesor + materia + grado + grupo de su propio curso ese
-- año. Nada sensible, es lo que figura en el horario.
-- ----------------------------------------------------------------
create or replace function fn_estudiante_cursa(
  p_sede_id integer, p_grado smallint, p_grupo text, p_anio integer
) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from matriculas m
    join periodos_academicos per on per.id = m.periodo_id
    where m.estudiante_id = fn_estudiante_id_actual()
      and m.sede_id = p_sede_id
      and m.grado = p_grado
      and m.grupo = p_grupo
      and per.anio = p_anio
  );
$$;

revoke all on function fn_estudiante_cursa(integer, smallint, text, integer) from public;
grant execute on function fn_estudiante_cursa(integer, smallint, text, integer) to authenticated;

drop policy if exists "asignaciones_estudiante_ve_las_de_su_grupo" on asignaciones;
create policy "asignaciones_estudiante_ve_las_de_su_grupo" on asignaciones for select
  to authenticated using (fn_estudiante_cursa(sede_id, grado, grupo, anio));

-- ----------------------------------------------------------------
-- 6. Vistas del boletín por nudo
--
-- `security_invoker = true` NO es opcional. Una vista de Postgres
-- corre por defecto con los permisos de su DUEÑO, y el dueño acá es
-- `postgres` (superusuario, se salta RLS). Sin esta opción, un
-- estudiante que consultara la vista vería las notas de TODOS.
-- Con ella, la vista respeta el RLS de `notas` de quien consulta.
--
-- Escala de la institución: 1 decimal (como el boletín impreso), y
-- se aprueba desde 3.0 sobre ese valor ya redondeado.
--
-- PONDERADO, Y POR QUÉ SE DIVIDE POR LA SUMA DE PESOS PRESENTES
-- Los profesores están obligados a subir todas las notas, pero
-- mientras el período está abierto siempre hay alguna que falta. Si
-- se sumara `valor * peso / 100` a secas, una materia sin nota
-- contaría como 0 y hundiría el nudo (falta la del 40% -> el nudo
-- no puede pasar de 3.0). Dividiendo por la suma de los pesos de
-- las materias que SÍ tienen nota, el resultado parcial es honesto,
-- y cuando están todas da exactamente lo mismo que la fórmula
-- completa. Que falten notas lo señala el boletín, no la vista.
-- ----------------------------------------------------------------
drop view if exists vista_boletin_nudo_anual;
drop view if exists vista_boletin_nudo_periodo;

create view vista_boletin_nudo_periodo with (security_invoker = true) as
with pesos_completos as (
  -- nudo + grado + año cuyos porcentajes suman 100: solo esos
  -- se calculan ponderados
  select pg.grado, pg.anio, ast.nudo_pedagogico_id
  from pesos_nudo_grado pg
  join asignaturas ast on ast.id = pg.asignatura_id
  where ast.nudo_pedagogico_id is not null
  group by pg.grado, pg.anio, ast.nudo_pedagogico_id
  having abs(sum(pg.peso_porcentual) - 100) < 0.01
),
notas_del_nudo as (
  select
    n.estudiante_id, n.periodo_id, a.anio, ast.nudo_pedagogico_id, n.valor,
    case when pc.nudo_pedagogico_id is not null then pg.peso_porcentual end as peso
  from notas n
  join asignaciones a on a.id = n.asignacion_id
  join asignaturas ast on ast.id = a.asignatura_id
  left join pesos_completos pc
    on pc.grado = a.grado and pc.anio = a.anio and pc.nudo_pedagogico_id = ast.nudo_pedagogico_id
  left join pesos_nudo_grado pg
    on pg.grado = a.grado and pg.anio = a.anio and pg.asignatura_id = ast.id
  where ast.nudo_pedagogico_id is not null
)
select
  estudiante_id,
  nudo_pedagogico_id,
  anio,
  periodo_id,
  case
    when count(peso) = count(*) then round(sum(valor * peso) / sum(peso), 1)
    else round(avg(valor), 1)
  end as nota_nudo,
  (count(peso) = count(*)) as es_ponderado,
  count(*)::integer as materias_calificadas
from notas_del_nudo
group by estudiante_id, nudo_pedagogico_id, anio, periodo_id;

create view vista_boletin_nudo_anual with (security_invoker = true) as
with total_periodos_por_anio as (
  select anio, count(*) as total
  from periodos_academicos
  group by anio
)
select
  vb.estudiante_id,
  vb.nudo_pedagogico_id,
  vb.anio,
  count(vb.nota_nudo)::integer as periodos_calificados,
  tp.total::integer as periodos_totales,
  round(avg(vb.nota_nudo), 1) as promedio,
  case
    when count(vb.nota_nudo) < tp.total then null   -- año en curso: "en progreso"
    when round(avg(vb.nota_nudo), 1) >= 3.0 then true
    else false
  end as aprobado,
  (count(vb.nota_nudo) < tp.total) as es_parcial
from vista_boletin_nudo_periodo vb
join total_periodos_por_anio tp on tp.anio = vb.anio
group by vb.estudiante_id, vb.nudo_pedagogico_id, vb.anio, tp.total;

grant select on vista_boletin_nudo_periodo, vista_boletin_nudo_anual to authenticated;

-- El mismo agujero existía en la vista por materia de
-- 10-vista-boletin-anual.sql (dueño postgres, sin security_invoker).
-- Hoy nadie la consulta desde la app, pero el día que alguien le dé
-- un GRANT, filtraría todas las notas. Se cierra ahora.
alter view vista_boletin_anual set (security_invoker = true);
grant select on vista_boletin_anual to authenticated;

-- ----------------------------------------------------------------
-- 7. Tres módulos en el menú (las tres capas de seguridad)
--
-- Separados y no un solo módulo con pestañas: cada uno es una
-- pantalla independiente, con su propio permiso, y "Boletines" la
-- ve también el estudiante -- las otras dos son solo de admin.
-- ----------------------------------------------------------------
insert into modulos (codigo, etiqueta, grupo, icono, orden, activo) values
  ('nudos',       'Nudos pedagógicos',     'Académico', 'nudo',       16, true),
  ('porcentajes', 'Porcentajes por grado', 'Académico', 'porcentaje', 17, true),
  ('boletines',   'Boletines',             'Académico', 'boletin',    18, true)
on conflict (codigo) do update
  set etiqueta = excluded.etiqueta,
      grupo    = excluded.grupo,
      icono    = excluded.icono,
      orden    = excluded.orden;

insert into recursos (codigo, tipo, descripcion, modulo, etiqueta, ruta, icono, orden) values
  ('vista_nudos_pedagogicos', 'vista', 'Nudos pedagógicos y qué materias componen cada uno',      'nudos',       'Nudos pedagógicos',     '/nudos',       'nudo',       10),
  ('btn_gestionar_nudos',     'boton', 'Crear, renombrar o eliminar nudos y asignarles materias', 'nudos',       'Gestionar nudos',       null,           null,         100),
  ('vista_porcentajes_grado', 'vista', 'Porcentaje de cada materia dentro de su nudo, por grado', 'porcentajes', 'Porcentajes por grado', '/porcentajes', 'porcentaje', 10),
  ('btn_guardar_porcentajes', 'boton', 'Guardar los porcentajes de un grado',                     'porcentajes', 'Guardar',               null,           null,         100),
  ('vista_boletines',         'vista', 'Boletín de notas por nudo pedagógico',                    'boletines',   'Boletines',             '/boletines',   'boletin',    10)
on conflict (codigo) do update
  set descripcion = excluded.descripcion,
      modulo      = excluded.modulo,
      etiqueta    = excluded.etiqueta,
      ruta        = excluded.ruta,
      icono       = excluded.icono,
      orden       = excluded.orden;

-- El profesor NO ve boletines, y es deliberado: RLS solo le deja
-- leer las notas de SUS materias, así que la vista le calcularía el
-- nudo con una sola materia -- un número que no es el del boletín.
-- Mejor no mostrarle nada que mostrarle una nota falsa.
insert into permisos (rol_id, recurso_id, habilitado)
select r.id, rec.id, datos.habilitado
from (values
  ('admin',      'vista_nudos_pedagogicos', true),
  ('profesor',   'vista_nudos_pedagogicos', false),
  ('estudiante', 'vista_nudos_pedagogicos', false),
  ('admin',      'btn_gestionar_nudos',     true),
  ('profesor',   'btn_gestionar_nudos',     false),
  ('estudiante', 'btn_gestionar_nudos',     false),
  ('admin',      'vista_porcentajes_grado', true),
  ('profesor',   'vista_porcentajes_grado', false),
  ('estudiante', 'vista_porcentajes_grado', false),
  ('admin',      'btn_guardar_porcentajes', true),
  ('profesor',   'btn_guardar_porcentajes', false),
  ('estudiante', 'btn_guardar_porcentajes', false),
  ('admin',      'vista_boletines',         true),
  ('profesor',   'vista_boletines',         false),
  ('estudiante', 'vista_boletines',         true)
) as datos(rol, codigo, habilitado)
join roles r      on r.nombre = datos.rol
join recursos rec on rec.codigo = datos.codigo
on conflict (rol_id, recurso_id) do update set habilitado = excluded.habilitado;

commit;

-- ============================================================
-- Verificación (opcional, correr aparte)
-- ============================================================
-- -- materias por nudo:
-- select n.orden, n.nombre, string_agg(a.nombre, ', ' order by a.nombre)
-- from nudos_pedagogicos n left join asignaturas a on a.nudo_pedagogico_id = n.id
-- group by n.id order by n.orden;
--
-- -- configurar porcentajes de un nudo para 6°, 2026 (lo normal es
-- -- hacerlo desde la pantalla, que valida que sumen 100):
-- insert into pesos_nudo_grado (grado, asignatura_id, anio, peso_porcentual)
-- select 6, id, 2026, p from (values ('EFI', 30), ('ART', 40), ('ETI', 30)) v(c, p)
-- join asignaturas on codigo = v.c;
--
-- select * from vista_boletin_nudo_anual where anio = 2026;
--
-- ⚠️ Probar como `app_user` con set_config('app.usuario_id', ...),
-- NUNCA como `postgres` -- el superusuario se salta RLS y haría
-- parecer que todo funciona.
