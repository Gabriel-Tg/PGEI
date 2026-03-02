-- Monitoramento de tablets por máquina (1 tablet ativo por máquina)

create table if not exists public.tablet_status (
  machine_id text primary key,
  device_id text not null,
  route_path text,
  last_seen_at timestamptz not null default now(),
  last_beep_at timestamptz,
  operator_name text,
  battery_level integer,
  is_charging boolean,
  is_online boolean not null default true,
  app_commit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tablet_status_machine_id_check check (machine_id ~ '^P[0-9]+$'),
  constraint tablet_status_battery_range check (battery_level is null or (battery_level >= 0 and battery_level <= 100))
);

create index if not exists idx_tablet_status_last_seen_at on public.tablet_status (last_seen_at desc);
create index if not exists idx_tablet_status_updated_at on public.tablet_status (updated_at desc);

create or replace function public.set_tablet_status_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tablet_status_updated_at on public.tablet_status;
create trigger trg_tablet_status_updated_at
before update on public.tablet_status
for each row
execute procedure public.set_tablet_status_updated_at();

alter table public.tablet_status enable row level security;

-- leitura para usuários autenticados (Gestão/Admin)
drop policy if exists "tablet_status_select_authenticated" on public.tablet_status;
create policy "tablet_status_select_authenticated"
on public.tablet_status
for select
to authenticated
using (true);

-- escrita para tablets sem login (anon) e também autenticados
-- como a máquina é fixa, o upsert é feito por machine_id
-- em ambiente externo, recomenda-se proteger com API dedicada.
drop policy if exists "tablet_status_insert_anon" on public.tablet_status;
create policy "tablet_status_insert_anon"
on public.tablet_status
for insert
to anon, authenticated
with check (machine_id ~ '^P[0-9]+$');

drop policy if exists "tablet_status_update_anon" on public.tablet_status;
create policy "tablet_status_update_anon"
on public.tablet_status
for update
to anon, authenticated
using (machine_id ~ '^P[0-9]+$')
with check (machine_id ~ '^P[0-9]+$');

-- habilita realtime para a tabela (idempotente)
do $$
begin
  begin
    alter publication supabase_realtime add table public.tablet_status;
  exception
    when duplicate_object then null;
    when invalid_parameter_value then null;
  end;
end $$;
