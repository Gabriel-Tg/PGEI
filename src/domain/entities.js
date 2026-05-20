/**
 * Domain entities and normalization helpers for Supabase row payloads.
 *
 * This module preserves database field names in the underlying queries,
 * but exposes normalized camelCase domain objects to the frontend.
 */

export function mapOrder(row = {}) {
  if (!row || typeof row !== 'object') return null;

  return {
    ...row,
    id: row.id,
    company_id: row.company_id || null,
    clientId: row.company_id || null,
    machine_id: row.machine_id || null,
    machineId: row.machine_id || null,
    code: row.code || null,
    customer: row.customer || null,
    product: row.product || null,
    color: row.color || null,
    qty: row.qty || null,
    boxes: row.boxes || null,
    standard: row.standard || null,
    due_date: row.due_date || null,
    dueDate: row.due_date || null,
    notes: row.notes || null,
    status: row.status || null,
    pos: row.pos ?? null,
    finalized: row.finalized ?? false,
    finalized_at: row.finalized_at || null,
    finalizedAt: row.finalized_at || null,
    finalized_by: row.finalized_by || null,
    finalizedBy: row.finalized_by || null,
    started_at: row.started_at || null,
    startedAt: row.started_at || null,
    started_by: row.started_by || null,
    startedBy: row.started_by || null,
    restarted_at: row.restarted_at || null,
    restartedAt: row.restarted_at || null,
    restarted_by: row.restarted_by || null,
    restartedBy: row.restarted_by || null,
    interrupted_at: row.interrupted_at || null,
    interruptedAt: row.interrupted_at || null,
    interrupted_by: row.interrupted_by || null,
    interruptedBy: row.interrupted_by || null,
    stopped_at: row.stopped_at || null,
    stoppedAt: row.stopped_at || null,
    loweff_started_at: row.loweff_started_at || null,
    loweffStartedAt: row.loweff_started_at || null,
    loweff_ended_at: row.loweff_ended_at || null,
    loweffEndedAt: row.loweff_ended_at || null,
    loweff_notes: row.loweff_notes || null,
    loweffNotes: row.loweff_notes || null,
    loweff_reason: row.loweff_reason || null,
    loweffReason: row.loweff_reason || null,
    scanned_count: row.scanned_count ?? null,
    scannedCount: row.scanned_count ?? null,
    raw: row,
  };
}

export function mapProductionScan(row = {}) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    orderId: row.order_id || null,
    machineId: row.machine_id || null,
    orderCode: row.op_code || row.code || null,
    scannedBox: row.scanned_box ?? null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    raw: row,
  };
}

export function mapMachineStop(row = {}) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    orderId: row.order_id || null,
    machineId: row.machine_id || null,
    startedAt: row.started_at || null,
    startedBy: row.started_by || null,
    resumedAt: row.resumed_at || null,
    resumedBy: row.resumed_by || null,
    reason: row.reason || null,
    notes: row.notes || null,
    clientId: row.company_id || null,
    raw: row,
  };
}

export function mapScrapLog(row = {}) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    orderId: row.order_id || null,
    machineId: row.machine_id || null,
    qty: row.qty ?? null,
    orderCode: row.op_code || row.code || null,
    createdAt: row.created_at || null,
    note: row.note || row.notes || null,
    clientId: row.company_id || null,
    raw: row,
  };
}

export function mapInjectionProductionEntry(row = {}) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    orderId: row.order_id || null,
    machineId: row.machine_id || null,
    goodQty: row.good_qty ?? null,
    createdAt: row.created_at || null,
    clientId: row.company_id || null,
    raw: row,
  };
}

export function mapLowEfficiencyLog(row = {}) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    orderId: row.order_id || null,
    machineId: row.machine_id || null,
    startedAt: row.started_at || null,
    endedAt: row.ended_at || null,
    operator: row.operator || row.started_by || null,
    notes: row.notes || row.low_efficiency_notes || null,
    reason: row.reason || null,
    clientId: row.company_id || null,
    raw: row,
  };
}

export function mapTabletStatus(row = {}) {
  if (!row || typeof row !== 'object') return null;
  return {
    machineId: row.machine_id || null,
    deviceId: row.device_id || null,
    routePath: row.route_path || null,
    lastSeenAt: row.last_seen_at || null,
    lastBeepAt: row.last_beep_at || null,
    operatorName: row.operator_name || null,
    batteryLevel: row.battery_level ?? null,
    isCharging: row.is_charging ?? null,
    isOnline: row.is_online ?? null,
    appCommit: row.app_commit || null,
    raw: row,
  };
}

export function getOrderCode(order = {}) {
  return order.code || order.orderCode || order.op_code || order.raw?.code || null;
}

