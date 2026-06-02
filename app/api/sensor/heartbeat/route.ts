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

function nowIso(): string {
  return new Date().toISOString();
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ================================================================================
// Rate Limiting
// ================================================================================

const heartbeatBuckets = new Map<string, { windowStart: number; count: number }>();

function canAcceptHeartbeatRate(key: string, windowMs = 60000, limitPerWindow = 120): boolean {
  const now = Date.now();
  const current = heartbeatBuckets.get(key);

  if (!current || now - current.windowStart > windowMs) {
    heartbeatBuckets.set(key, { windowStart: now, count: 1 });
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
        'id, company_id, machine_code, machine_name, active, sensor_token_hash, esp32_id'
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
// POST /api/sensor/heartbeat
// ================================================================================

export async function POST(request: Request) {
  try {
    console.log('💓 Heartbeat recebido');

    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    console.log('📨 Heartbeat body:', body);

    const headerToken = readSensorToken(request);
    const token = headerToken || body.token || '';

    if (!token) {
      return jsonResponse({ error: 'Missing sensor token' }, 401);
    }

    const machineCode = normalizeMachineCode(body.machine_id);
    const esp32Id = normalizeEsp32Id(body.esp32_id);

    if (!machineCode || !esp32Id) {
      return jsonResponse({ error: 'machine_id and esp32_id are required' }, 400);
    }

    // Conectar Supabase
    let supabase;
    try {
      supabase = getSupabaseAdmin();
    } catch (err: any) {
      return jsonResponse({ error: err.message }, 500);
    }

    // Validar máquina
    const machine = await resolveAuthorizedMachine(
      supabase,
      machineCode,
      esp32Id,
      token
    );

    if (!machine) {
      return jsonResponse({ error: 'Invalid machine/token pairing' }, 403);
    }

    const companyId = machine.company_id;
    const sourceIp = getRequestIp(request);

    // Rate limiting
    const rateKey = `${companyId}:${machineCode}:${esp32Id}:${sourceIp}`;
    if (!canAcceptHeartbeatRate(rateKey)) {
      return jsonResponse({ error: 'Rate limit exceeded' }, 429);
    }

    // Atualizar status
    const { error: updateError } = await supabase
      .from('machines')
      .update({
        sensor_last_heartbeat_at: nowIso(),
        sensor_status: 'online'
      })
      .eq('id', machine.id);

    if (updateError) {
      console.error('Erro ao atualizar heartbeat:', updateError);
    }

    return jsonResponse({
      ok: true,
      machine_id: machineCode,
      status: 'online'
    }, 200);

  } catch (error: any) {
    console.error('❌ Erro heartbeat:', error);
    return jsonResponse(
      { error: error.message || 'Internal server error' },
      500
    );
  }
}

export async function GET() {
  return jsonResponse(
    { error: 'Method not allowed' },
    405
  );
}
