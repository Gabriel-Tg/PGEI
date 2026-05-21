import {
  getRequestIp,
  getSupabaseAdmin,
  isMethod,
  normalizeEsp32Id,
  normalizeMachineCode,
  parseJsonBody,
  readSensorToken,
  resolveAuthorizedMachine,
  sendJson,
} from '../_lib/sensorCommon.js'

const HEARTBEAT_WINDOW_MS = 60_000
const HEARTBEAT_LIMIT_PER_WINDOW = 120
const heartbeatBuckets = new Map()

function nowIso() {
  return new Date().toISOString()
}

function computeStatus(lastPulseMs) {
  const now = Date.now()
  if (lastPulseMs && now - lastPulseMs <= 20_000) return 'recebendo_pulsos'
  return 'online'
}

function shouldMarkAutoStop(lastPulseAt, cicloCadastradoSeconds) {
  const baseCycle = Number(cicloCadastradoSeconds || 0)
  if (!(baseCycle > 0) || !lastPulseAt) return false
  const elapsedSeconds = (Date.now() - new Date(lastPulseAt).getTime()) / 1000
  return elapsedSeconds > (baseCycle * 4)
}

function canAcceptHeartbeatRate(key) {
  const now = Date.now()
  const current = heartbeatBuckets.get(key)

  if (!current || now - current.windowStart > HEARTBEAT_WINDOW_MS) {
    heartbeatBuckets.set(key, { windowStart: now, count: 1 })
    return true
  }

  if (current.count >= HEARTBEAT_LIMIT_PER_WINDOW) return false
  current.count += 1
  return true
}

export default async function handler(req, res) {
  if (!isMethod(req, 'POST')) {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const token = readSensorToken(req)
  if (!token) {
    sendJson(res, 401, { error: 'Missing sensor token' })
    return
  }

  let body
  try {
    body = await parseJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' })
    return
  }

  const machineCode = normalizeMachineCode(body.machine_id)
  const esp32Id = normalizeEsp32Id(body.esp32_id)

  if (!machineCode || !esp32Id) {
    sendJson(res, 400, { error: 'machine_id and esp32_id are required' })
    return
  }

  let supabase
  try {
    supabase = getSupabaseAdmin()
  } catch (err) {
    sendJson(res, 500, { error: err.message })
    return
  }

  let machine
  try {
    machine = await resolveAuthorizedMachine({
      supabase,
      machineCode,
      esp32Id,
      token,
    })
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Unable to validate machine' })
    return
  }

  if (!machine) {
    sendJson(res, 403, { error: 'Invalid machine/token pairing' })
    return
  }

  if (machine.apontamento_tipo !== 'sensor') {
    sendJson(res, 409, { error: 'Machine is not configured for sensor mode' })
    return
  }

  const companyId = machine.company_id
  const sourceIp = getRequestIp(req)

  const rateKey = `${companyId}:${machineCode}:${esp32Id}:${sourceIp || 'noip'}`
  if (!canAcceptHeartbeatRate(rateKey)) {
    sendJson(res, 429, { error: 'Rate limit exceeded for heartbeat endpoint' })
    return
  }

  const heartbeatPayload = {
    company_id: companyId,
    machine_id: machineCode,
    esp32_id: esp32Id,
    status: String(body.status || 'online').trim() || 'online',
    wifi_ssid: body.wifi ? String(body.wifi).trim() : null,
    ip: body.ip ? String(body.ip).trim() : (sourceIp || null),
    uptime_seconds: Number.isFinite(Number(body.uptime)) ? Math.max(0, Math.trunc(Number(body.uptime))) : null,
    signal_rssi: Number.isFinite(Number(body.signal_rssi)) ? Math.trunc(Number(body.signal_rssi)) : null,
    source_ip: sourceIp || null,
    created_by: 'esp32',
  }

  const { data: hbRows, error: hbError } = await supabase
    .from('machine_sensor_heartbeats')
    .insert(heartbeatPayload)
    .select('id, created_at')
    .limit(1)

  if (hbError) {
    sendJson(res, 500, { error: hbError.message || 'Unable to save heartbeat' })
    return
  }

  const sensorStatus = computeStatus(machine.sensor_last_pulse_at ? new Date(machine.sensor_last_pulse_at).getTime() : 0)
  const autoStopped = shouldMarkAutoStop(machine.sensor_last_pulse_at, machine.ciclo_cadastrado_seconds)

  const { error: machineUpdateError } = await supabase
    .from('machines')
    .update({
      sensor_last_heartbeat_at: nowIso(),
      sensor_status: sensorStatus,
      esp32_id: esp32Id,
      sensor_auto_stopped: autoStopped,
      sensor_auto_stop_at: autoStopped ? nowIso() : null,
    })
    .eq('id', machine.id)

  if (machineUpdateError) {
    sendJson(res, 500, { error: machineUpdateError.message || 'Unable to update machine heartbeat state' })
    return
  }

  sendJson(res, 200, {
    ok: true,
    machine_id: machineCode,
    company_id: companyId,
    heartbeat_id: (hbRows || [])[0]?.id || null,
    sensor_status: sensorStatus,
    sensor_auto_stopped: autoStopped,
  })
}
