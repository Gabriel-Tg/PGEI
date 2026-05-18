-- RLS multi-tenant por client_id
-- Objetivo: impedir que usuário autenticado acesse dados de outro cliente.
--
-- Como aplicar:
-- 1) Execute este script no SQL Editor do Supabase.
-- 2) Teste com um usuário de cliente A tentando ler dados de cliente B.
--
-- Observação:
-- - Este script protege tabelas com coluna client_id usadas no app.
-- - O bypass de admin é por e-mail em JWT (mesmos e-mails de ADMIN_EMAILS no frontend).

begin;

create extension if not exists pgcrypto;

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
as $$
  select public.current_user_email() in (
    'gabrielalvesdesiqueira683@gmail.com',
    'hadjnovan@gmail.com'
  )
$$;

create or replace function public.can_access_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.clients c
      where c.id = target_client_id
        and c.is_demo = true
        and c.active = true
    )
    or exists (
      select 1
      from public.client_users cu
      where cu.client_id = target_client_id
        and cu.active = true
        and lower(cu.email) = public.current_user_email()
    )
$$;

revoke all on function public.can_access_client(uuid) from public;
grant execute on function public.can_access_client(uuid) to authenticated;

-- Aplica RLS nas tabelas multi-tenant por client_id
do $$
declare
  tbl text;
  target_tables text[] := array[
    'orders',
    'production_scans',
    'scrap_logs',
    'machine_stops',
    'injection_production_entries',
    'shift_responsibles',
    'low_efficiency_logs',
    'machine_priorities',
    'items',
    'item',
    'item_structures',
    'estoque_purchases',
    'tech_sheets',
    'tech_sheet_revisions'
  ];
begin
  foreach tbl in array target_tables loop
    if to_regclass(format('public.%s', tbl)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists %I on public.%I', 'tenant_select', tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_access_client(client_id))',
      'tenant_select', tbl
    );

    execute format('drop policy if exists %I on public.%I', 'tenant_insert', tbl);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_access_client(client_id))',
      'tenant_insert', tbl
    );

    execute format('drop policy if exists %I on public.%I', 'tenant_update', tbl);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_access_client(client_id)) with check (public.can_access_client(client_id))',
      'tenant_update', tbl
    );

    execute format('drop policy if exists %I on public.%I', 'tenant_delete', tbl);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_access_client(client_id))',
      'tenant_delete', tbl
    );
  end loop;
end $$;

commit;
