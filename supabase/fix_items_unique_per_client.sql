-- Corrige unicidade de itens para multi-tenant
-- Permite mesmo code em clientes diferentes

begin;

-- Compatibilidade: garante coluna client_id em items/item
alter table if exists public.items add column if not exists client_id uuid;
alter table if exists public.item add column if not exists client_id uuid;

-- Remove constraints/indices únicos legados baseados só em code
-- e aplica unicidade por (client_id, code)
do $$
declare
  rec record;
begin
  if to_regclass('public.item_structures') is not null then
    alter table public.item_structures drop constraint if exists item_structures_finished_item_code_fkey;
    alter table public.item_structures drop constraint if exists item_structures_input_item_code_fkey;
  end if;

  if to_regclass('public.estoque_purchases') is not null then
    alter table public.estoque_purchases drop constraint if exists estoque_purchases_item_code_fkey;
  end if;

  if to_regclass('public.items') is not null then
    -- constraints unique com apenas coluna code
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

    -- indices únicos com apenas coluna code
    for rec in
      select idx.relname as index_name
      from pg_class idx
      join pg_index i on i.indexrelid = idx.oid
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'items'
        and i.indisunique = true
        and i.indnatts = 1
        and pg_get_indexdef(idx.oid) ilike '%(code)%'
    loop
      execute format('drop index if exists public.%I', rec.index_name);
    end loop;

    execute 'create unique index if not exists ux_items_client_code on public.items (client_id, code)';

    if to_regclass('public.item_structures') is not null then
      alter table public.item_structures drop constraint if exists fk_item_structures_finished_item_by_client;
      alter table public.item_structures drop constraint if exists fk_item_structures_input_item_by_client;

      alter table public.item_structures
        add constraint fk_item_structures_finished_item_by_client
        foreign key (client_id, finished_item_code)
        references public.items(client_id, code)
        not valid;

      alter table public.item_structures
        add constraint fk_item_structures_input_item_by_client
        foreign key (client_id, input_item_code)
        references public.items(client_id, code)
        not valid;
    end if;

    if to_regclass('public.estoque_purchases') is not null then
      alter table public.estoque_purchases drop constraint if exists fk_estoque_purchases_item_by_client;

      alter table public.estoque_purchases
        add constraint fk_estoque_purchases_item_by_client
        foreign key (client_id, item_code)
        references public.items(client_id, code)
        not valid;
    end if;
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

    for rec in
      select idx.relname as index_name
      from pg_class idx
      join pg_index i on i.indexrelid = idx.oid
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'item'
        and i.indisunique = true
        and i.indnatts = 1
        and pg_get_indexdef(idx.oid) ilike '%(code)%'
    loop
      execute format('drop index if exists public.%I', rec.index_name);
    end loop;

    execute 'create unique index if not exists ux_item_client_code on public.item (client_id, code)';
  end if;
end $$;

commit;
