-- Multi-tenant migration (progressiva e compatível)
-- Projeto: quadro-producao-react
-- Data: 2026-03-10
--
-- Estratégia:
-- 1) Criar tabelas mestres clients/machines
-- 2) Adicionar colunas client_id/machine_id sem quebrar fluxo atual
-- 3) Backfill de dados legados para client DEMO
-- 4) Adicionar FKs/índices
-- 5) Só no final aplicar NOT NULL (fase final)
--
-- Observação importante:
-- - O frontend atual usa upsert em tablet_status com onConflict: 'machine_id'.
-- - Para multi-tenant completo, a fase 2 do app deve usar onConflict: 'client_id,machine_id'.

begin;

create extension if not exists pgcrypto;

-- =====================================================
-- ETAPA A: Tabelas novas (clients / machines)
-- =====================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  subdomain text not null,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_slug_format_chk check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint clients_subdomain_format_chk check (subdomain ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index if not exists ux_clients_slug on public.clients (lower(slug));
create unique index if not exists ux_clients_subdomain on public.clients (lower(subdomain));

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  machine_code text not null,
  machine_name text,
  route_slug text,
  sector text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_machines_client_code on public.machines (client_id, machine_code);
create unique index if not exists ux_machines_client_route on public.machines (client_id, route_slug);
create index if not exists idx_machines_client_active on public.machines (client_id, active);

alter table public.machines
  drop constraint if exists fk_machines_client;
alter table public.machines
  add constraint fk_machines_client
  foreign key (client_id) references public.clients(id);

-- updated_at trigger reutilizável
create or replace function public.set_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
before update on public.clients
for each row execute procedure public.set_updated_at_column();

drop trigger if exists trg_machines_updated_at on public.machines;
create trigger trg_machines_updated_at
before update on public.machines
for each row execute procedure public.set_updated_at_column();

-- =====================================================
-- ETAPA B: Seed DEMO obrigatório (idempotente)
-- =====================================================
insert into public.clients (name, slug, subdomain, active, is_demo)
values ('DEMO', 'demo', 'demo', true, true)
on conflict do nothing;

-- Garante existência mesmo se houver conflito por slug/subdomain em caixa diferente
with existing as (
  select id
  from public.clients
  where lower(slug) = 'demo'
     or lower(subdomain) = 'demo'
  order by is_demo desc, created_at asc
  limit 1
)
update public.clients c
set name = 'DEMO',
    slug = 'demo',
    subdomain = 'demo',
    is_demo = true,
    active = true
where c.id in (select id from existing);

-- =====================================================
-- ETAPA C: Add colunas (não destrutivo)
-- =====================================================
alter table if exists public.orders add column if not exists client_id uuid;
alter table if exists public.production_scans add column if not exists client_id uuid;
alter table if exists public.scrap_logs add column if not exists client_id uuid;
alter table if exists public.machine_stops add column if not exists client_id uuid;
alter table if exists public.injection_production_entries add column if not exists client_id uuid;
alter table if exists public.shift_responsibles add column if not exists client_id uuid;
alter table if exists public.tablet_status add column if not exists client_id uuid;
alter table if exists public.low_efficiency_logs add column if not exists client_id uuid;
alter table if exists public.machine_priorities add column if not exists client_id uuid;
alter table if exists public.tech_sheets add column if not exists client_id uuid;
alter table if exists public.tech_sheet_revisions add column if not exists client_id uuid;
alter table if exists public.item_structures add column if not exists client_id uuid;
alter table if exists public.estoque_purchases add column if not exists client_id uuid;
alter table if exists public.items add column if not exists client_id uuid;
alter table if exists public.item add column if not exists client_id uuid;

-- machine_id onde necessário
alter table if exists public.production_scans add column if not exists machine_id text;
alter table if exists public.scrap_logs add column if not exists machine_id text;
alter table if exists public.machine_stops add column if not exists machine_id text;
alter table if exists public.injection_production_entries add column if not exists machine_id text;
alter table if exists public.shift_responsibles add column if not exists machine_id text;
alter table if exists public.tablet_status add column if not exists machine_id text;
alter table if exists public.low_efficiency_logs add column if not exists machine_id text;
alter table if exists public.machine_priorities add column if not exists machine_id text;
alter table if exists public.orders add column if not exists machine_id text;

-- opcional para vincular revisão por máquina sem join em tech_sheets
alter table if exists public.tech_sheet_revisions add column if not exists machine_id text;

-- =====================================================
-- ETAPA D: Backfill DEMO + derivação por order_id
-- =====================================================
do $$
declare
  v_demo_client_id uuid;
begin
  select id into v_demo_client_id
  from public.clients
  where lower(slug) = 'demo' or lower(subdomain) = 'demo'
  order by is_demo desc, created_at asc
  limit 1;

  if v_demo_client_id is null then
    raise exception 'Cliente DEMO não encontrado e não foi possível criar.';
  end if;

  -- 1) Preencher dados por relação com orders quando possível
  if to_regclass('public.orders') is not null then
    if to_regclass('public.production_scans') is not null then
      update public.production_scans ps
         set client_id = coalesce(ps.client_id, o.client_id, v_demo_client_id),
             machine_id = coalesce(ps.machine_id, o.machine_id)
        from public.orders o
       where ps.order_id = o.id
         and (ps.client_id is null or ps.machine_id is null);
    end if;

    if to_regclass('public.scrap_logs') is not null then
      update public.scrap_logs sl
         set client_id = coalesce(sl.client_id, o.client_id, v_demo_client_id),
             machine_id = coalesce(sl.machine_id, o.machine_id)
        from public.orders o
       where sl.order_id = o.id
         and (sl.client_id is null or sl.machine_id is null);
    end if;

    if to_regclass('public.machine_stops') is not null then
      update public.machine_stops ms
         set client_id = coalesce(ms.client_id, o.client_id, v_demo_client_id),
             machine_id = coalesce(ms.machine_id, o.machine_id)
        from public.orders o
       where ms.order_id = o.id
         and (ms.client_id is null or ms.machine_id is null);
    end if;

    if to_regclass('public.injection_production_entries') is not null then
      update public.injection_production_entries ipe
         set client_id = coalesce(ipe.client_id, o.client_id, v_demo_client_id),
             machine_id = coalesce(ipe.machine_id, o.machine_id)
        from public.orders o
       where ipe.order_id = o.id
         and (ipe.client_id is null or ipe.machine_id is null);
    end if;

    if to_regclass('public.low_efficiency_logs') is not null then
      update public.low_efficiency_logs lel
         set client_id = coalesce(lel.client_id, o.client_id, v_demo_client_id),
             machine_id = coalesce(lel.machine_id, o.machine_id)
        from public.orders o
       where lel.order_id = o.id
         and (lel.client_id is null or lel.machine_id is null);
    end if;
  end if;

  -- 2) Fallback DEMO para client_id ausente
  if to_regclass('public.orders') is not null then
    update public.orders set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.production_scans') is not null then
    update public.production_scans set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.scrap_logs') is not null then
    update public.scrap_logs set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.machine_stops') is not null then
    update public.machine_stops set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.injection_production_entries') is not null then
    update public.injection_production_entries set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.shift_responsibles') is not null then
    update public.shift_responsibles set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.tablet_status') is not null then
    update public.tablet_status set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.low_efficiency_logs') is not null then
    update public.low_efficiency_logs set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.machine_priorities') is not null then
    update public.machine_priorities set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.tech_sheets') is not null then
    update public.tech_sheets set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.tech_sheet_revisions') is not null then
    update public.tech_sheet_revisions tsr
       set client_id = coalesce(tsr.client_id, ts.client_id, v_demo_client_id),
           machine_id = coalesce(tsr.machine_id, ts.machine_id)
      from public.tech_sheets ts
     where tsr.sheet_id = ts.id
       and (tsr.client_id is null or tsr.machine_id is null);

    update public.tech_sheet_revisions set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.item_structures') is not null then
    update public.item_structures set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.estoque_purchases') is not null then
    update public.estoque_purchases set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.items') is not null then
    update public.items set client_id = v_demo_client_id where client_id is null;
  end if;
  if to_regclass('public.item') is not null then
    update public.item set client_id = v_demo_client_id where client_id is null;
  end if;

  -- 3) Popular catálogo de máquinas do DEMO a partir de dados existentes
  insert into public.machines (client_id, machine_code, machine_name, route_slug, sector, active)
  select distinct
    v_demo_client_id,
    m.machine_code,
    m.machine_code,
    lower(m.machine_code),
    null,
    true
  from (
    select upper(machine_id) as machine_code from public.orders where machine_id is not null
    union select upper(machine_id) as machine_code from public.production_scans where machine_id is not null
    union select upper(machine_id) as machine_code from public.scrap_logs where machine_id is not null
    union select upper(machine_id) as machine_code from public.machine_stops where machine_id is not null
    union select upper(machine_id) as machine_code from public.injection_production_entries where machine_id is not null
    union select upper(machine_id) as machine_code from public.shift_responsibles where machine_id is not null
    union select upper(machine_id) as machine_code from public.tablet_status where machine_id is not null
    union select upper(machine_id) as machine_code from public.low_efficiency_logs where machine_id is not null
    union select upper(machine_id) as machine_code from public.machine_priorities where machine_id is not null
    union all select 'P1'
    union all select 'P2'
    union all select 'P3'
  ) m
  where m.machine_code is not null
  on conflict (client_id, machine_code) do nothing;

end $$;

-- =====================================================
-- ETAPA E: Índices de performance
-- =====================================================
create index if not exists idx_orders_client_machine_status on public.orders (client_id, machine_id, finalized, pos);
create index if not exists idx_orders_client_created on public.orders (client_id, created_at desc);

create index if not exists idx_scans_client_machine_created on public.production_scans (client_id, machine_id, created_at desc);
create index if not exists idx_scans_client_order on public.production_scans (client_id, order_id);

create index if not exists idx_scrap_client_machine_created on public.scrap_logs (client_id, machine_id, created_at desc);
create index if not exists idx_scrap_client_order on public.scrap_logs (client_id, order_id);

create index if not exists idx_stops_client_machine_started on public.machine_stops (client_id, machine_id, started_at desc);
create index if not exists idx_stops_client_order on public.machine_stops (client_id, order_id);

create index if not exists idx_ipe_client_machine_created on public.injection_production_entries (client_id, machine_id, created_at desc);
create index if not exists idx_ipe_client_order on public.injection_production_entries (client_id, order_id);

create index if not exists idx_shift_resp_client_machine_created on public.shift_responsibles (client_id, machine_id, created_at desc);
create index if not exists idx_loweff_client_machine_started on public.low_efficiency_logs (client_id, machine_id, started_at desc);
create index if not exists idx_loweff_client_order on public.low_efficiency_logs (client_id, order_id);

create unique index if not exists ux_machine_priorities_client_machine on public.machine_priorities (client_id, machine_id);

-- limpa duplicidade legada antes do unique (mantém o registro mais recente)
do $$
begin
  if to_regclass('public.shift_responsibles') is not null then
    with ranked as (
      select
        ctid,
        row_number() over (
          partition by client_id, machine_id, shift, effective_date
          order by created_at desc nulls last, ctid desc
        ) as rn
      from public.shift_responsibles
      where client_id is not null
        and machine_id is not null
        and shift is not null
        and effective_date is not null
    )
    delete from public.shift_responsibles s
    using ranked r
    where s.ctid = r.ctid
      and r.rn > 1;
  end if;
end $$;

create unique index if not exists ux_shift_responsibles_client_machine_shift_date on public.shift_responsibles (client_id, machine_id, shift, effective_date);

create unique index if not exists ux_item_structures_client_finished_input on public.item_structures (client_id, finished_item_code, input_item_code);
do $$
begin
  if to_regclass('public.estoque_purchases') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'estoque_purchases'
        and column_name = 'purchase_date'
    ) then
      execute 'create unique index if not exists ux_estoque_purchases_client_item_date on public.estoque_purchases (client_id, item_code, purchase_date)';
    else
      execute 'create index if not exists idx_estoque_purchases_client_item on public.estoque_purchases (client_id, item_code)';
    end if;
  end if;
end $$;

create unique index if not exists ux_tech_sheets_client_machine_item on public.tech_sheets (client_id, machine_id, item_code);
create index if not exists idx_tech_sheet_revisions_client_sheet on public.tech_sheet_revisions (client_id, sheet_id, revision desc);

create unique index if not exists ux_tablet_status_client_machine on public.tablet_status (client_id, machine_id);

-- suporta item singular e plural sem quebrar compatibilidade
do $$
declare
  rec record;
begin
  -- remove FKs legadas que dependem de unicidade global em items(code)
  if to_regclass('public.item_structures') is not null then
    alter table public.item_structures drop constraint if exists item_structures_finished_item_code_fkey;
    alter table public.item_structures drop constraint if exists item_structures_input_item_code_fkey;
  end if;

  if to_regclass('public.estoque_purchases') is not null then
    alter table public.estoque_purchases drop constraint if exists estoque_purchases_item_code_fkey;
  end if;

  if to_regclass('public.items') is not null then
    for rec in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'items'
        and c.contype = 'u'
        and array_length(c.conkey, 1) = 1
        and exists (
          select 1
          from pg_attribute a
          where a.attrelid = t.oid
            and a.attnum = c.conkey[1]
            and a.attname = 'code'
        )
    loop
      execute format('alter table public.items drop constraint if exists %I', rec.conname);
    end loop;
    execute 'create unique index if not exists ux_items_client_code on public.items (client_id, code)';
  end if;
  if to_regclass('public.item') is not null then
    for rec in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'item'
        and c.contype = 'u'
        and array_length(c.conkey, 1) = 1
        and exists (
          select 1
          from pg_attribute a
          where a.attrelid = t.oid
            and a.attnum = c.conkey[1]
            and a.attname = 'code'
        )
    loop
      execute format('alter table public.item drop constraint if exists %I', rec.conname);
    end loop;
    execute 'create unique index if not exists ux_item_client_code on public.item (client_id, code)';
  end if;
end $$;

-- =====================================================
-- ETAPA F: Foreign keys (NOT VALID para migração progressiva)
-- =====================================================

-- helper local: cria constraint se ainda não existe
create or replace function public._mt_add_fk_if_not_exists(
  p_table regclass,
  p_constraint_name text,
  p_sql text
)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conname = p_constraint_name
      and c.conrelid = p_table
  ) then
    execute p_sql;
  end if;
end;
$$;

select public._mt_add_fk_if_not_exists(
  'public.orders'::regclass,
  'fk_orders_client',
  'alter table public.orders add constraint fk_orders_client foreign key (client_id) references public.clients(id) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.orders'::regclass,
  'fk_orders_machine_by_client',
  'alter table public.orders add constraint fk_orders_machine_by_client foreign key (client_id, machine_id) references public.machines(client_id, machine_code) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.production_scans'::regclass,
  'fk_production_scans_client',
  'alter table public.production_scans add constraint fk_production_scans_client foreign key (client_id) references public.clients(id) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.production_scans'::regclass,
  'fk_production_scans_machine_by_client',
  'alter table public.production_scans add constraint fk_production_scans_machine_by_client foreign key (client_id, machine_id) references public.machines(client_id, machine_code) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.scrap_logs'::regclass,
  'fk_scrap_logs_client',
  'alter table public.scrap_logs add constraint fk_scrap_logs_client foreign key (client_id) references public.clients(id) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.scrap_logs'::regclass,
  'fk_scrap_logs_machine_by_client',
  'alter table public.scrap_logs add constraint fk_scrap_logs_machine_by_client foreign key (client_id, machine_id) references public.machines(client_id, machine_code) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.machine_stops'::regclass,
  'fk_machine_stops_client',
  'alter table public.machine_stops add constraint fk_machine_stops_client foreign key (client_id) references public.clients(id) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.machine_stops'::regclass,
  'fk_machine_stops_machine_by_client',
  'alter table public.machine_stops add constraint fk_machine_stops_machine_by_client foreign key (client_id, machine_id) references public.machines(client_id, machine_code) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.injection_production_entries'::regclass,
  'fk_ipe_client',
  'alter table public.injection_production_entries add constraint fk_ipe_client foreign key (client_id) references public.clients(id) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.injection_production_entries'::regclass,
  'fk_ipe_machine_by_client',
  'alter table public.injection_production_entries add constraint fk_ipe_machine_by_client foreign key (client_id, machine_id) references public.machines(client_id, machine_code) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.shift_responsibles'::regclass,
  'fk_shift_responsibles_client',
  'alter table public.shift_responsibles add constraint fk_shift_responsibles_client foreign key (client_id) references public.clients(id) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.shift_responsibles'::regclass,
  'fk_shift_responsibles_machine_by_client',
  'alter table public.shift_responsibles add constraint fk_shift_responsibles_machine_by_client foreign key (client_id, machine_id) references public.machines(client_id, machine_code) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.tablet_status'::regclass,
  'fk_tablet_status_client',
  'alter table public.tablet_status add constraint fk_tablet_status_client foreign key (client_id) references public.clients(id) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.tablet_status'::regclass,
  'fk_tablet_status_machine_by_client',
  'alter table public.tablet_status add constraint fk_tablet_status_machine_by_client foreign key (client_id, machine_id) references public.machines(client_id, machine_code) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.low_efficiency_logs'::regclass,
  'fk_low_efficiency_logs_client',
  'alter table public.low_efficiency_logs add constraint fk_low_efficiency_logs_client foreign key (client_id) references public.clients(id) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.low_efficiency_logs'::regclass,
  'fk_low_efficiency_logs_machine_by_client',
  'alter table public.low_efficiency_logs add constraint fk_low_efficiency_logs_machine_by_client foreign key (client_id, machine_id) references public.machines(client_id, machine_code) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.machine_priorities'::regclass,
  'fk_machine_priorities_client',
  'alter table public.machine_priorities add constraint fk_machine_priorities_client foreign key (client_id) references public.clients(id) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.machine_priorities'::regclass,
  'fk_machine_priorities_machine_by_client',
  'alter table public.machine_priorities add constraint fk_machine_priorities_machine_by_client foreign key (client_id, machine_id) references public.machines(client_id, machine_code) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.tech_sheets'::regclass,
  'fk_tech_sheets_client',
  'alter table public.tech_sheets add constraint fk_tech_sheets_client foreign key (client_id) references public.clients(id) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.tech_sheets'::regclass,
  'fk_tech_sheets_machine_by_client',
  'alter table public.tech_sheets add constraint fk_tech_sheets_machine_by_client foreign key (client_id, machine_id) references public.machines(client_id, machine_code) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.tech_sheet_revisions'::regclass,
  'fk_tech_sheet_revisions_client',
  'alter table public.tech_sheet_revisions add constraint fk_tech_sheet_revisions_client foreign key (client_id) references public.clients(id) not valid'
);

select public._mt_add_fk_if_not_exists(
  'public.item_structures'::regclass,
  'fk_item_structures_client',
  'alter table public.item_structures add constraint fk_item_structures_client foreign key (client_id) references public.clients(id) not valid'
);

do $$
begin
  if to_regclass('public.item_structures') is not null and to_regclass('public.items') is not null then
    perform public._mt_add_fk_if_not_exists(
      'public.item_structures'::regclass,
      'fk_item_structures_finished_item_by_client',
      'alter table public.item_structures add constraint fk_item_structures_finished_item_by_client foreign key (client_id, finished_item_code) references public.items(client_id, code) not valid'
    );

    perform public._mt_add_fk_if_not_exists(
      'public.item_structures'::regclass,
      'fk_item_structures_input_item_by_client',
      'alter table public.item_structures add constraint fk_item_structures_input_item_by_client foreign key (client_id, input_item_code) references public.items(client_id, code) not valid'
    );
  end if;
end $$;

select public._mt_add_fk_if_not_exists(
  'public.estoque_purchases'::regclass,
  'fk_estoque_purchases_client',
  'alter table public.estoque_purchases add constraint fk_estoque_purchases_client foreign key (client_id) references public.clients(id) not valid'
);

do $$
begin
  if to_regclass('public.estoque_purchases') is not null and to_regclass('public.items') is not null then
    perform public._mt_add_fk_if_not_exists(
      'public.estoque_purchases'::regclass,
      'fk_estoque_purchases_item_by_client',
      'alter table public.estoque_purchases add constraint fk_estoque_purchases_item_by_client foreign key (client_id, item_code) references public.items(client_id, code) not valid'
    );
  end if;
end $$;

do $$
begin
  if to_regclass('public.items') is not null then
    perform public._mt_add_fk_if_not_exists(
      'public.items'::regclass,
      'fk_items_client',
      'alter table public.items add constraint fk_items_client foreign key (client_id) references public.clients(id) not valid'
    );
  end if;

  if to_regclass('public.item') is not null then
    perform public._mt_add_fk_if_not_exists(
      'public.item'::regclass,
      'fk_item_client',
      'alter table public.item add constraint fk_item_client foreign key (client_id) references public.clients(id) not valid'
    );
  end if;
end $$;

-- =====================================================
-- ETAPA G: Validar constraints NOT VALID (quando possível)
-- =====================================================
do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where conname in (
      'fk_orders_client','fk_orders_machine_by_client',
      'fk_production_scans_client','fk_production_scans_machine_by_client',
      'fk_scrap_logs_client','fk_scrap_logs_machine_by_client',
      'fk_machine_stops_client','fk_machine_stops_machine_by_client',
      'fk_ipe_client','fk_ipe_machine_by_client',
      'fk_shift_responsibles_client','fk_shift_responsibles_machine_by_client',
      'fk_tablet_status_client','fk_tablet_status_machine_by_client',
      'fk_low_efficiency_logs_client','fk_low_efficiency_logs_machine_by_client',
      'fk_machine_priorities_client','fk_machine_priorities_machine_by_client',
      'fk_tech_sheets_client','fk_tech_sheets_machine_by_client',
      'fk_tech_sheet_revisions_client',
      'fk_item_structures_client','fk_item_structures_finished_item_by_client','fk_item_structures_input_item_by_client',
      'fk_estoque_purchases_client','fk_estoque_purchases_item_by_client',
      'fk_items_client','fk_item_client'
    )
  loop
    begin
      execute format('alter table %s validate constraint %I', r.tbl, r.conname);
    exception when others then
      raise notice 'Não foi possível validar constraint % em % agora: %', r.conname, r.tbl, sqlerrm;
    end;
  end loop;
end $$;

-- =====================================================
-- ETAPA H: Fase final NOT NULL (executar após validação dos dados)
-- =====================================================
-- Dica: se algum ALTER falhar, corrija os registros nulos e rode novamente.
alter table if exists public.orders alter column client_id set not null;
alter table if exists public.orders alter column machine_id set not null;

alter table if exists public.production_scans alter column client_id set not null;
alter table if exists public.production_scans alter column machine_id set not null;
alter table if exists public.production_scans alter column order_id set not null;

alter table if exists public.scrap_logs alter column client_id set not null;
alter table if exists public.scrap_logs alter column machine_id set not null;
alter table if exists public.scrap_logs alter column order_id set not null;

alter table if exists public.machine_stops alter column client_id set not null;
alter table if exists public.machine_stops alter column machine_id set not null;

alter table if exists public.injection_production_entries alter column client_id set not null;
alter table if exists public.injection_production_entries alter column machine_id set not null;

alter table if exists public.shift_responsibles alter column client_id set not null;
alter table if exists public.shift_responsibles alter column machine_id set not null;

alter table if exists public.tablet_status alter column client_id set not null;
alter table if exists public.tablet_status alter column machine_id set not null;

alter table if exists public.low_efficiency_logs alter column client_id set not null;
alter table if exists public.low_efficiency_logs alter column machine_id set not null;

alter table if exists public.machine_priorities alter column client_id set not null;
alter table if exists public.machine_priorities alter column machine_id set not null;

alter table if exists public.tech_sheets alter column client_id set not null;
alter table if exists public.tech_sheet_revisions alter column client_id set not null;

alter table if exists public.item_structures alter column client_id set not null;
alter table if exists public.estoque_purchases alter column client_id set not null;
alter table if exists public.items alter column client_id set not null;
alter table if exists public.item alter column client_id set not null;

commit;

-- =====================================================
-- FASE 2 (quando frontend estiver preparado)
-- =====================================================
-- 1) Atualizar frontend/tablet para upsert onConflict: 'client_id,machine_id'
-- 2) Opcionalmente remover PK legado de tablet_status(machine_id) se existir
-- 3) Recriar chave primária composta em tablet_status(client_id, machine_id)
-- Exemplo (rodar somente após update de app):
-- alter table public.tablet_status drop constraint if exists tablet_status_pkey;
-- alter table public.tablet_status add constraint tablet_status_pkey primary key (client_id, machine_id);
