-- 03_rls_policies.sql
-- Funcoes de tenant, RLS e policies.

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select (auth.uid())::uuid
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
as $$
  select public.current_user_email() in (
    'gabrielalvesdesiqueira683@gmail.com',
    'hadjnovan@gmail.com',
    'demo@gmail.com'
  )
$$;

create or replace function public.normalize_company_role(input_role text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(input_role, ''))
    when 'admin' then 'admin'
    when 'manager' then 'manager'
    when 'gestao' then 'manager'
    when 'supervisor' then 'supervisor'
    when 'pcp' then 'supervisor'
    when 'operator' then 'operator'
    when 'fabrica' then 'operator'
    when 'tv' then 'tv'
    else null
  end
$$;

create or replace function public.company_role_rank(input_role text)
returns integer
language sql
immutable
as $$
  select case public.normalize_company_role(input_role)
    when 'tv' then 1
    when 'operator' then 2
    when 'supervisor' then 3
    when 'manager' then 4
    when 'admin' then 5
    else 0
  end
$$;

create or replace function public.company_role_for_user(target_company_id uuid)
returns text
language sql
stable
security definer
as $$
  select public.normalize_company_role(role)
  from public.company_users cu
  where cu.company_id = target_company_id
    and cu.active = true
    and (
      cu.user_id = public.current_user_id()
      or lower(cu.email) = public.current_user_email()
    )
  order by created_at desc
  limit 1;
$$;

create or replace function public.user_has_company_role(target_company_id uuid, required_roles text[])
returns boolean
language sql
stable
security definer
as $$
  with user_role as (
    select public.company_role_rank(cu.role) as rank
    from public.company_users cu
    where cu.company_id = target_company_id
      and cu.active = true
      and (
        cu.user_id = public.current_user_id()
        or lower(cu.email) = public.current_user_email()
      )
    order by created_at desc
    limit 1
  ), required_rank as (
    select min(public.company_role_rank(r)) as rank
    from unnest(required_roles) as r
  )
  select
    public.is_platform_admin()
    or exists (
      select 1
      from user_role ur
      cross join required_rank rr
      where ur.rank > 0
        and rr.rank > 0
        and ur.rank >= rr.rank
    );
$$;

create or replace function public.can_access_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1 from public.company_users cu
      where cu.company_id = target_company_id
        and cu.active = true
        and (
          cu.user_id = public.current_user_id()
          or lower(cu.email) = public.current_user_email()
        )
    );
$$;

create or replace function public.resolve_company_user_login(target_subdomain text, target_username text)
returns table (email text, company_id uuid, role text)
language sql
stable
security definer
as $$
  select
    cu.email,
    cu.company_id,
    public.normalize_company_role(cu.role) as role
  from public.company_users cu
  join public.companies c on c.id = cu.company_id
  where c.active = true
    and cu.active = true
    and (
      lower(c.subdomain) = lower(coalesce(target_subdomain, ''))
      or lower(c.slug) = lower(coalesce(target_subdomain, ''))
    )
    and lower(cu.username) = lower(coalesce(target_username, ''))
  order by cu.created_at desc
  limit 1;
$$;
grant execute on function public.resolve_company_user_login(text, text) to anon, authenticated;

create or replace function public.resolve_public_company_by_subdomain(target_subdomain text)
returns table (
  id uuid,
  name text,
  slug text,
  subdomain text,
  is_demo boolean,
  active boolean
)
language sql
stable
security definer
as $$
  select
    c.id,
    c.name,
    c.slug,
    c.subdomain,
    c.is_demo,
    c.active
  from public.companies c
  where c.active = true
    and (
      lower(c.subdomain) = lower(coalesce(target_subdomain, ''))
      or lower(c.slug) = lower(coalesce(target_subdomain, ''))
    )
  order by c.created_at desc
  limit 1;
$$;
grant execute on function public.resolve_public_company_by_subdomain(text) to anon, authenticated;

do $$
begin
  alter table public.company_users drop constraint if exists company_users_role_chk;
  alter table public.company_users
    add constraint company_users_role_chk
    check (role in ('admin','manager','supervisor','operator','tv','gestao','pcp','fabrica'));
exception
  when undefined_table then
    null;
end $$;

-- Habilita RLS em todas as tabelas multiempresa.
do $$
declare
  tbl text;
  target_tables text[] := array[
    'companies',
    'company_users',
    'machines',
    'orders',
    'production_scans',
    'machine_stops',
    'scrap_logs',
    'low_efficiency_logs',
    'injection_production_entries',
    'tablet_status',
    'machine_priorities',
    'items',
    'item_structures',
    'estoque_purchases',
    'estoque_requisitions',
    'estoque_returns',
    'estoque_finished_outputs',
    'shift_responsibles',
    'order_machine_sessions',
    'tech_sheets',
    'tech_sheet_revisions'
  ];
begin
  foreach tbl in array target_tables loop
    if to_regclass(format('public.%s', tbl)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', tbl);
  end loop;
end $$;

do $$
declare
  p record;
  target_policies text[] := array[
    'companies_select','companies_insert_admin','companies_update_admin','companies_delete_admin',
    'company_users_select','company_users_insert_admin','company_users_update_admin','company_users_delete_admin',
    'operational_select','operational_insert','operational_update','operational_delete',
    'orders_select','orders_insert','orders_update','orders_delete',
    'production_scans_select','production_scans_insert','production_scans_update','production_scans_delete',
    'machine_stops_select','machine_stops_insert','machine_stops_update','machine_stops_delete',
    'scrap_logs_select','scrap_logs_insert','scrap_logs_update','scrap_logs_delete',
    'low_efficiency_logs_select','low_efficiency_logs_insert','low_efficiency_logs_update','low_efficiency_logs_delete',
    'injection_production_entries_select','injection_production_entries_insert','injection_production_entries_update','injection_production_entries_delete',
    'tablet_status_select','tablet_status_insert','tablet_status_update','tablet_status_delete',
    'machine_priorities_select','machine_priorities_insert','machine_priorities_update','machine_priorities_delete',
    'items_select','items_insert','items_update','items_delete',
    'item_structures_select','item_structures_insert','item_structures_update','item_structures_delete',
    'shift_responsibles_select','shift_responsibles_insert','shift_responsibles_update','shift_responsibles_delete',
    'order_machine_sessions_select','order_machine_sessions_insert','order_machine_sessions_update','order_machine_sessions_delete',
    'estoque_requisitions_select','estoque_requisitions_insert','estoque_requisitions_update','estoque_requisitions_delete',
    'estoque_returns_select','estoque_returns_insert','estoque_returns_update','estoque_returns_delete',
    'estoque_finished_outputs_select','estoque_finished_outputs_insert','estoque_finished_outputs_update','estoque_finished_outputs_delete',
    'estoque_purchases_select','estoque_purchases_insert','estoque_purchases_update','estoque_purchases_delete',
    'tech_sheets_select','tech_sheets_insert','tech_sheets_update','tech_sheets_delete',
    'tech_sheet_revisions_select','tech_sheet_revisions_insert','tech_sheet_revisions_update','tech_sheet_revisions_delete'
  ];
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname = any(target_policies)
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy companies_select on public.companies
  for select to authenticated
  using (
    public.is_platform_admin()
    or active = true
    or exists (
      select 1 from public.company_users cu
      where cu.company_id = companies.id
        and cu.active = true
        and (
          cu.user_id = public.current_user_id()
          or lower(cu.email) = public.current_user_email()
        )
    )
  );
create policy companies_insert_admin on public.companies
  for insert to authenticated
  with check (public.is_platform_admin());
create policy companies_update_admin on public.companies
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.user_has_company_role(id, array['admin'])
  )
  with check (
    public.is_platform_admin()
    or public.user_has_company_role(id, array['admin'])
  );
create policy companies_delete_admin on public.companies
  for delete to authenticated
  using (public.is_platform_admin());

create policy company_users_select on public.company_users
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.user_has_company_role(company_id, array['admin'])
    or user_id = public.current_user_id()
    or lower(email) = public.current_user_email()
  );
create policy company_users_insert_admin on public.company_users
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.user_has_company_role(company_id, array['admin'])
  );
create policy company_users_update_admin on public.company_users
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.user_has_company_role(company_id, array['admin'])
  )
  with check (
    public.is_platform_admin()
    or public.user_has_company_role(company_id, array['admin'])
  );
create policy company_users_delete_admin on public.company_users
  for delete to authenticated
  using (
    public.is_platform_admin()
    or public.user_has_company_role(company_id, array['admin'])
  );

create policy operational_select on public.machines
  for select to authenticated
  using (public.can_access_company(company_id));
create policy operational_insert on public.machines
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.user_has_company_role(company_id, array['admin'])
  );
create policy operational_update on public.machines
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.user_has_company_role(company_id, array['admin'])
  )
  with check (
    public.is_platform_admin()
    or public.user_has_company_role(company_id, array['admin'])
  );
create policy operational_delete on public.machines
  for delete to authenticated
  using (
    public.is_platform_admin()
    or public.user_has_company_role(company_id, array['admin'])
  );

create policy orders_select on public.orders
  for select to authenticated
  using (public.can_access_company(company_id));
create policy orders_insert on public.orders
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy orders_update on public.orders
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy orders_delete on public.orders
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy production_scans_select on public.production_scans
  for select to authenticated
  using (public.can_access_company(company_id));
create policy production_scans_insert on public.production_scans
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy production_scans_update on public.production_scans
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy production_scans_delete on public.production_scans
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy machine_stops_select on public.machine_stops
  for select to authenticated
  using (public.can_access_company(company_id));
create policy machine_stops_insert on public.machine_stops
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy machine_stops_update on public.machine_stops
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy machine_stops_delete on public.machine_stops
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy scrap_logs_select on public.scrap_logs
  for select to authenticated
  using (public.can_access_company(company_id));
create policy scrap_logs_insert on public.scrap_logs
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy scrap_logs_update on public.scrap_logs
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy scrap_logs_delete on public.scrap_logs
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy low_efficiency_logs_select on public.low_efficiency_logs
  for select to authenticated
  using (public.can_access_company(company_id));
create policy low_efficiency_logs_insert on public.low_efficiency_logs
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy low_efficiency_logs_update on public.low_efficiency_logs
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy low_efficiency_logs_delete on public.low_efficiency_logs
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy injection_production_entries_select on public.injection_production_entries
  for select to authenticated
  using (public.can_access_company(company_id));
create policy injection_production_entries_insert on public.injection_production_entries
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy injection_production_entries_update on public.injection_production_entries
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy injection_production_entries_delete on public.injection_production_entries
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy tablet_status_select on public.tablet_status
  for select to authenticated
  using (public.can_access_company(company_id));
create policy tablet_status_insert on public.tablet_status
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy tablet_status_update on public.tablet_status
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy tablet_status_delete on public.tablet_status
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy machine_priorities_select on public.machine_priorities
  for select to authenticated
  using (public.can_access_company(company_id));
create policy machine_priorities_insert on public.machine_priorities
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy machine_priorities_update on public.machine_priorities
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy machine_priorities_delete on public.machine_priorities
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy items_select on public.items
  for select to authenticated
  using (public.can_access_company(company_id));
create policy items_insert on public.items
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy items_update on public.items
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy items_delete on public.items
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy item_structures_select on public.item_structures
  for select to authenticated
  using (public.can_access_company(company_id));
create policy item_structures_insert on public.item_structures
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy item_structures_update on public.item_structures
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy item_structures_delete on public.item_structures
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy shift_responsibles_select on public.shift_responsibles
  for select to authenticated
  using (public.can_access_company(company_id));
create policy shift_responsibles_insert on public.shift_responsibles
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy shift_responsibles_update on public.shift_responsibles
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor','operator']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy shift_responsibles_delete on public.shift_responsibles
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy order_machine_sessions_select on public.order_machine_sessions
  for select to authenticated
  using (public.can_access_company(company_id));
create policy order_machine_sessions_insert on public.order_machine_sessions
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy order_machine_sessions_update on public.order_machine_sessions
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor','operator']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy order_machine_sessions_delete on public.order_machine_sessions
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy estoque_requisitions_select on public.estoque_requisitions
  for select to authenticated
  using (public.can_access_company(company_id));
create policy estoque_requisitions_insert on public.estoque_requisitions
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy estoque_requisitions_update on public.estoque_requisitions
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor','operator']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy estoque_requisitions_delete on public.estoque_requisitions
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy estoque_returns_select on public.estoque_returns
  for select to authenticated
  using (public.can_access_company(company_id));
create policy estoque_returns_insert on public.estoque_returns
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy estoque_returns_update on public.estoque_returns
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor','operator']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy estoque_returns_delete on public.estoque_returns
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy estoque_finished_outputs_select on public.estoque_finished_outputs
  for select to authenticated
  using (public.can_access_company(company_id));
create policy estoque_finished_outputs_insert on public.estoque_finished_outputs
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy estoque_finished_outputs_update on public.estoque_finished_outputs
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor','operator']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy estoque_finished_outputs_delete on public.estoque_finished_outputs
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy estoque_purchases_select on public.estoque_purchases
  for select to authenticated
  using (public.can_access_company(company_id));
create policy estoque_purchases_insert on public.estoque_purchases
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy estoque_purchases_update on public.estoque_purchases
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor','operator']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));
create policy estoque_purchases_delete on public.estoque_purchases
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy tech_sheets_select on public.tech_sheets
  for select to authenticated
  using (public.can_access_company(company_id));
create policy tech_sheets_insert on public.tech_sheets
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy tech_sheets_update on public.tech_sheets
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy tech_sheets_delete on public.tech_sheets
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

create policy tech_sheet_revisions_select on public.tech_sheet_revisions
  for select to authenticated
  using (public.can_access_company(company_id));
create policy tech_sheet_revisions_insert on public.tech_sheet_revisions
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy tech_sheet_revisions_update on public.tech_sheet_revisions
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));
create policy tech_sheet_revisions_delete on public.tech_sheet_revisions
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));
