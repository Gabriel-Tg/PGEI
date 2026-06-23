-- 10_machine_runtime_cavities.sql
-- Cavidades abertas no momento por maquina, sem alterar o cadastro tecnico do item.

begin;

alter table public.machines
  add column if not exists cavities integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'machines_cavities_positive'
      and conrelid = 'public.machines'::regclass
  ) then
    alter table public.machines
      add constraint machines_cavities_positive
      check (cavities is null or cavities > 0);
  end if;
end $$;

create or replace function public.set_machine_cavities(
  p_company_id uuid,
  p_machine_code text,
  p_cavities integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_machine_code text := upper(trim(coalesce(p_machine_code, '')));
begin
  if p_company_id is null then
    raise exception 'Empresa nao informada.';
  end if;

  if v_machine_code = '' then
    raise exception 'Maquina nao informada.';
  end if;

  if coalesce(p_cavities, 0) <= 0 then
    raise exception 'Cavidades deve ser maior que zero.';
  end if;

  if not public.can_access_company(p_company_id) then
    raise exception 'Usuario sem acesso a empresa.';
  end if;

  update public.machines
     set cavities = p_cavities,
         updated_at = now()
   where company_id = p_company_id
     and upper(machine_code) = v_machine_code
     and active = true;

  if not found then
    raise exception 'Maquina nao encontrada.';
  end if;
end;
$$;

grant execute on function public.set_machine_cavities(uuid, text, integer) to authenticated;

commit;
