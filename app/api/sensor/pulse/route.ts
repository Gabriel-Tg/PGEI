import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ================================================================================
// Configuração Supabase
// ================================================================================

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
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

function getRequestIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function readSensorToken(req: NextRequest): string {
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
        'id, company_id, machine_code, machine_name, active, apontamento_tipo, esp32_id, sensor_token_hash'
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

export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    console.log('📨 Body recebido:', body);

    // Validações básicas
    const sourceIp = getRequestIp(request);
    const headerToken = readSensorToken(request);
    const token = headerToken || body.token || '';

    if (!token) {
      console.warn('⚠️ Token não fornecido');
      return NextResponse.json(
        { error: 'Missing sensor token' },
        { status: 401 }
      );
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
      return NextResponse.json(
        { error: 'machine_id, esp32_id and pulse_count are required' },
        { status: 400 }
      );
    }

    console.log('✓ Validação básica OK:', { machineCode, esp32Id, pulseCount });

    // Conectar Supabase
    let supabase;
    try {
      supabase = getSupabaseAdmin();
    } catch (err: any) {
      console.error('❌ Erro Supabase:', err.message);
      return NextResponse.json(
        { error: err.message },
        { status: 500 }
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
      return NextResponse.json(
        { error: 'Invalid machine/token pairing' },
        { status: 403 }
      );
    }

    console.log('✓ Máquina autorizada:', machine.machine_name);

    const companyId = machine.company_id;

    // Rate limiting
    const rateKey = `${companyId}:${machineCode}:${esp32Id}:${sourceIp || 'noip'}`;
    if (!canAcceptRate(rateKey)) {
      console.warn('⚠️ Rate limit excedido:', rateKey);
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    // Buscar O.P. ativa
    const { data: activeOrders, error: orderError } = await supabase
      .from('orders')
      .select('id, code, machine_id, product, status, finalized, qty, boxes')
      .eq('company_id', companyId)
      .eq('machine_id', machineCode)
      .eq('finalized', false)
      .in('status', ['PRODUZINDO', 'BAIXA_EFICIENCIA'])
      .order('pos', { ascending: true })
      .limit(1);

    if (orderError) {
      console.error('Erro ao buscar O.P.:', orderError);
      return NextResponse.json(
        { error: 'Unable to find active order' },
        { status: 500 }
      );
    }

    const activeOrder = (activeOrders || [])[0] || null;
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

    const producedQuantity = activeOrder ? pulseCount * cavitiesUsed : 0;
    console.log('📊 Produção calculada:', {
      pulseCount,
      cavitiesUsed,
      total: producedQuantity
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
      is_ignored: !activeOrder,
      ignore_reason: activeOrder ? null : 'NO_ACTIVE_ORDER'
    };

    const { data: eventRows, error: eventError } = await supabase
      .from('machine_sensor_events')
      .insert(eventPayload)
      .select('id, created_at');

    if (eventError) {
      console.error('Erro ao salvar evento:', eventError);
      if (String(eventError.code) === '23505') {
        // Duplicado
        return NextResponse.json(
          { ok: true, duplicate: true, machine_id: machineCode },
          { status: 200 }
        );
      }
      return NextResponse.json(
        { error: eventError.message || 'Unable to save event' },
        { status: 500 }
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
          shift: null,
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
    const { error: machineError } = await supabase
      .from('machines')
      .update({
        sensor_last_pulse_at: nowIso(),
        sensor_status: 'recebendo_pulsos'
      })
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
      ignored: !activeOrder,
      event_id: event?.id
    };

    console.log('✅ Response:', response);
    return NextResponse.json(response, { status: 200 });

  } catch (error: any) {
    console.error('❌ Erro não capturado:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ================================================================================
// Método não permitido
// ================================================================================

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST' },
    { status: 405 }
  );
}
