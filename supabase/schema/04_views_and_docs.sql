-- 04_views_and_docs.sql
-- Views de dominio e documentacao.

create or replace view public.production_logs
with (security_invoker = true)
as
select
  id,
  company_id,
  order_id,
  machine_id,
  created_at,
  'scan'::text as record_type,
  scanned_box::text as payload
from public.production_scans
union all
select
  id,
  company_id,
  order_id,
  machine_id,
  created_at,
  'stop'::text as record_type,
  reason::text as payload
from public.machine_stops
union all
select
  id,
  company_id,
  order_id,
  machine_id,
  created_at,
  'scrap'::text as record_type,
  qty::text as payload
from public.scrap_logs
union all
select
  id,
  company_id,
  order_id,
  machine_id,
  created_at,
  'low_efficiency'::text as record_type,
  reason::text as payload
from public.low_efficiency_logs;

create or replace view public.production_orders_runtime_v
with (security_invoker = true)
as
select
  id,
  company_id,
  client_id,
  machine_id,
  code,
  product,
  standard,
  created_at,
  boxes
from public.orders;

grant select on public.production_logs to authenticated;
grant select on public.production_orders_runtime_v to authenticated;

comment on table public.companies is 'Master table de empresas / tenants do PGEI.';
comment on table public.company_users is 'Mapeamento de usuarios autenticados para empresas e papeis.';
comment on table public.orders is 'Ordens de producao centrais; cada ordem pertence a uma company.';
comment on table public.production_scans is 'Registros de producao por caixa e maquina.';
comment on table public.machine_stops is 'Paradas de maquina associadas a ordens de producao.';
comment on table public.low_efficiency_logs is 'Eventos de baixa eficiencia por ordem e maquina.';
comment on view public.production_logs is 'Visao sintetica de eventos de producao e parada.';
