-- 06_sensor_auto_pointing_hardening.sql
-- Consolidacao segura do apontamento por sensor ESP32.
-- Mantem manual e bipagem intactos.

begin;

-- 1) Garantir coluna de cavidades para calculo de producao por ciclo
alter table public.items
  add column if not exists cavities integer;

-- 2) Garantir configuracao de tipo de apontamento por maquina
alter table public.machines
  add column if not exists apontamento_tipo text not null default 'manual',
  add column if not exists esp32_id text,
  add column if not exists sensor_token_hash text,
  add column if not exists sensor_token_last4 text,
  add column if not exists sensor_last_pulse_at timestamptz,
  add column if not exists sensor_last_heartbeat_at timestamptz,
  add column if not exists sensor_status text;

alter table public.machines
  drop constraint if exists machines_apontamento_tipo_check;
alter table public.machines
  add constraint machines_apontamento_tipo_check
  check (apontamento_tipo in ('manual', 'bipagem', 'sensor'));

alter table public.machines
  drop constraint if exists machines_sensor_status_check;
alter table public.machines
  add constraint machines_sensor_status_check
  check (
    sensor_status is null
    or sensor_status in ('online', 'offline', 'recebendo_pulsos', 'sem_comunicacao')
  );

create index if not exists idx_machines_company_apontamento
  on public.machines (company_id, apontamento_tipo);

create unique index if not exists ux_machines_company_esp32
  on public.machines (company_id, esp32_id)
  where esp32_id is not null;

-- 3) Entradas de producao com origem (manual/sensor)
alter table public.injection_production_entries
  add column if not exists source text not null default 'manual',
  add column if not exists pulse_count integer,
  add column if not exists cavities_used integer,
  add column if not exists sensor_event_id uuid;

alter table public.injection_production_entries
  drop constraint if exists injection_entries_source_check;
alter table public.injection_production_entries
  add constraint injection_entries_source_check
  check (source in ('manual', 'sensor'));

create index if not exists idx_injection_entries_company_source
  on public.injection_production_entries (company_id, source, created_at desc);

-- 4) Eventos de pulso bruto
create table if not exists public.machine_sensor_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  machine_id text not null,
  order_id uuid null references public.orders(id) on delete set null,
  pulse_count integer not null default 1,
  cavities_used integer not null default 1,
  produced_quantity integer not null default 0,
  created_at timestamptz not null default now(),
  esp32_id text,
  source_ip text,
  created_by text,
  event_uid text,
  is_ignored boolean not null default false,
  ignore_reason text,
  request_payload jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_sensor_events_company_machine_created
  on public.machine_sensor_events (company_id, machine_id, created_at desc);

create index if not exists idx_sensor_events_company_order_created
  on public.machine_sensor_events (company_id, order_id, created_at desc);

create unique index if not exists ux_sensor_events_company_machine_uid
  on public.machine_sensor_events (company_id, machine_id, event_uid)
  where event_uid is not null;

-- 5) Heartbeat do ESP32
create table if not exists public.machine_sensor_heartbeats (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  machine_id text not null,
  esp32_id text,
  status text,
  wifi_ssid text,
  ip text,
  uptime_seconds bigint,
  signal_rssi integer,
  source_ip text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sensor_heartbeat_company_machine_created
  on public.machine_sensor_heartbeats (company_id, machine_id, created_at desc);

create index if not exists idx_sensor_heartbeat_company_esp32_created
  on public.machine_sensor_heartbeats (company_id, esp32_id, created_at desc);

-- 6) Triggers idempotentes de auditoria

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_sensor_events_updated_at'
      and tgrelid = 'public.machine_sensor_events'::regclass
  ) then
    create trigger trg_sensor_events_updated_at
    before update on public.machine_sensor_events
    for each row execute procedure public.set_updated_at_column();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_sensor_events_sync_client_id'
      and tgrelid = 'public.machine_sensor_events'::regclass
  ) then
    create trigger trg_sensor_events_sync_client_id
    before insert or update on public.machine_sensor_events
    for each row execute procedure public.sync_company_to_client_id();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_sensor_heartbeats_updated_at'
      and tgrelid = 'public.machine_sensor_heartbeats'::regclass
  ) then
    create trigger trg_sensor_heartbeats_updated_at
    before update on public.machine_sensor_heartbeats
    for each row execute procedure public.set_updated_at_column();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_sensor_heartbeats_sync_client_id'
      and tgrelid = 'public.machine_sensor_heartbeats'::regclass
  ) then
    create trigger trg_sensor_heartbeats_sync_client_id
    before insert or update on public.machine_sensor_heartbeats
    for each row execute procedure public.sync_company_to_client_id();
  end if;
end $$;

-- 7) RLS (multiempresa)
alter table public.machine_sensor_events enable row level security;
alter table public.machine_sensor_heartbeats enable row level security;

drop policy if exists machine_sensor_events_select on public.machine_sensor_events;
create policy machine_sensor_events_select on public.machine_sensor_events
  for select to authenticated
  using (public.can_access_company(company_id));

drop policy if exists machine_sensor_events_insert on public.machine_sensor_events;
create policy machine_sensor_events_insert on public.machine_sensor_events
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));

drop policy if exists machine_sensor_events_update on public.machine_sensor_events;
create policy machine_sensor_events_update on public.machine_sensor_events
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));

drop policy if exists machine_sensor_events_delete on public.machine_sensor_events;
create policy machine_sensor_events_delete on public.machine_sensor_events
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

drop policy if exists machine_sensor_heartbeats_select on public.machine_sensor_heartbeats;
create policy machine_sensor_heartbeats_select on public.machine_sensor_heartbeats
  for select to authenticated
  using (public.can_access_company(company_id));

drop policy if exists machine_sensor_heartbeats_insert on public.machine_sensor_heartbeats;
create policy machine_sensor_heartbeats_insert on public.machine_sensor_heartbeats
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));

drop policy if exists machine_sensor_heartbeats_update on public.machine_sensor_heartbeats;
create policy machine_sensor_heartbeats_update on public.machine_sensor_heartbeats
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));

drop policy if exists machine_sensor_heartbeats_delete on public.machine_sensor_heartbeats;
create policy machine_sensor_heartbeats_delete on public.machine_sensor_heartbeats
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

-- 8) Realtime idempotente

do $$
declare
  target_tables text[] := array[
    'machines',
    'orders',
    'injection_production_entries',
    'machine_sensor_events',
    'machine_sensor_heartbeats'
  ];
  tbl text;
begin
  foreach tbl in array target_tables loop
    if exists (
      select 1
      from pg_publication p
      join pg_publication_rel pr on pr.prpubid = p.oid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      where p.pubname = 'supabase_realtime'
        and n.nspname = 'public'
        and c.relname = tbl
    ) then
      continue;
    end if;

    execute format('alter publication supabase_realtime add table public.%I', tbl);
  end loop;
end $$;

commit;
