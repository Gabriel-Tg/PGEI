-- 01_core_tables.sql
-- Base estrutural do schema multiempresa (tabelas, indices e compatibilidade legada).

create extension if not exists pgcrypto;

-- Compatibilidade com bancos legados (antes de qualquer referencia a company_id)
do $$
declare
  tbl text;
  target_tables text[] := array[
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

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = tbl
        and column_name = 'company_id'
    ) then
      execute format('alter table public.%I add column company_id uuid', tbl);
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = tbl
        and column_name = 'client_id'
    ) then
      execute format('update public.%I set company_id = client_id where company_id is null and client_id is not null', tbl);
    end if;
  end loop;
end $$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  subdomain text not null,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_slug_format_chk check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint companies_subdomain_format_chk check (subdomain ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
create unique index if not exists ux_companies_slug on public.companies (lower(slug));
create unique index if not exists ux_companies_subdomain on public.companies (lower(subdomain));
create index if not exists idx_companies_active on public.companies (active);

create table if not exists public.company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  email text not null,
  username text,
  full_name text,
  role text not null default 'operator',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_users_role_chk check (role in ('admin','manager','supervisor','operator','tv','gestao','pcp','fabrica'))
);
alter table public.company_users add column if not exists username text;
update public.company_users
set username = split_part(lower(email), '@', 1)
where username is null
  and email is not null
  and position('@' in email) > 0;
create unique index if not exists ux_company_users_company_email on public.company_users (company_id, lower(email));
create unique index if not exists ux_company_users_company_username on public.company_users (company_id, lower(username)) where username is not null;
create index if not exists idx_company_users_email on public.company_users (lower(email));
create index if not exists idx_company_users_username on public.company_users (lower(username));
create index if not exists idx_company_users_company on public.company_users (company_id);

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  machine_code text not null,
  machine_name text,
  route_slug text,
  sector text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_machines_company_code on public.machines (company_id, machine_code);
create unique index if not exists ux_machines_company_route on public.machines (company_id, route_slug);
create index if not exists idx_machines_company_active on public.machines (company_id, active);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  machine_id text not null,
  code text not null,
  customer text,
  product text,
  color text,
  qty integer,
  boxes integer,
  standard text,
  due_date date,
  notes text,
  status text not null default 'AGUARDANDO',
  pos integer,
  finalized boolean not null default false,
  finalized_at timestamptz,
  finalized_by text,
  started_at timestamptz,
  started_by text,
  restarted_at timestamptz,
  restarted_by text,
  interrupted_at timestamptz,
  interrupted_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_orders_company_machine on public.orders (company_id, machine_id);
create index if not exists idx_orders_company_status on public.orders (company_id, status);
create index if not exists idx_orders_company_pos on public.orders (company_id, pos);

create table if not exists public.production_scans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  order_id uuid not null references public.orders(id) on delete cascade,
  machine_id text not null,
  scanned_box integer not null,
  qty_pieces integer not null default 0,
  shift text,
  op_code text,
  code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_production_scans_company_order on public.production_scans (company_id, order_id);
create index if not exists idx_production_scans_company_machine on public.production_scans (company_id, machine_id);

create table if not exists public.machine_stops (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  order_id uuid not null references public.orders(id) on delete cascade,
  machine_id text not null,
  started_at timestamptz not null,
  started_by text,
  resumed_at timestamptz,
  resumed_by text,
  reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_machine_stops_company_order on public.machine_stops (company_id, order_id);
create index if not exists idx_machine_stops_company_machine on public.machine_stops (company_id, machine_id);

create table if not exists public.scrap_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  order_id uuid not null references public.orders(id) on delete cascade,
  machine_id text not null,
  qty integer not null,
  reason text,
  operator text,
  shift text,
  op_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_scrap_logs_company_order on public.scrap_logs (company_id, order_id);
create index if not exists idx_scrap_logs_company_machine on public.scrap_logs (company_id, machine_id);

create table if not exists public.low_efficiency_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  order_id uuid not null references public.orders(id) on delete cascade,
  machine_id text not null,
  operator text,
  reason text,
  notes text,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_low_efficiency_logs_company_order on public.low_efficiency_logs (company_id, order_id);
create index if not exists idx_low_efficiency_logs_company_machine on public.low_efficiency_logs (company_id, machine_id);

create table if not exists public.injection_production_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  order_id uuid not null references public.orders(id) on delete cascade,
  machine_id text not null,
  good_qty integer not null,
  product text,
  shift text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_injection_entries_company_order on public.injection_production_entries (company_id, order_id);

create table if not exists public.tablet_status (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  machine_id text not null,
  device_id text,
  route_path text,
  operator_name text,
  battery_level integer,
  is_charging boolean,
  is_online boolean,
  last_seen_at timestamptz,
  last_beep_at timestamptz,
  app_commit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_tablet_status_company_machine on public.tablet_status (company_id, machine_id);

create table if not exists public.machine_priorities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  machine_id text not null,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_machine_priorities_company_machine on public.machine_priorities (company_id, machine_id);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  code text not null,
  item_type text not null default 'produto_acabado',
  description text,
  color text,
  cycle_seconds numeric,
  cavities integer,
  padrao numeric,
  embalagem text,
  part_weight_g numeric,
  unit_value numeric,
  resin text,
  unidade text,
  cliente text,
  estoque_minimo numeric,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_items_company_code on public.items (company_id, code);

create table if not exists public.item_structures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  finished_item_code text not null,
  input_item_code text not null,
  quantity_per_piece numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_item_structures_company_finished_code on public.item_structures (company_id, finished_item_code);
create index if not exists idx_item_structures_company_input_code on public.item_structures (company_id, input_item_code);

create table if not exists public.estoque_purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  date date not null,
  invoice_number text not null,
  item_code text not null,
  product text not null,
  client text not null,
  quantity numeric not null,
  unit_value numeric not null,
  balance numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_estoque_purchases_company_item on public.estoque_purchases (company_id, item_code);

create table if not exists public.estoque_requisitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  item_code text not null,
  op text not null,
  client text,
  quantity numeric not null,
  allocations jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_estoque_requisitions_company_item on public.estoque_requisitions (company_id, item_code);

create table if not exists public.estoque_returns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  op text not null,
  item_code text not null,
  item_description text,
  quantity numeric not null,
  allocations jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_estoque_returns_company_item on public.estoque_returns (company_id, item_code);

create table if not exists public.estoque_finished_outputs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  date date not null,
  invoice_number text,
  access_key text,
  item_code text,
  product text,
  client text,
  quantity numeric not null,
  unit text,
  unit_value numeric,
  total_value numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_estoque_finished_outputs_company_item on public.estoque_finished_outputs (company_id, item_code);

create table if not exists public.shift_responsibles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  machine_id text not null,
  shift text not null,
  operator text,
  responsible text,
  responsavel text,
  effective_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_shift_responsibles_company_machine on public.shift_responsibles (company_id, machine_id);

create table if not exists public.order_machine_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  order_id uuid references public.orders(id) on delete set null,
  machine_id text,
  started_at timestamptz not null,
  ended_at timestamptz,
  started_by text,
  ended_by text,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_order_machine_sessions_company_order on public.order_machine_sessions (company_id, order_id);

create table if not exists public.tech_sheets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tech_sheet_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  sheet_id uuid not null references public.tech_sheets(id) on delete cascade,
  machine_id text,
  revision_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tech_sheet_revisions_company_sheet on public.tech_sheet_revisions (company_id, sheet_id);
