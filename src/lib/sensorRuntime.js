import { DateTime } from 'luxon'

export function parseIsoToMillis(value) {
  if (!value) return 0
  const ms = Date.parse(String(value))
  return Number.isFinite(ms) ? ms : 0
}

export function computeMachineSensorStatus(machine, nowMs = Date.now()) {
  const tipo = String(machine?.apontamento_tipo || 'manual')
  if (tipo !== 'sensor') return 'manual'

  const lastPulseMs = parseIsoToMillis(machine?.sensor_last_pulse_at)
  const lastHeartbeatMs = parseIsoToMillis(machine?.sensor_last_heartbeat_at)

  if (lastPulseMs && nowMs - lastPulseMs <= 20_000) return 'recebendo_pulsos'
  if (lastHeartbeatMs && nowMs - lastHeartbeatMs <= 45_000) return 'online'
  if (lastHeartbeatMs && nowMs - lastHeartbeatMs <= 180_000) return 'sem_comunicacao'
  return 'offline'
}

export function sensorStatusLabel(status) {
  if (status === 'recebendo_pulsos') return 'Recebendo pulsos'
  if (status === 'online') return 'Online'
  if (status === 'sem_comunicacao') return 'Sem comunicacao'
  if (status === 'offline') return 'Offline'
  return 'Manual/Bipagem'
}

export function formatDateTimeBr(value) {
  if (!value) return '-'
  const dt = DateTime.fromISO(String(value)).setZone('America/Sao_Paulo')
  if (!dt.isValid) return '-'
  return dt.toFormat('dd/LL HH:mm:ss')
}
