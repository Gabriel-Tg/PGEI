-- 09_sensor_order_cycle_aggregation.sql
-- Agrega apontamentos do sensor por O.P. sem perder os horarios/ciclos individuais.

begin;

alter table public.injection_production_entries
  add column if not exists sensor_last_delta_qty integer not null default 0,
  add column if not exists sensor_last_delta_pulse_count integer not null default 0,
  add column if not exists sensor_last_pulse_at timestamptz;

create index if not exists idx_injection_entries_sensor_order_machine
  on public.injection_production_entries (company_id, order_id, machine_id)
  where source = 'sensor';

create table if not exists public.machine_sensor_order_cycles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid null,
  order_id uuid not null references public.orders(id) on delete cascade,
  machine_id text not null,
  product text,
  first_pulse_at timestamptz not null,
  last_pulse_at timestamptz not null,
  pulse_count bigint not null default 0,
  produced_quantity bigint not null default 0,
  cavities_used integer not null default 1,
  cycle_count bigint not null default 0,
  cycle_timestamps jsonb not null default '[]'::jsonb,
  cycle_seconds jsonb not null default '[]'::jsonb,
  last_cycle_seconds numeric,
  cycle_avg_seconds numeric,
  ciclo_cadastrado_seconds integer,
  esp32_id text,
  last_event_uid text,
  event_uids jsonb not null default '[]'::jsonb,
  last_request_payload jsonb,
  shift text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, order_id, machine_id)
);

create index if not exists idx_sensor_order_cycles_company_machine_last
  on public.machine_sensor_order_cycles (company_id, machine_id, last_pulse_at desc);

create index if not exists idx_sensor_order_cycles_company_order
  on public.machine_sensor_order_cycles (company_id, order_id);

create index if not exists idx_sensor_order_cycles_event_uids
  on public.machine_sensor_order_cycles using gin (event_uids);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_sensor_order_cycles_updated_at'
      and tgrelid = 'public.machine_sensor_order_cycles'::regclass
  ) then
    create trigger trg_sensor_order_cycles_updated_at
    before update on public.machine_sensor_order_cycles
    for each row execute procedure public.set_updated_at_column();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_sensor_order_cycles_sync_client_id'
      and tgrelid = 'public.machine_sensor_order_cycles'::regclass
  ) then
    create trigger trg_sensor_order_cycles_sync_client_id
    before insert or update on public.machine_sensor_order_cycles
    for each row execute procedure public.sync_company_to_client_id();
  end if;
end $$;

create or replace function public.record_sensor_order_cycle(
  p_company_id uuid,
  p_order_id uuid,
  p_machine_id text,
  p_product text,
  p_pulse_count integer,
  p_cavities_used integer,
  p_produced_quantity integer,
  p_pulse_timestamp timestamptz,
  p_cycle_seconds numeric,
  p_cycle_avg_seconds numeric,
  p_ciclo_cadastrado_seconds integer,
  p_esp32_id text,
  p_event_uid text,
  p_request_payload jsonb,
  p_shift text
)
returns table (
  aggregate_id uuid,
  duplicate boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.machine_sensor_order_cycles%rowtype;
  v_event_uid text := nullif(btrim(coalesce(p_event_uid, '')), '');
  v_cycle_timestamps jsonb := case when p_cycle_seconds is not null then jsonb_build_array(p_pulse_timestamp) else '[]'::jsonb end;
  v_cycle_seconds jsonb := case when p_cycle_seconds is not null then jsonb_build_array(p_cycle_seconds) else '[]'::jsonb end;
  v_entry_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_company_id::text || ':' || p_order_id::text || ':' || upper(coalesce(p_machine_id, ''))));

  select *
    into v_existing
  from public.machine_sensor_order_cycles
  where company_id = p_company_id
    and order_id = p_order_id
    and machine_id = upper(coalesce(p_machine_id, ''))
  for update;

  if found and v_event_uid is not null and coalesce(v_existing.event_uids, '[]'::jsonb) ? v_event_uid then
    aggregate_id := v_existing.id;
    duplicate := true;
    created_at := v_existing.created_at;
    updated_at := v_existing.updated_at;
    return next;
    return;
  end if;

  if found then
    update public.machine_sensor_order_cycles
      set product = coalesce(p_product, product),
          last_pulse_at = p_pulse_timestamp,
          pulse_count = pulse_count + greatest(coalesce(p_pulse_count, 0), 0),
          produced_quantity = produced_quantity + greatest(coalesce(p_produced_quantity, 0), 0),
          cavities_used = greatest(coalesce(p_cavities_used, cavities_used), 1),
          cycle_count = cycle_count + case when p_cycle_seconds is not null then 1 else 0 end,
          cycle_timestamps = coalesce(cycle_timestamps, '[]'::jsonb) || v_cycle_timestamps,
          cycle_seconds = coalesce(cycle_seconds, '[]'::jsonb) || v_cycle_seconds,
          last_cycle_seconds = coalesce(p_cycle_seconds, last_cycle_seconds),
          cycle_avg_seconds = coalesce(p_cycle_avg_seconds, cycle_avg_seconds),
          ciclo_cadastrado_seconds = coalesce(p_ciclo_cadastrado_seconds, ciclo_cadastrado_seconds),
          esp32_id = coalesce(p_esp32_id, esp32_id),
          last_event_uid = coalesce(v_event_uid, last_event_uid),
          event_uids = case
            when v_event_uid is null then coalesce(event_uids, '[]'::jsonb)
            else coalesce(event_uids, '[]'::jsonb) || jsonb_build_array(v_event_uid)
          end,
          last_request_payload = p_request_payload,
          shift = coalesce(p_shift, shift),
          created_by = 'esp32'
    where id = v_existing.id
    returning id, false, machine_sensor_order_cycles.created_at, machine_sensor_order_cycles.updated_at
      into aggregate_id, duplicate, created_at, updated_at;
  else
    insert into public.machine_sensor_order_cycles (
      company_id,
      order_id,
      machine_id,
      product,
      first_pulse_at,
      last_pulse_at,
      pulse_count,
      produced_quantity,
      cavities_used,
      cycle_count,
      cycle_timestamps,
      cycle_seconds,
      last_cycle_seconds,
      cycle_avg_seconds,
      ciclo_cadastrado_seconds,
      esp32_id,
      last_event_uid,
      event_uids,
      last_request_payload,
      shift,
      created_by
    ) values (
      p_company_id,
      p_order_id,
      upper(coalesce(p_machine_id, '')),
      p_product,
      p_pulse_timestamp,
      p_pulse_timestamp,
      greatest(coalesce(p_pulse_count, 0), 0),
      greatest(coalesce(p_produced_quantity, 0), 0),
      greatest(coalesce(p_cavities_used, 1), 1),
      case when p_cycle_seconds is not null then 1 else 0 end,
      v_cycle_timestamps,
      v_cycle_seconds,
      p_cycle_seconds,
      p_cycle_avg_seconds,
      p_ciclo_cadastrado_seconds,
      p_esp32_id,
      v_event_uid,
      case when v_event_uid is null then '[]'::jsonb else jsonb_build_array(v_event_uid) end,
      p_request_payload,
      p_shift,
      'esp32'
    )
    returning id, false, machine_sensor_order_cycles.created_at, machine_sensor_order_cycles.updated_at
      into aggregate_id, duplicate, created_at, updated_at;
  end if;

  select id
    into v_entry_id
  from public.injection_production_entries
  where company_id = p_company_id
    and order_id = p_order_id
    and machine_id = upper(coalesce(p_machine_id, ''))
    and source = 'sensor'
  for update;

  if found then
    update public.injection_production_entries
      set good_qty = good_qty + greatest(coalesce(p_produced_quantity, 0), 0),
          pulse_count = coalesce(pulse_count, 0) + greatest(coalesce(p_pulse_count, 0), 0),
          cavities_used = greatest(coalesce(p_cavities_used, cavities_used), 1),
          product = coalesce(p_product, product),
          shift = coalesce(p_shift, shift),
          sensor_event_id = null,
          sensor_last_delta_qty = greatest(coalesce(p_produced_quantity, 0), 0),
          sensor_last_delta_pulse_count = greatest(coalesce(p_pulse_count, 0), 0),
          sensor_last_pulse_at = p_pulse_timestamp
    where id = v_entry_id;
  else
    insert into public.injection_production_entries (
      company_id,
      order_id,
      machine_id,
      good_qty,
      product,
      shift,
      source,
      pulse_count,
      cavities_used,
      sensor_event_id,
      sensor_last_delta_qty,
      sensor_last_delta_pulse_count,
      sensor_last_pulse_at
    ) values (
      p_company_id,
      p_order_id,
      upper(coalesce(p_machine_id, '')),
      greatest(coalesce(p_produced_quantity, 0), 0),
      p_product,
      p_shift,
      'sensor',
      greatest(coalesce(p_pulse_count, 0), 0),
      greatest(coalesce(p_cavities_used, 1), 1),
      null,
      greatest(coalesce(p_produced_quantity, 0), 0),
      greatest(coalesce(p_pulse_count, 0), 0),
      p_pulse_timestamp
    );
  end if;

  return next;
end;
$$;

alter table public.machine_sensor_order_cycles enable row level security;

drop policy if exists machine_sensor_order_cycles_select on public.machine_sensor_order_cycles;
create policy machine_sensor_order_cycles_select on public.machine_sensor_order_cycles
  for select to authenticated
  using (public.can_access_company(company_id));

drop policy if exists machine_sensor_order_cycles_insert on public.machine_sensor_order_cycles;
create policy machine_sensor_order_cycles_insert on public.machine_sensor_order_cycles
  for insert to authenticated
  with check (public.user_has_company_role(company_id, array['admin','supervisor','operator']));

drop policy if exists machine_sensor_order_cycles_update on public.machine_sensor_order_cycles;
create policy machine_sensor_order_cycles_update on public.machine_sensor_order_cycles
  for update to authenticated
  using (public.user_has_company_role(company_id, array['admin','supervisor']))
  with check (public.user_has_company_role(company_id, array['admin','supervisor']));

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'machine_sensor_order_cycles'
  ) then
    alter publication supabase_realtime add table public.machine_sensor_order_cycles;
  end if;
end $$;

commit;