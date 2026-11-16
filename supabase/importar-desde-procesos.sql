-- Construye el plan del planificador (fila "principal" de public.planner_plans) a partir de los
-- formatos (settings.shared.formats) y los proyectos activos (public.projects) de modularq-procesos.
-- Uso: ejecutar en el editor SQL de Supabase. Para reemplazar un plan existente, borrar antes la fila principal.
with recursive
fm as (select data->'formats' f from public.settings where key = 'shared'),
src as (
  select k as key, f->k->>'tipo' as tipo, f->k->>'modelo' as modelo, f->k->'flow' as flow
  from fm, jsonb_object_keys(f) k
  where k not ilike '%respaldo%'
  union all
  -- proyectos activos cuyo modelo no tiene formato: se usa el flujo del propio proyecto
  select 'proj:' || p.id, p.data->>'tipo', p.data->>'modelo', p.data->'flow'
  from public.projects p, fm
  where p.deleted_at is null and p.data->>'status' = 'Activo'
    and not (fm.f ? ((p.data->>'tipo') || '|' || (p.data->>'modelo')))
),
st(sid, sname, ord) as (values
  ('E1','Estructura metálica',1),('E2','Paneles y cerramientos',2),('E3','Piso',3),('E4','Aberturas: puertas',4),
  ('E5','Aberturas: ventanas',5),('E6','Divisiones interiores',6),('E7','Terminaciones antes de subcontratistas',7),
  ('E8','Instalación de carpintería',8),('E9','Electricidad',9),('E10','Instalación sanitaria',10),
  ('E11','Terminaciones',11),('E12','Correcciones',12),('E13','Control final y limpieza',13)),
n as (
  select s.key, e->>'id' as nid, e->>'type' as typ, coalesce(e->>'kind','') as kind, btrim(e->>'label') as label, o as ord,
    lower(btrim(regexp_replace(e->>'phase', '^Fase\s*\d+\s*·\s*', ''))) as ph
  from src s, jsonb_array_elements(s.flow->'nodes') with ordinality as x(e, o)
),
n2 as (
  select n.*,
    case
      when ph like 'estructura met%' or ph like 'acondicionamiento%' or ph like 'estructura interna%' then 'E1'
      when ph like 'paneles%' then 'E2' when ph = 'piso' then 'E3' when ph like '%puertas%' then 'E4' when ph like '%ventanas%' then 'E5'
      when ph like 'divisiones%' then 'E6' when ph like 'termina%antes%' then 'E7'
      when ph like 'muebler%' or ph like 'instalación carpinter%' then 'E8' when ph like 'electricidad%' then 'E9' when ph like 'instalación sanit%' then 'E10'
      when ph like 'terminaciones%' then 'E11' when ph like 'correcciones%' then 'E12' when ph like 'control final%' then 'E13'
    end as station,
    (typ = 'task' and kind <> 'AM' and label !~* '^acopio' and ph not like 'planos%' and ph not like 'bases de hormig%') as keep
  from n
),
k as (
  select n2.*, 'T' || row_number() over (partition by key order by ord) as code,
    case
      when kind = 'DE' then ''
      when station = 'E13' then case when label ~* 'limpieza' then 'Limpieza' else 'Calidad' end
      when kind = 'IN' then 'Calidad'
      when label ~* 'jaula exterior|condensadora' then 'Soldadura'
      when station = 'E9' then 'Electricidad'
      when station = 'E10' then 'Sanitaria'
      when station = 'E8' then 'Carpintería'
      when label ~* '^(pintado|pintura|segunda mano|primera mano)' then 'Pintura'
      when station = 'E1' then 'Soldadura'
      else 'Montaje'
    end as skill
  from n2 where keep and station is not null
),
ed as (
  select s.key, e->>'from' as a, e->>'to' as b
  from src s, jsonb_array_elements(s.flow->'edges') e
),
walk(key, target, cur, depth) as (
  select ed.key, ed.b, ed.a, 1 from ed join k on k.key = ed.key and k.nid = ed.b
  union
  select w.key, w.target, ed.a, w.depth + 1
  from walk w join ed on ed.key = w.key and ed.b = w.cur
  where w.depth < 400 and not exists (select 1 from k where k.key = w.key and k.nid = w.cur)
),
preds as (
  select w.key, w.target, jsonb_agg(distinct k.code) as codes
  from walk w join k on k.key = w.key and k.nid = w.cur
  group by w.key, w.target
),
tasks as (
  select k.key, jsonb_agg(jsonb_build_object(
      'id', k.code, 'name', k.label, 'station', k.station, 'skill', k.skill,
      'hh', null, 'cmin', 1, 'cmax', 2, 'wait', case when k.kind = 'DE' then null else 0 end,
      'preds', coalesce((select jsonb_agg(c order by (substr(c #>> '{}', 2))::int) from jsonb_array_elements(p.codes) c), '[]'::jsonb),
      'src', k.nid) order by k.ord) as tasks
  from k left join preds p on p.key = k.key and p.target = k.nid
  group by k.key
),
models as (
  select s.key, s.tipo, s.modelo, 'M' || row_number() over (order by s.key like 'proj:%', s.tipo, s.modelo) as mid, t.tasks
  from src s join tasks t on t.key = s.key
),
projs as (
  select p.id, p.data, p.position,
    (select m.mid from models m where m.key = (p.data->>'tipo') || '|' || (p.data->>'modelo') or m.key = 'proj:' || p.id limit 1) as mid
  from public.projects p
  where p.deleted_at is null and p.data->>'status' = 'Activo'
),
plan as (
  select jsonb_build_object(
    'version', 3,
    'planName', 'Programa de planta ModulArq',
    'calendar', jsonb_build_object('start', '2026-11-04', 'hours', jsonb_build_array(0,9,9,9,9,9,0),
                                   'holidays', jsonb_build_array('2026-11-23','2026-12-07','2026-12-08','2026-12-25')),
    'skills', jsonb_build_array('Soldadura','Pintura','Montaje','Carpintería','Electricidad','Sanitaria','Limpieza','Calidad'),
    'stations', (select jsonb_agg(jsonb_build_object('id', sid, 'name', sname, 'cap', 2) order by ord) from st),
    'workers', jsonb_build_array(
      jsonb_build_object('id','W1','name','Gustavo','skills',jsonb_build_array('Soldadura'),'pct',100,'active',true),
      jsonb_build_object('id','W2','name','Orlando','skills',jsonb_build_array('Soldadura'),'pct',100,'active',true),
      jsonb_build_object('id','W3','name','Sebastian','skills',jsonb_build_array('Soldadura','Montaje'),'pct',100,'active',true),
      jsonb_build_object('id','W4','name','Alejandro','skills',jsonb_build_array('Pintura','Montaje'),'pct',100,'active',true),
      jsonb_build_object('id','W5','name','Agustin','skills',jsonb_build_array('Montaje','Soldadura','Pintura'),'pct',100,'active',true),
      jsonb_build_object('id','W6','name','Leandro','skills',jsonb_build_array('Montaje','Soldadura','Pintura'),'pct',100,'active',true),
      jsonb_build_object('id','W7','name','Benjamin','skills',jsonb_build_array('Montaje','Soldadura','Pintura'),'pct',100,'active',true),
      jsonb_build_object('id','W8','name','Jesús','skills',jsonb_build_array('Montaje','Soldadura','Pintura'),'pct',100,'active',true),
      jsonb_build_object('id','W9','name','Micaela','skills',jsonb_build_array('Limpieza'),'pct',100,'active',true),
      jsonb_build_object('id','W10','name','Exequiel (jefe de producción)','skills',jsonb_build_array('Calidad'),'pct',50,'active',true),
      jsonb_build_object('id','W11','name','Subcontratista de electricidad','skills',jsonb_build_array('Electricidad'),'pct',100,'active',true),
      jsonb_build_object('id','W12','name','Subcontratista de sanitarios','skills',jsonb_build_array('Sanitaria'),'pct',100,'active',true),
      jsonb_build_object('id','W13','name','Subcontratista de carpintería','skills',jsonb_build_array('Carpintería'),'pct',100,'active',true)),
    'models', (select jsonb_agg(jsonb_build_object('id', mid, 'name', modelo, 'type', tipo, 'src', key, 'tasks', tasks) order by (substr(mid,2))::int) from models),
    'projects', (select jsonb_agg(jsonb_build_object(
        'id', 'P' || rn, 'name', data->>'name', 'client', coalesce(nullif(data->>'description',''), ''),
        'model', mid, 'qty', greatest(1, coalesce((data->>'modulos')::int, 1)),
        'release', data->>'start', 'due', data->>'end', 'prio', 2, 'src', id) order by rn)
      from (select projs.*, row_number() over (order by position, id) rn from projs) q),
    'balance', '{}'::jsonb
  ) as data
)
insert into public.planner_plans (id, name, data)
select 'principal', data->>'planName', data from plan
on conflict (id) do nothing;
