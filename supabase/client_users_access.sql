-- Controle de acesso por cliente (multi-tenant)

create extension if not exists pgcrypto;

create table if not exists public.client_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'operator',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_users_role_chk check (role in ('admin','manager','operator'))
);

create unique index if not exists ux_client_users_client_email on public.client_users (client_id, lower(email));
create index if not exists idx_client_users_email on public.client_users (lower(email));

create or replace function public.set_client_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_client_users_updated_at on public.client_users;
create trigger trg_client_users_updated_at
before update on public.client_users
for each row execute procedure public.set_client_users_updated_at();
