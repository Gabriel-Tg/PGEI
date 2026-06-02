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

const STATUS_WINDOW_MS = 10_000
const STATUS_LIMIT_PER_WINDOW = 120
const statusBuckets = new Map()

function nowIso() {
  return new Date().toISOString()
}

function canAcceptStatusRate(key) {
  const now = Date.now()
  const current = statusBuckets.get(key)

  if (!current || now - current.windowStart > STATUS_WINDOW_MS) {
    statusBuckets.set(key, { windowStart: now, count: 1 })
    return true
  }

  if (current.count >= STATUS_LIMIT_PER_WINDOW) return false
  current.count += 1
  return true
}

export default async function handler(req, res) {
  if (!isMethod(req, 'POST')) {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const headerToken = readSensorToken(req)

  let body
  try {
    body = await parseJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' })
    return
  }

  const token = headerToken || body.token || ''
  if (!token) {
    sendJson(res, 401, { error: 'Missing sensor token' })
    return
  }

  const machineCode = normalizeMachineCode(body.machine_id)
  const esp32Id = normalizeEsp32Id(body.esp32_id)
  const status = String(body.status || '').trim().toLowerCase()

  if (!machineCode || !esp32Id || !status) {
    sendJson(res, 400, { error: 'machine_id, esp32_id and status are required' })
    return
  }

  if (!['running', 'stopped'].includes(status)) {
    sendJson(res, 422, { error: 'status must be one of: running, stopped' })
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
  if (!canAcceptStatusRate(rateKey)) {
    sendJson(res, 429, { error: 'Rate limit exceeded for status endpoint' })
    return
  }

  // Persist status event into machine_sensor_heartbeats to keep history
  const heartbeatPayload = {
    company_id: companyId,
    machine_id: machineCode,
    esp32_id: esp32Id,
    status: status,
    ip: body.ip ? String(body.ip).trim() : (sourceIp || null),
    source_ip: sourceIp || null,
    created_by: 'esp32_status',
  }

  const { data: hbRows, error: hbError } = await supabase
    .from('machine_sensor_heartbeats')
    .insert(heartbeatPayload)
    .select('id, created_at')
    .limit(1)

  if (hbError) {
    sendJson(res, 500, { error: hbError.message || 'Unable to save status event' })
    return
  }

  // Update machine current sensor status and timestamp
  const { error: machineUpdateError } = await supabase
    .from('machines')
    .update({
      sensor_status: status,
      esp32_id: esp32Id,
      sensor_last_heartbeat_at: nowIso(),
    })
    .eq('id', machine.id)

  if (machineUpdateError) {
    sendJson(res, 500, { error: machineUpdateError.message || 'Unable to update machine status' })
    return
  }

  sendJson(res, 200, { success: true })
}
