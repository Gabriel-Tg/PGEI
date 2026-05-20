-- 02_audit_and_triggers.sql
-- Funcoes de auditoria e triggers de sincronizacao company_id/client_id.

create or replace function public.set_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_company_to_client_id()
returns trigger
language plpgsql
as $$
begin
  if new.company_id is not null then
    new.client_id = new.company_id;
  elsif new.client_id is not null then
    new.company_id = new.client_id;
  end if;
  return new;
end;
$$;

do $$
begin
  execute 'drop trigger if exists trg_companies_updated_at on public.companies';
  execute 'drop trigger if exists trg_company_users_updated_at on public.company_users';
  execute 'drop trigger if exists trg_machines_updated_at on public.machines';

  execute 'drop trigger if exists trg_orders_updated_at on public.orders';
  execute 'drop trigger if exists trg_orders_sync_client_id on public.orders';

  execute 'drop trigger if exists trg_production_scans_updated_at on public.production_scans';
  execute 'drop trigger if exists trg_production_scans_sync_client_id on public.production_scans';

  execute 'drop trigger if exists trg_machine_stops_updated_at on public.machine_stops';
  execute 'drop trigger if exists trg_machine_stops_sync_client_id on public.machine_stops';

  execute 'drop trigger if exists trg_scrap_logs_updated_at on public.scrap_logs';
  execute 'drop trigger if exists trg_scrap_logs_sync_client_id on public.scrap_logs';

  execute 'drop trigger if exists trg_low_efficiency_logs_updated_at on public.low_efficiency_logs';
  execute 'drop trigger if exists trg_low_efficiency_logs_sync_client_id on public.low_efficiency_logs';

  execute 'drop trigger if exists trg_injection_entries_updated_at on public.injection_production_entries';
  execute 'drop trigger if exists trg_injection_entries_sync_client_id on public.injection_production_entries';

  execute 'drop trigger if exists trg_tablet_status_updated_at on public.tablet_status';
  execute 'drop trigger if exists trg_tablet_status_sync_client_id on public.tablet_status';

  execute 'drop trigger if exists trg_machine_priorities_updated_at on public.machine_priorities';
  execute 'drop trigger if exists trg_machine_priorities_sync_client_id on public.machine_priorities';

  execute 'drop trigger if exists trg_items_updated_at on public.items';
  execute 'drop trigger if exists trg_items_sync_client_id on public.items';

  execute 'drop trigger if exists trg_item_structures_updated_at on public.item_structures';
  execute 'drop trigger if exists trg_item_structures_sync_client_id on public.item_structures';

  execute 'drop trigger if exists trg_estoque_purchases_updated_at on public.estoque_purchases';
  execute 'drop trigger if exists trg_estoque_purchases_sync_client_id on public.estoque_purchases';

  execute 'drop trigger if exists trg_estoque_requisitions_updated_at on public.estoque_requisitions';
  execute 'drop trigger if exists trg_estoque_requisitions_sync_client_id on public.estoque_requisitions';

  execute 'drop trigger if exists trg_estoque_returns_updated_at on public.estoque_returns';
  execute 'drop trigger if exists trg_estoque_returns_sync_client_id on public.estoque_returns';

  execute 'drop trigger if exists trg_estoque_finished_outputs_updated_at on public.estoque_finished_outputs';
  execute 'drop trigger if exists trg_estoque_finished_outputs_sync_client_id on public.estoque_finished_outputs';

  execute 'drop trigger if exists trg_shift_responsibles_updated_at on public.shift_responsibles';
  execute 'drop trigger if exists trg_shift_responsibles_sync_client_id on public.shift_responsibles';

  execute 'drop trigger if exists trg_order_machine_sessions_updated_at on public.order_machine_sessions';
  execute 'drop trigger if exists trg_order_machine_sessions_sync_client_id on public.order_machine_sessions';

  execute 'drop trigger if exists trg_tech_sheets_updated_at on public.tech_sheets';
  execute 'drop trigger if exists trg_tech_sheets_sync_client_id on public.tech_sheets';

  execute 'drop trigger if exists trg_tech_sheet_revisions_updated_at on public.tech_sheet_revisions';
  execute 'drop trigger if exists trg_tech_sheet_revisions_sync_client_id on public.tech_sheet_revisions';
end $$;

create trigger trg_companies_updated_at
before update on public.companies
for each row execute procedure public.set_updated_at_column();

create trigger trg_company_users_updated_at
before update on public.company_users
for each row execute procedure public.set_updated_at_column();

create trigger trg_machines_updated_at
before update on public.machines
for each row execute procedure public.set_updated_at_column();

create trigger trg_orders_updated_at
before update on public.orders
for each row execute procedure public.set_updated_at_column();
create trigger trg_orders_sync_client_id
before insert or update on public.orders
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_production_scans_updated_at
before update on public.production_scans
for each row execute procedure public.set_updated_at_column();
create trigger trg_production_scans_sync_client_id
before insert or update on public.production_scans
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_machine_stops_updated_at
before update on public.machine_stops
for each row execute procedure public.set_updated_at_column();
create trigger trg_machine_stops_sync_client_id
before insert or update on public.machine_stops
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_scrap_logs_updated_at
before update on public.scrap_logs
for each row execute procedure public.set_updated_at_column();
create trigger trg_scrap_logs_sync_client_id
before insert or update on public.scrap_logs
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_low_efficiency_logs_updated_at
before update on public.low_efficiency_logs
for each row execute procedure public.set_updated_at_column();
create trigger trg_low_efficiency_logs_sync_client_id
before insert or update on public.low_efficiency_logs
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_injection_entries_updated_at
before update on public.injection_production_entries
for each row execute procedure public.set_updated_at_column();
create trigger trg_injection_entries_sync_client_id
before insert or update on public.injection_production_entries
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_tablet_status_updated_at
before update on public.tablet_status
for each row execute procedure public.set_updated_at_column();
create trigger trg_tablet_status_sync_client_id
before insert or update on public.tablet_status
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_machine_priorities_updated_at
before update on public.machine_priorities
for each row execute procedure public.set_updated_at_column();
create trigger trg_machine_priorities_sync_client_id
before insert or update on public.machine_priorities
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_items_updated_at
before update on public.items
for each row execute procedure public.set_updated_at_column();
create trigger trg_items_sync_client_id
before insert or update on public.items
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_item_structures_updated_at
before update on public.item_structures
for each row execute procedure public.set_updated_at_column();
create trigger trg_item_structures_sync_client_id
before insert or update on public.item_structures
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_estoque_purchases_updated_at
before update on public.estoque_purchases
for each row execute procedure public.set_updated_at_column();
create trigger trg_estoque_purchases_sync_client_id
before insert or update on public.estoque_purchases
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_estoque_requisitions_updated_at
before update on public.estoque_requisitions
for each row execute procedure public.set_updated_at_column();
create trigger trg_estoque_requisitions_sync_client_id
before insert or update on public.estoque_requisitions
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_estoque_returns_updated_at
before update on public.estoque_returns
for each row execute procedure public.set_updated_at_column();
create trigger trg_estoque_returns_sync_client_id
before insert or update on public.estoque_returns
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_estoque_finished_outputs_updated_at
before update on public.estoque_finished_outputs
for each row execute procedure public.set_updated_at_column();
create trigger trg_estoque_finished_outputs_sync_client_id
before insert or update on public.estoque_finished_outputs
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_shift_responsibles_updated_at
before update on public.shift_responsibles
for each row execute procedure public.set_updated_at_column();
create trigger trg_shift_responsibles_sync_client_id
before insert or update on public.shift_responsibles
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_order_machine_sessions_updated_at
before update on public.order_machine_sessions
for each row execute procedure public.set_updated_at_column();
create trigger trg_order_machine_sessions_sync_client_id
before insert or update on public.order_machine_sessions
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_tech_sheets_updated_at
before update on public.tech_sheets
for each row execute procedure public.set_updated_at_column();
create trigger trg_tech_sheets_sync_client_id
before insert or update on public.tech_sheets
for each row execute procedure public.sync_company_to_client_id();

create trigger trg_tech_sheet_revisions_updated_at
before update on public.tech_sheet_revisions
for each row execute procedure public.set_updated_at_column();
create trigger trg_tech_sheet_revisions_sync_client_id
before insert or update on public.tech_sheet_revisions
for each row execute procedure public.sync_company_to_client_id();
