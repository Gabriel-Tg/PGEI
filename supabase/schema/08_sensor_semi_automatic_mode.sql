-- 08_sensor_semi_automatic_mode.sql
-- Remove modo de operacao semi-automatico do sensor. O status passa a depender do heartbeat.

begin;

alter table public.machines
  drop constraint if exists machines_sensor_operation_mode_check,
  drop constraint if exists machines_sensor_ignore_pulse_count_check;

drop index if exists public.idx_machines_sensor_operation_mode;

alter table public.machines
  drop column if exists sensor_operation_mode,
  drop column if exists sensor_ignore_pulse_count;

commit;
