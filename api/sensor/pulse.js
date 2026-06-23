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

const AUTO_STOP_CYCLE_MULTIPLIER = 6

function getAutoStopAt(lastPulseMs, cicloCadastradoSeconds) {
  const baseCycle = Number(cicloCadastradoSeconds || 0)
  if (!(baseCycle > 0) || !lastPulseMs) return null
  return new Date(lastPulseMs + (baseCycle * AUTO_STOP_CYCLE_MULTIPLIER * 1000)).toISOString()
}

function brDateParts(date = new Date()) {
  const br = new Date(date.getTime() - (3 * 60 * 60 * 1000))
  return {
    year: br.getUTCFullYear(),
    month: br.getUTCMonth(),
    day: br.getUTCDate(),
    weekday: br.getUTCDay(),
  }
}

function brLocalToUtcIso(parts, hour, minute) {
  return new Date(Date.UTC(parts.year, parts.month, parts.day, hour + 3, minute, 0, 0)).toISOString()
}

function shiftWindowsForBrDate(parts) {
  const weekday = parts.weekday
  const definitions = weekday >= 1 && weekday <= 5
    ? [
        { shiftKey: '1', startHour: 5, startMinute: 0, endHour: 13, endMinute: 30 },
        { shiftKey: '2', startHour: 13, startMinute: 30, endHour: 22, endMinute: 0 },
        { shiftKey: '3', startHour: 22, startMinute: 0, endHour: 5, endMinute: 0 },
      ]
    : weekday === 6
      ? [
          { shiftKey: '1', startHour: 5, startMinute: 0, endHour: 9, endMinute: 0 },
          { shiftKey: '2', startHour: 9, startMinute: 0, endHour: 13, endMinute: 0 },
        ]
      : [
          { shiftKey: '3', startHour: 23, startMinute: 0, endHour: 5, endMinute: 0 },
        ]

  return definitions.map((definition) => {
    const start = brLocalToUtcIso(parts, definition.startHour, definition.startMinute)
    let end = brLocalToUtcIso(parts, definition.endHour, definition.endMinute)
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      end = new Date(new Date(end).getTime() + (24 * 60 * 60 * 1000)).toISOString()
    }
    return {
      shiftKey: definition.shiftKey,
      start,
      end,
      effectiveDate: `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    }
  })
}

function getCurrentShiftWindow(date = new Date()) {
  const today = brDateParts(date)
  const yesterdayDate = new Date(Date.UTC(today.year, today.month, today.day + 1, 3, 0, 0, 0) - (48 * 60 * 60 * 1000))
  const yesterday = brDateParts(yesterdayDate)
  const nowMs = date.getTime()
  return [
    ...shiftWindowsForBrDate(yesterday),
    ...shiftWindowsForBrDate(today),
  ].find((window) => nowMs >= new Date(window.start).getTime() && nowMs < new Date(window.end).getTime()) || null
}

async function findShiftOperator({ supabase, companyId, machineCode, shiftWindow }) {
  if (!shiftWindow?.shiftKey) return null

  const baseQuery = supabase
    .from('shift_responsibles')
    .select('operator, responsible, responsavel, created_at')
    .eq('company_id', companyId)
    .eq('machine_id', machineCode)
    .eq('shift', String(shiftWindow.shiftKey))
    .order('created_at', { ascending: false })
    .limit(1)

  const byEffectiveDate = await baseQuery.eq('effective_date', shiftWindow.effectiveDate)
  if (!byEffectiveDate.error) {
    const row = (byEffectiveDate.data || [])[0]
    const name = String(row?.operator || row?.responsible || row?.responsavel || '').trim()
    if (name) return name
  }

  const byWindow = await supabase
    .from('shift_responsibles')
    .select('operator, responsible, responsavel, created_at')
    .eq('company_id', companyId)
    .eq('machine_id', machineCode)
    .eq('shift', String(shiftWindow.shiftKey))
    .gte('created_at', shiftWindow.start)
    .lt('created_at', shiftWindow.end)
    .order('created_at', { ascending: false })
    .limit(1)

  if (byWindow.error) return null
  const row = (byWindow.data || [])[0]
  return String(row?.operator || row?.responsible || row?.responsavel || '').trim() || null
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

  const previousPulseMs = machine.sensor_last_pulse_at ? new Date(machine.sensor_last_pulse_at).getTime() : 0
  if (previousPulseMs > 0 && Date.now() - previousPulseMs < 150) {
    sendJson(res, 429, { error: 'Flood protection active' })
    return
  }

  const { data: activeOrders, error: activeOrderError } = await supabase
    .from('orders')
    .select('id, code, machine_id, product, status, finalized, qty, boxes, standard, pos, started_at, started_by, restarted_at, restarted_by')
    .eq('company_id', companyId)
    .eq('machine_id', machineCode)
    .eq('finalized', false)
    .in('status', ['AGUARDANDO', 'PRODUZINDO', 'BAIXA_EFICIENCIA', 'PARADA'])
    .order('pos', { ascending: true })
    .limit(1)

  if (activeOrderError) {
    sendJson(res, 500, { error: activeOrderError.message || 'Unable to find active order' })
    return
  }

  let activeOrder = (activeOrders || [])[0] || null
  const shiftWindow = getCurrentShiftWindow(new Date())
  const shiftOperator = await findShiftOperator({ supabase, companyId, machineCode, shiftWindow })
  const receivedAt = nowIso()

  if (activeOrder && String(activeOrder.status || '').toUpperCase() === 'AGUARDANDO') {
    const startPayload = {
      status: 'PRODUZINDO',
      started_at: receivedAt,
      started_by: shiftOperator || null,
      interrupted_at: null,
      interrupted_by: null,
    }
    const { data: startedOrder, error: startError } = await supabase
      .from('orders')
      .update(startPayload)
      .eq('id', activeOrder.id)
      .select('id, code, machine_id, product, status, finalized, qty, boxes, standard, pos, started_at, started_by')
      .maybeSingle()

    if (startError) {
      sendJson(res, 500, { error: startError.message || 'Unable to auto start order' })
      return
    }
    activeOrder = startedOrder || { ...activeOrder, ...startPayload }
  } else if (activeOrder && String(activeOrder.status || '').toUpperCase() === 'PARADA') {
    const resumedBy = shiftOperator || 'esp32'
    const { data: openStop, error: openStopError } = await supabase
      .from('machine_stops')
      .select('id')
      .eq('company_id', companyId)
      .eq('order_id', activeOrder.id)
      .eq('machine_id', machineCode)
      .is('resumed_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (openStopError) {
      sendJson(res, 500, { error: openStopError.message || 'Unable to find open machine stop' })
      return
    }

    if (openStop?.id) {
      const { error: resumeStopError } = await supabase
        .from('machine_stops')
        .update({ resumed_by: resumedBy, resumed_at: receivedAt })
        .eq('id', openStop.id)

      if (resumeStopError) {
        sendJson(res, 500, { error: resumeStopError.message || 'Unable to resume open machine stop' })
        return
      }
    }

    const resumePayload = { status: 'PRODUZINDO' }
    const { data: resumedOrder, error: resumeOrderError } = await supabase
      .from('orders')
      .update(resumePayload)
      .eq('id', activeOrder.id)
      .select('id, code, machine_id, product, status, finalized, qty, boxes, standard, pos, started_at, started_by, restarted_at, restarted_by')
      .maybeSingle()

    if (resumeOrderError) {
      sendJson(res, 500, { error: resumeOrderError.message || 'Unable to auto resume order' })
      return
    }
    activeOrder = resumedOrder || { ...activeOrder, ...resumePayload }
  } else if (activeOrder && shiftOperator && !String(activeOrder.started_by || '').trim()) {
    await supabase
      .from('orders')
      .update({ started_by: shiftOperator })
      .eq('id', activeOrder.id)
  }

  let cavitiesUsed = Number(machine.cavities || 0) > 0 ? Math.trunc(Number(machine.cavities)) : 1
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
      if (!(Number(machine.cavities || 0) > 0) && Number.isFinite(cavities) && cavities > 0) cavitiesUsed = Math.trunc(cavities)
    }
  }

  const ignoreCountLeft = Number(machine.sensor_ignore_pulse_count || 0)
  const operationMode = String(machine.sensor_operation_mode || 'automatic')
  const isSemiAutomaticIgnore = operationMode === 'semi_automatic' && ignoreCountLeft > 0
  const ignoreReason = isSemiAutomaticIgnore
    ? 'SEMI_AUTOMATIC'
    : (!activeOrder ? 'NO_ACTIVE_ORDER' : null)
  const isIgnoredEvent = isSemiAutomaticIgnore || !activeOrder
  const producedQuantity = isIgnoredEvent ? 0 : (activeOrder ? pulseCount * cavitiesUsed : 0)

  const nowMs = Date.now()
  const cycleRealSeconds = !isIgnoredEvent && previousPulseMs > 0 && nowMs > previousPulseMs
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
    ? ((nowMs - previousPulseMs) / 1000) >= (cicloCadastrado * AUTO_STOP_CYCLE_MULTIPLIER)
    : false
  const autoStopAt = isAutoStopped ? getAutoStopAt(previousPulseMs, cicloCadastrado) : null

  let aggregateRecord = null
  if (!isIgnoredEvent && activeOrder && producedQuantity > 0) {
    const { data: aggregateRows, error: aggregateError } = await supabase
      .rpc('record_sensor_order_cycle', {
        p_company_id: companyId,
        p_order_id: activeOrder.id,
        p_machine_id: machineCode,
        p_product: activeOrder.product || null,
        p_pulse_count: pulseCount,
        p_cavities_used: cavitiesUsed,
        p_produced_quantity: producedQuantity,
        p_pulse_timestamp: receivedAt,
        p_cycle_seconds: cycleRealSeconds,
        p_cycle_avg_seconds: nextAvgCycle,
        p_ciclo_cadastrado_seconds: cicloCadastrado > 0 ? Math.trunc(cicloCadastrado) : null,
        p_esp32_id: esp32Id,
        p_event_uid: eventUid || null,
        p_request_payload: {
          pulse_count: pulseCount,
          esp32_id: esp32Id,
          machine_id: machineCode,
          received_at: receivedAt,
          cycle_real_seconds: cycleRealSeconds,
          cycle_avg_seconds: nextAvgCycle,
          sensor_operation_mode: operationMode,
          shift: shiftWindow?.shiftKey || null,
          shift_operator: shiftOperator || null,
          source_ip: sourceIp || null,
        },
        p_shift: shiftWindow?.shiftKey || null,
      })

    if (aggregateError) {
      sendJson(res, 500, { error: aggregateError.message || 'Unable to aggregate sensor production' })
      return
    }

    aggregateRecord = (Array.isArray(aggregateRows) ? aggregateRows[0] : aggregateRows) || null
    if (aggregateRecord?.duplicate) {
      sendJson(res, 200, {
        ok: true,
        duplicate: true,
        machine_id: machineCode,
        event_uid: eventUid || null,
        aggregate_id: aggregateRecord.aggregate_id || null,
      })
      return
    }
  }

  const lastPulseMs = isSemiAutomaticIgnore ? (machine.sensor_last_pulse_at ? new Date(machine.sensor_last_pulse_at).getTime() : 0) : nowMs
  const lastHeartbeatMs = machine.sensor_last_heartbeat_at ? new Date(machine.sensor_last_heartbeat_at).getTime() : 0
  const sensorStatus = computeSensorStatus(lastPulseMs, lastHeartbeatMs)

  const machineUpdate = {
    sensor_status: sensorStatus,
    sensor_auto_stopped: isAutoStopped,
    sensor_auto_stop_at: autoStopAt,
  }

  if (!isSemiAutomaticIgnore) {
    machineUpdate.sensor_last_pulse_at = nowIso()
    machineUpdate.sensor_last_cycle_seconds = cycleRealSeconds
    machineUpdate.sensor_avg_cycle_seconds = nextAvgCycle
    machineUpdate.sensor_cycle_count = nextCycleCount
  }

  if (isSemiAutomaticIgnore) {
    machineUpdate.sensor_ignore_pulse_count = Math.max(ignoreCountLeft - 1, 0)
    machineUpdate.sensor_last_heartbeat_at = nowIso()
  }

  const { error: machineUpdateError } = await supabase
    .from('machines')
    .update(machineUpdate)
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
    ignored: isIgnoredEvent,
    ignore_reason: ignoreReason,
    remaining_ignored_cycles: isSemiAutomaticIgnore ? Math.max(ignoreCountLeft - 1, 0) : 0,
    sensor_operation_mode: operationMode,
    sensor_status: sensorStatus,
    aggregate_id: aggregateRecord?.aggregate_id || null,
    event_id: null,
  })
}
