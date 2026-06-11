-- 07_cycle_intelligence.sql
-- Monitoramento inteligente de ciclo em tempo real via ESP32.

begin;

-- 1) Campos de ciclo por item
alter table public.items
  add column if not exists cycle_seconds numeric;

alter table public.machines
  add column if not exists sensor_last_cycle_seconds numeric,
  add column if not exists sensor_avg_cycle_seconds numeric,
  add column if not exists sensor_cycle_count bigint not null default 0,
  add column if not exists sensor_auto_stopped boolean not null default false,
  add column if not exists sensor_auto_stop_at timestamptz,
  add column if not exists ciclo_cadastrado_seconds integer;

-- 2) Histórico de ciclo
create table if not exists public.machine_cycle_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  machine_id text not null,
  order_id uuid null references public.orders(id) on delete set null,
  sensor_event_id uuid null references public.machine_sensor_events(id) on delete set null,
  pulse_timestamp timestamptz not null,
  cycle_seconds numeric not null,
  cycle_avg_seconds numeric,
  ciclo_cadastrado_seconds integer,
  machine_status text,
  esp32_id text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cycle_history_company_machine_ts
  on public.machine_cycle_history (company_id, machine_id, pulse_timestamp desc);

create index if not exists idx_cycle_history_company_order_ts
  on public.machine_cycle_history (company_id, order_id, pulse_timestamp desc);

-- 3) Triggers idempotentes

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_machine_cycle_history_updated_at'
      and tgrelid = 'public.machine_cycle_history'::regclass
  ) then
    create trigger trg_machine_cycle_history_updated_at
    before update on public.machine_cycle_history
    for each row execute procedure public.set_updated_at_column();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_machine_cycle_history_sync_client_id'
      and tgrelid = 'public.machine_cycle_history'::regclass
  ) then
    create trigger trg_machine_cycle_history_sync_client_id
    before insert or update on public.machine_cycle_history
    for each row execute procedure public.sync_company_to_client_id();
  end if;
end $$;

-- 4) RLS
alter table public.machine_cycle_history enable row level security;

drop policy if exists machine_cycle_history_select on public.machine_cycle_history;
create policy machine_cycle_history_select on public.machine_cycle_history
  for select to authenticated
  using (public.can_access_company(company_id));

drop policy if exists machine_cycle_history_insert on public.machine_cycle_history;
create policy machine_cycle_history_insert on public.machine_cycle_history
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));

drop policy if exists machine_cycle_history_update on public.machine_cycle_history;
create policy machine_cycle_history_update on public.machine_cycle_history
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));

drop policy if exists machine_cycle_history_delete on public.machine_cycle_history;
create policy machine_cycle_history_delete on public.machine_cycle_history
  for delete to authenticated
  using (public.user_has_company_role(company_id, array['admin']));

-- 5) Realtime idempotente

do $$
begin
  if not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'machine_cycle_history'
  ) then
    alter publication supabase_realtime add table public.machine_cycle_history;
  end if;
end $$;

commit;
