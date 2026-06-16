import { DateTime } from 'luxon'

export function parseIsoToMillis(value) {
  if (!value) return 0
  const ms = Date.parse(String(value))
  return Number.isFinite(ms) ? ms : 0
}

export function latestIsoTimestamp(...values) {
  let latest = null
  let latestMs = 0
  values.forEach((value) => {
    const ms = parseIsoToMillis(value)
    if (ms > latestMs) {
      latestMs = ms
      latest = value
    }
  })
  return latest
}

export function getRunningCycleSeconds(lastPulseAt, nowMs = Date.now()) {
  const lastPulseMs = parseIsoToMillis(lastPulseAt)
  if (!lastPulseMs) return null
  return Math.max(0, Math.floor((nowMs - lastPulseMs) / 1000))
}

export function formatRunningCycleSeconds(seconds) {
  const total = Number(seconds)
  if (!Number.isFinite(total) || total < 0) return '—'
  return `${total}s`
}

export function runningCycleTone(seconds, configuredCycleSeconds) {
  const elapsed = Number(seconds)
  const configured = Number(configuredCycleSeconds)
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'idle'
  if (Number.isFinite(configured) && configured > 0 && elapsed > configured) return 'over'
  return 'ok'
}

export function computeMachineSensorStatus(machine, nowMs = Date.now()) {
  const tipo = String(machine?.apontamento_tipo || 'manual')
  if (tipo !== 'sensor') return 'manual'

  const lastHeartbeatMs = parseIsoToMillis(machine?.sensor_last_heartbeat_at)

  if (lastHeartbeatMs && nowMs - lastHeartbeatMs <= 45_000) {
    return machine?.sensor_auto_stopped ? 'parada' : 'online'
  }
  return 'offline'
}

export function sensorStatusLabel(status) {
  if (status === 'parada') return 'Parada'
  if (status === 'online') return 'Online'
  if (status === 'offline') return 'Offline'
  return 'Manual/Bipagem'
}

export function formatDateTimeBr(value) {
  if (!value) return '-'
  const dt = DateTime.fromISO(String(value)).setZone('America/Sao_Paulo')
  if (!dt.isValid) return '-'
  return dt.toFormat('dd/LL HH:mm:ss')
}
