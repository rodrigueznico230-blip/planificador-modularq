-- Planificador multi-proyecto: plan compartido de la planta (maestro + proyectos) en JSON.
-- Reutiliza private.is_admin(), private.is_member() y public.stamp_row() de ModulArq.
create table public.planner_plans (
  id text primary key default 'principal' check (char_length(id) between 1 and 100),
  name text not null default '',
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

create index planner_plans_updated_by_idx on public.planner_plans (updated_by);

comment on table public.planner_plans is 'Planificador multi-proyecto: calendario, estaciones, operarios, modelos y proyectos en un documento JSON por plan. version permite control de concurrencia optimista.';

create or replace function private.bump_plan_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  return new;
end $$;

create trigger planner_plans_stamp before insert or update on public.planner_plans
  for each row execute function public.stamp_row();
create trigger planner_plans_version before update on public.planner_plans
  for each row execute function private.bump_plan_version();

alter table public.planner_plans enable row level security;

create policy "integrantes ven planes" on public.planner_plans
  for select to authenticated using ((select private.is_member()));
create policy "administradores crean planes" on public.planner_plans
  for insert to authenticated with check ((select private.is_admin()));
create policy "administradores editan planes" on public.planner_plans
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "administradores borran planes" on public.planner_plans
  for delete to authenticated using ((select private.is_admin()));

revoke all on public.planner_plans from anon;
grant select, insert, update, delete on public.planner_plans to authenticated;
