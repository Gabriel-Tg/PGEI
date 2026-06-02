-- 08_sensor_semi_automatic_mode.sql
-- Suporte a modo de operação semi-automático do sensor e contagem de pulsos ignorados.

begin;

alter table public.machines
  add column if not exists sensor_operation_mode text not null default 'automatic',
  add column if not exists sensor_ignore_pulse_count integer not null default 0;

alter table public.machines
  drop constraint if exists machines_sensor_operation_mode_check;

alter table public.machines
  add constraint machines_sensor_operation_mode_check
  check (sensor_operation_mode in ('automatic', 'semi_automatic'));

alter table public.machines
  drop constraint if exists machines_sensor_ignore_pulse_count_check;

alter table public.machines
  add constraint machines_sensor_ignore_pulse_count_check
  check (sensor_ignore_pulse_count >= 0);

create index if not exists idx_machines_sensor_operation_mode
  on public.machines (sensor_operation_mode);

commit;
