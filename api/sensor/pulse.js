import {
  getRequestIp,
  getSupabaseAdmin,
  isMethod,
  normalizeEsp32Id,
  normalizeMachineCode,
  parseJsonBody,
  parseProductCode,
  readSensorToken,
  resolveAuthorizedMachine,
  sendJson,
} from '../_lib/sensorCommon.js'

const RATE_WINDOW_MS = 10_000
const RATE_LIMIT_PER_WINDOW = 120
const rateBuckets = new Map()

function canAcceptRate(key) {
  const now = Date.now()
  const current = rateBuckets.get(key)

  if (!current || now - current.windowStart > RATE_WINDOW_MS) {
    rateBuckets.set(key, { windowStart: now, count: 1 })
    return true
  }

  if (current.count >= RATE_LIMIT_PER_WINDOW) return false
  current.count += 1
  return true
}

function nowIso() {
  return new Date().toISOString()
}

function parsePositiveInt(value, fallback = 0) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  const int = Math.trunc(num)
  return int > 0 ? int : fallback
}

function computeSensorStatus(lastPulseMs, lastHeartbeatMs) {
  const now = Date.now()
  if (lastPulseMs && now - lastPulseMs <= 20_000) return 'recebendo_pulsos'
  if (lastHeartbeatMs && now - lastHeartbeatMs <= 40_000) return 'online'
  if (lastHeartbeatMs && now - lastHeartbeatMs <= 180_000) return 'sem_comunicacao'
  return 'offline'
}

function roundCycle(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return Number(num.toFixed(3))
}

export default async function handler(req, res) {
  if (!isMethod(req, 'POST')) {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const sourceIp = getRequestIp(req)
  const headerToken = readSensorToken(req)

  let body
  try {
    body = await parseJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' })
    return
  }

  // Token: prioritário no header, fallback no body
  const token = headerToken || body.token || ''
  if (!token) {
    sendJson(res, 401, { error: 'Missing sensor token' })
    return
  }

  const machineCode = normalizeMachineCode(body.machine_id)
  const esp32Id = normalizeEsp32Id(body.esp32_id)
  const pulseCount = parsePositiveInt(body.pulse_count, 0)
  const eventUid = String(body.event_uid || body.event_id || req.headers['x-event-id'] || '').trim()

  if (!machineCode || !esp32Id || !pulseCount) {
    sendJson(res, 400, { error: 'machine_id, esp32_id and pulse_count are required' })
    return
  }

  if (pulseCount > 5000) {
    sendJson(res, 422, { error: 'pulse_count too high for a single event' })
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

  const rateKey = `${companyId}:${machineCode}:${esp32Id}:${sourceIp || 'noip'}`
  if (!canAcceptRate(rateKey)) {
    sendJson(res, 429, { error: 'Rate limit exceeded for sensor endpoint' })
    return
  }

  const { data: lastEventRows, error: lastEventError } = await supabase
    .from('machine_sensor_events')
    .select('created_at, pulse_count, id')
    .eq('company_id', companyId)
    .eq('machine_id', machineCode)
    .order('created_at', { ascending: false })
    .limit(1)

  if (lastEventError) {
    sendJson(res, 500, { error: lastEventError.message || 'Unable to check flood window' })
    return
  }

  const lastEvent = (lastEventRows || [])[0]
  if (lastEvent?.created_at) {
    const elapsedMs = Date.now() - new Date(lastEvent.created_at).getTime()
    if (elapsedMs < 150) {
      sendJson(res, 429, { error: 'Flood protection active' })
      return
    }

    if (!eventUid && lastEvent.pulse_count === pulseCount && elapsedMs < 2_000) {
      sendJson(res, 200, {
        ok: true,
        duplicate: true,
        machine_id: machineCode,
        event_uid: null,
      })
      return
    }
  }

  const { data: activeOrders, error: activeOrderError } = await supabase
    .from('orders')
    .select('id, code, machine_id, product, status, finalized, qty, boxes, standard, pos')
    .eq('company_id', companyId)
    .eq('machine_id', machineCode)
    .eq('finalized', false)
    .in('status', ['PRODUZINDO', 'BAIXA_EFICIENCIA'])
    .order('pos', { ascending: true })
    .limit(1)

  if (activeOrderError) {
    sendJson(res, 500, { error: activeOrderError.message || 'Unable to find active order' })
    return
  }

  const activeOrder = (activeOrders || [])[0] || null

  let cavitiesUsed = 1
  if (activeOrder?.product) {
    const productCode = parseProductCode(activeOrder.product)
    if (productCode) {
      const { data: itemRows, error: itemError } = await supabase
        .from('items')
        .select('cavities')
        .eq('company_id', companyId)
        .eq('code', productCode)
        .limit(1)

      if (itemError) {
        sendJson(res, 500, { error: itemError.message || 'Unable to load cavities from item' })
        return
      }

      const cavities = Number((itemRows || [])[0]?.cavities || 0)
      if (Number.isFinite(cavities) && cavities > 0) cavitiesUsed = Math.trunc(cavities)
    }
  }

  const producedQuantity = activeOrder ? pulseCount * cavitiesUsed : 0

  const nowMs = Date.now()
  const previousPulseMs = machine.sensor_last_pulse_at ? new Date(machine.sensor_last_pulse_at).getTime() : 0
  const cycleRealSeconds = previousPulseMs > 0 && nowMs > previousPulseMs
    ? roundCycle((nowMs - previousPulseMs) / 1000 / Math.max(1, pulseCount))
    : null

  const prevAvgCycle = Number(machine.sensor_avg_cycle_seconds || 0)
  const prevCycleCount = Number(machine.sensor_cycle_count || 0)
  const nextCycleCount = cycleRealSeconds ? (prevCycleCount + 1) : prevCycleCount
  const nextAvgCycle = cycleRealSeconds
    ? roundCycle(((prevAvgCycle * prevCycleCount) + cycleRealSeconds) / Math.max(1, nextCycleCount))
    : (prevAvgCycle > 0 ? roundCycle(prevAvgCycle) : null)

  const cicloCadastrado = Number(machine.ciclo_cadastrado_seconds || 0)
  const isAutoStopped = cicloCadastrado > 0 && previousPulseMs > 0
    ? ((nowMs - previousPulseMs) / 1000) > (cicloCadastrado * 4)
    : false

  const eventPayload = {
    company_id: companyId,
    machine_id: machineCode,
    order_id: activeOrder?.id || null,
    pulse_count: pulseCount,
    cavities_used: cavitiesUsed,
    produced_quantity: producedQuantity,
    esp32_id: esp32Id,
    source_ip: sourceIp || null,
    created_by: 'esp32',
    event_uid: eventUid || null,
    is_ignored: !activeOrder,
    ignore_reason: activeOrder ? null : 'NO_ACTIVE_ORDER',
    request_payload: {
      pulse_count: pulseCount,
      esp32_id: esp32Id,
      machine_id: machineCode,
      received_at: nowIso(),
      cycle_real_seconds: cycleRealSeconds,
      cycle_avg_seconds: nextAvgCycle,
    },
  }

  const { data: eventRows, error: eventError } = await supabase
    .from('machine_sensor_events')
    .insert(eventPayload)
    .select('id, created_at')
    .limit(1)

  if (eventError) {
    if (String(eventError.code || '') === '23505') {
      sendJson(res, 200, {
        ok: true,
        duplicate: true,
        machine_id: machineCode,
        event_uid: eventUid || null,
      })
      return
    }
    sendJson(res, 500, { error: eventError.message || 'Unable to save sensor event' })
    return
  }

  const event = (eventRows || [])[0]

  if (cycleRealSeconds) {
    const { error: cycleHistoryError } = await supabase
      .from('machine_cycle_history')
      .insert({
        company_id: companyId,
        machine_id: machineCode,
        order_id: activeOrder?.id || null,
        sensor_event_id: event?.id || null,
        pulse_timestamp: event?.created_at || nowIso(),
        cycle_seconds: cycleRealSeconds,
        cycle_avg_seconds: nextAvgCycle,
        ciclo_cadastrado_seconds: cicloCadastrado > 0 ? Math.trunc(cicloCadastrado) : null,
        machine_status: machine.sensor_status || 'online',
        esp32_id: esp32Id,
        created_by: 'esp32',
      })

    if (cycleHistoryError) {
      sendJson(res, 500, { error: cycleHistoryError.message || 'Unable to persist cycle history' })
      return
    }
  }

  if (activeOrder && producedQuantity > 0) {
    const { error: entryError } = await supabase
      .from('injection_production_entries')
      .insert({
        company_id: companyId,
        order_id: activeOrder.id,
        machine_id: machineCode,
        good_qty: producedQuantity,
        product: activeOrder.product || null,
        shift: null,
        source: 'sensor',
        pulse_count: pulseCount,
        cavities_used: cavitiesUsed,
        sensor_event_id: event?.id || null,
      })

    if (entryError) {
      sendJson(res, 500, { error: entryError.message || 'Unable to persist production entry' })
      return
    }
  }

  const lastPulseMs = nowMs
  const lastHeartbeatMs = machine.sensor_last_heartbeat_at ? new Date(machine.sensor_last_heartbeat_at).getTime() : 0
  const sensorStatus = computeSensorStatus(lastPulseMs, lastHeartbeatMs)

  const { error: machineUpdateError } = await supabase
    .from('machines')
    .update({
      sensor_last_pulse_at: nowIso(),
      sensor_status: sensorStatus,
      sensor_last_cycle_seconds: cycleRealSeconds,
      sensor_avg_cycle_seconds: nextAvgCycle,
      sensor_cycle_count: nextCycleCount,
      sensor_auto_stopped: isAutoStopped,
      sensor_auto_stop_at: isAutoStopped ? nowIso() : null,
    })
    .eq('id', machine.id)

  if (machineUpdateError) {
    sendJson(res, 500, { error: machineUpdateError.message || 'Unable to update machine sensor status' })
    return
  }

  sendJson(res, 200, {
    ok: true,
    machine_id: machineCode,
    company_id: companyId,
    order_id: activeOrder?.id || null,
    order_code: activeOrder?.code || null,
    pulse_count: pulseCount,
    cavities_used: cavitiesUsed,
    produced_quantity: producedQuantity,
    cycle_real_seconds: cycleRealSeconds,
    cycle_avg_seconds: nextAvgCycle,
    ciclo_cadastrado_seconds: cicloCadastrado > 0 ? Math.trunc(cicloCadastrado) : null,
    ignored: !activeOrder,
    ignore_reason: activeOrder ? null : 'NO_ACTIVE_ORDER',
    sensor_status: sensorStatus,
    event_id: event?.id || null,
  })
}
