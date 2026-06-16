import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ================================================================================
// Configuração Supabase
// ================================================================================

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  return createClient(url, key, {
    auth: { persistSession: false }
  });
}

// ================================================================================
// Utilitários
// ================================================================================

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function normalizeMachineCode(value: unknown): string {
  return normalizeString(value).toUpperCase();
}

function normalizeEsp32Id(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function parsePositiveInt(value: unknown, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const int = Math.trunc(num);
  return int > 0 ? int : fallback;
}

function getRequestIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function readSensorToken(req: Request): string {
  const headerToken = req.headers.get('x-sensor-token') || '';
  if (headerToken) return headerToken;
  
  const authHeader = req.headers.get('authorization') || '';
  return authHeader.replace(/^bearer\s+/i, '').trim();
}

function parseProductCode(product: string): string {
  const raw = normalizeString(product);
  if (!raw) return '';
  return raw.split('-')[0]?.trim() || '';
}

function nowIso(): string {
  return new Date().toISOString();
}

async function resumeAutoStopIfNeeded(supabase: any, { companyId, machineCode, activeOrder, operatorName, resumedAt }: {
  companyId: string;
  machineCode: string;
  activeOrder: any;
  operatorName: string | null;
  resumedAt: string;
}) {
  if (!activeOrder?.id) return activeOrder;

  const isStopped = String(activeOrder.status || '').toUpperCase() === 'PARADA';
  if (!isStopped) return activeOrder;

  const { data: openStop, error: openError } = await supabase
    .from('machine_stops')
    .select('id')
    .eq('company_id', companyId)
    .eq('machine_id', machineCode)
    .eq('order_id', activeOrder.id)
    .is('resumed_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openError) throw openError;

  if (openStop?.id) {
    const { error: stopError } = await supabase
      .from('machine_stops')
      .update({ resumed_at: resumedAt, resumed_by: operatorName || null })
      .eq('id', openStop.id);

    if (stopError) throw stopError;
  }

  const orderPayload = {
    status: 'PRODUZINDO',
    restarted_at: resumedAt,
    restarted_by: operatorName || null,
    interrupted_at: null,
    interrupted_by: null,
  };

  const { data: resumedOrder, error: orderError } = await supabase
    .from('orders')
    .update(orderPayload)
    .eq('id', activeOrder.id)
    .select('id, code, machine_id, product, status, finalized, qty, boxes, started_at, started_by')
    .maybeSingle();

  if (orderError) throw orderError;
  return resumedOrder || { ...activeOrder, ...orderPayload };
}

function brDateParts(date = new Date()) {
  const br = new Date(date.getTime() - (3 * 60 * 60 * 1000));
  return {
    year: br.getUTCFullYear(),
    month: br.getUTCMonth(),
    day: br.getUTCDate(),
    weekday: br.getUTCDay(),
  };
}

function brLocalToUtcIso(parts: ReturnType<typeof brDateParts>, hour: number, minute: number): string {
  return new Date(Date.UTC(parts.year, parts.month, parts.day, hour + 3, minute, 0, 0)).toISOString();
}

function shiftWindowsForBrDate(parts: ReturnType<typeof brDateParts>) {
  const weekday = parts.weekday;
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
        ];

  return definitions.map((definition) => {
    const start = brLocalToUtcIso(parts, definition.startHour, definition.startMinute);
    let end = brLocalToUtcIso(parts, definition.endHour, definition.endMinute);
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      end = new Date(new Date(end).getTime() + (24 * 60 * 60 * 1000)).toISOString();
    }
    return {
      shiftKey: definition.shiftKey,
      start,
      end,
      effectiveDate: `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    };
  });
}

function getCurrentShiftWindow(date = new Date()) {
  const today = brDateParts(date);
  const yesterdayDate = new Date(Date.UTC(today.year, today.month, today.day + 1, 3, 0, 0, 0) - (48 * 60 * 60 * 1000));
  const yesterday = brDateParts(yesterdayDate);
  const nowMs = date.getTime();
  return [
    ...shiftWindowsForBrDate(yesterday),
    ...shiftWindowsForBrDate(today),
  ].find((window) => nowMs >= new Date(window.start).getTime() && nowMs < new Date(window.end).getTime()) || null;
}

async function findShiftOperator({ supabase, companyId, machineCode, shiftWindow }: {
  supabase: any;
  companyId: string;
  machineCode: string;
  shiftWindow: ReturnType<typeof getCurrentShiftWindow>;
}): Promise<string | null> {
  if (!shiftWindow?.shiftKey) return null;

  const byEffectiveDate = await supabase
    .from('shift_responsibles')
    .select('operator, responsible, responsavel, created_at')
    .eq('company_id', companyId)
    .eq('machine_id', machineCode)
    .eq('shift', String(shiftWindow.shiftKey))
    .eq('effective_date', shiftWindow.effectiveDate)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!byEffectiveDate.error) {
    const row = (byEffectiveDate.data || [])[0];
    const name = String(row?.operator || row?.responsible || row?.responsavel || '').trim();
    if (name) return name;
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
    .limit(1);

  if (byWindow.error) return null;
  const row = (byWindow.data || [])[0];
  return String(row?.operator || row?.responsible || row?.responsavel || '').trim() || null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ================================================================================
// Rate Limiting (em memória - simple)
// ================================================================================

const rateBuckets = new Map<string, { windowStart: number; count: number }>();

function canAcceptRate(key: string, windowMs = 10000, limitPerWindow = 120): boolean {
  const now = Date.now();
  const current = rateBuckets.get(key);

  if (!current || now - current.windowStart > windowMs) {
    rateBuckets.set(key, { windowStart: now, count: 1 });
    return true;
  }

  if (current.count >= limitPerWindow) return false;
  current.count += 1;
  return true;
}

// ================================================================================
// Validação de Máquina
// ================================================================================

async function resolveAuthorizedMachine(
  supabase: any,
  machineCode: string,
  esp32Id: string,
  token: string
) {
  try {
    const tokenHash = sha256(token);
    
    const { data, error } = await supabase
      .from('machines')
      .select(
        'id, company_id, machine_code, machine_name, active, apontamento_tipo, esp32_id, sensor_token_hash, sensor_last_pulse_at, sensor_last_heartbeat_at, sensor_status, sensor_last_cycle_seconds, sensor_avg_cycle_seconds, sensor_cycle_count, sensor_auto_stopped, sensor_auto_stop_at, ciclo_cadastrado_seconds'
      )
      .eq('machine_code', machineCode)
      .eq('active', true)
      .limit(5);

    if (error) throw error;

    const machine = (data || []).find((m: any) => {
      if (!m?.sensor_token_hash) return false;
      if (esp32Id && m.esp32_id !== esp32Id) return false;
      return m.sensor_token_hash === tokenHash;
    });

    return machine || null;
  } catch (error) {
    console.error('Erro ao validar máquina:', error);
    return null;
  }
}

// ================================================================================
// POST /api/sensor/pulse
// ================================================================================

export async function POST(request: Request) {
  try {
    console.log('📥 Requisição recebida em /api/sensor/pulse');
    console.log('Method:', request.method);
    console.log('URL:', request.url);
    
    // Ler body
    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      console.error('Erro ao parsear JSON:', e);
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    console.log('📨 Body recebido:', body);

    // Validações básicas
    const sourceIp = getRequestIp(request);
    const headerToken = readSensorToken(request);
    const token = headerToken || body.token || '';

    if (!token) {
      console.warn('⚠️ Token não fornecido');
      return jsonResponse({ error: 'Missing sensor token' }, 401);
    }

    const machineCode = normalizeMachineCode(body.machine_id);
    const esp32Id = normalizeEsp32Id(body.esp32_id);
    const pulseCount = parsePositiveInt(body.pulse_count, 0);

    if (!machineCode || !esp32Id || !pulseCount) {
      console.warn('⚠️ Validação falhou:', {
        machineCode,
        esp32Id,
        pulseCount
      });
      return jsonResponse({ error: 'machine_id, esp32_id and pulse_count are required' }, 400);
    }

    console.log('✓ Validação básica OK:', { machineCode, esp32Id, pulseCount });

    // Conectar Supabase
    let supabase;
    try {
      supabase = getSupabaseAdmin();
    } catch (err: any) {
      console.error('❌ Erro Supabase:', err.message);
      return jsonResponse(
        { error: err.message },
        500
      );
    }

    // Validar máquina
    const machine = await resolveAuthorizedMachine(
      supabase,
      machineCode,
      esp32Id,
      token
    );

    if (!machine) {
      console.warn('❌ Máquina/token inválido:', { machineCode, esp32Id });
      return jsonResponse(
        { error: 'Invalid machine/token pairing' },
        403
      );
    }

    console.log('✓ Máquina autorizada:', machine.machine_name);

    const companyId = machine.company_id;

    // Rate limiting
    const rateKey = `${companyId}:${machineCode}:${esp32Id}:${sourceIp || 'noip'}`;
    if (!canAcceptRate(rateKey)) {
      console.warn('⚠️ Rate limit excedido:', rateKey);
      return jsonResponse(
        { error: 'Rate limit exceeded' },
        429
      );
    }

    // Buscar O.P. ativa
    const { data: activeOrders, error: orderError } = await supabase
      .from('orders')
      .select('id, code, machine_id, product, status, finalized, qty, boxes, started_at, started_by')
      .eq('company_id', companyId)
      .eq('machine_id', machineCode)
      .eq('finalized', false)
      .in('status', ['AGUARDANDO', 'PRODUZINDO', 'BAIXA_EFICIENCIA', 'PARADA'])
      .order('pos', { ascending: true })
      .limit(1);

    if (orderError) {
      console.error('Erro ao buscar O.P.:', orderError);
      return jsonResponse(
        { error: 'Unable to find active order' },
        500
      );
    }

    let activeOrder = (activeOrders || [])[0] || null;
    const shiftWindow = getCurrentShiftWindow(new Date());
    const shiftOperator = await findShiftOperator({ supabase, companyId, machineCode, shiftWindow });
    const receivedAt = nowIso();

    try {
      activeOrder = await resumeAutoStopIfNeeded(supabase, {
        companyId,
        machineCode,
        activeOrder,
        operatorName: shiftOperator,
        resumedAt: receivedAt,
      });
    } catch (resumeError: any) {
      console.error('Erro ao retomar parada automaticamente:', resumeError);
      return jsonResponse({ error: resumeError.message || 'Unable to auto resume stop' }, 500);
    }

    if (activeOrder && String(activeOrder.status || '').toUpperCase() === 'AGUARDANDO') {
      const startPayload = {
        status: 'PRODUZINDO',
        started_at: receivedAt,
        started_by: shiftOperator || null,
        interrupted_at: null,
        interrupted_by: null,
      };
      const { data: startedOrder, error: startError } = await supabase
        .from('orders')
        .update(startPayload)
        .eq('id', activeOrder.id)
        .select('id, code, machine_id, product, status, finalized, qty, boxes, started_at, started_by')
        .maybeSingle();

      if (startError) {
        console.error('Erro ao iniciar O.P. automaticamente:', startError);
        return jsonResponse({ error: startError.message || 'Unable to auto start order' }, 500);
      }
      activeOrder = startedOrder || { ...activeOrder, ...startPayload };
    } else if (activeOrder && shiftOperator && !String(activeOrder.started_by || '').trim()) {
      await supabase
        .from('orders')
        .update({ started_by: shiftOperator })
        .eq('id', activeOrder.id);
    }

    console.log('📦 O.P. ativa:', activeOrder?.code || 'nenhuma');

    // Buscar cavidades
    let cavitiesUsed = 1;
    if (activeOrder?.product) {
      const productCode = parseProductCode(activeOrder.product);
      if (productCode) {
        const { data: itemRows } = await supabase
          .from('items')
          .select('cavities')
          .eq('company_id', companyId)
          .eq('code', productCode)
          .limit(1);

        const cavities = Number((itemRows || [])[0]?.cavities || 0);
        if (Number.isFinite(cavities) && cavities > 0) {
          cavitiesUsed = Math.trunc(cavities);
        }
      }
    }

    const ignoreReason = !activeOrder ? 'NO_ACTIVE_ORDER' : null
    const isIgnoredEvent = !activeOrder
    const producedQuantity = isIgnoredEvent ? 0 : (activeOrder ? pulseCount * cavitiesUsed : 0)
    console.log('📊 Produção calculada:', {
      pulseCount,
      cavitiesUsed,
      total: producedQuantity,
      isIgnoredEvent,
      ignoreReason,
    });

    // Salvar evento
    const eventId = body.event_id || crypto.randomUUID();
    
    const eventPayload = {
      company_id: companyId,
      machine_id: machineCode,
      order_id: activeOrder?.id || null,
      pulse_count: pulseCount,
      cavities_used: cavitiesUsed,
      produced_quantity: producedQuantity,
      esp32_id: esp32Id,
      source_ip: sourceIp,
      created_by: 'esp32_sensor',
      event_uid: eventId,
      is_ignored: isIgnoredEvent,
      ignore_reason: ignoreReason,
    };

    const { data: eventRows, error: eventError } = await supabase
      .from('machine_sensor_events')
      .insert(eventPayload)
      .select('id, created_at');

    if (eventError) {
      console.error('Erro ao salvar evento:', eventError);
      if (String(eventError.code) === '23505') {
        // Duplicado
        return jsonResponse(
          { ok: true, duplicate: true, machine_id: machineCode },
          200
        );
      }
      return jsonResponse(
        { error: eventError.message || 'Unable to save event' },
        500
      );
    }

    const event = (eventRows || [])[0];
    console.log('✅ Evento salvo:', event?.id);

    // Atualizar produção se houver O.P.
    if (activeOrder && producedQuantity > 0) {
      const { error: entryError } = await supabase
        .from('injection_production_entries')
        .insert({
          company_id: companyId,
          order_id: activeOrder.id,
          machine_id: machineCode,
          good_qty: producedQuantity,
          product: activeOrder.product,
          shift: shiftWindow?.shiftKey || null,
          source: 'sensor',
          pulse_count: pulseCount,
          cavities_used: cavitiesUsed,
          sensor_event_id: event?.id
        });

      if (entryError) {
        console.error('Erro ao salvar produção:', entryError);
      }
    }

    // Atualizar status da máquina
    const machinePayload: any = {
      sensor_status: 'recebendo_pulsos',
      sensor_last_pulse_at: receivedAt,
      sensor_auto_stopped: false,
      sensor_auto_stop_at: null,
    }

    const { error: machineError } = await supabase
      .from('machines')
      .update(machinePayload)
      .eq('id', machine.id);

    if (machineError) {
      console.error('Erro ao atualizar máquina:', machineError);
    }

    const response = {
      ok: true,
      machine_id: machineCode,
      company_id: companyId,
      order_id: activeOrder?.id || null,
      order_code: activeOrder?.code || null,
      pulse_count: pulseCount,
      cavities_used: cavitiesUsed,
      produced_quantity: producedQuantity,
      ignored: isIgnoredEvent,
      ignore_reason: ignoreReason,
      remaining_ignored_cycles: 0,
      event_id: event?.id
    };

    console.log('✅ Response:', response);
    return jsonResponse(response, 200);

  } catch (error: any) {
    console.error('❌ Erro não capturado:', error);
    return jsonResponse(
      { error: error.message || 'Internal server error' },
      500
    );
  }
}

// ================================================================================
// Método não permitido
// ================================================================================

export async function GET() {
  return jsonResponse(
    { error: 'Method not allowed. Use POST' },
    405
  );
}
