import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function getEnv(name, fallback = '') {
  return String(process.env[name] || fallback || '').trim()
}

export function getSupabaseAdmin() {
  const url = getEnv('SUPABASE_URL', getEnv('VITE_SUPABASE_URL'))
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY', getEnv('VITE_SUPABASE_SERVICE_ROLE_KEY'))
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

export function getRequestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
  if (forwarded) return forwarded.split(',')[0].trim()
  return String(req.headers['x-real-ip'] || req.socket?.remoteAddress || '')
}

export function readSensorToken(req) {
  return String(req.headers['x-sensor-token'] || req.headers.authorization || '')
    .replace(/^bearer\s+/i, '')
    .trim()
}

export function sha256(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex')
}

export function normalizeMachineCode(value) {
  return String(value || '').trim().toUpperCase()
}

export function normalizeEsp32Id(value) {
  return String(value || '').trim().toLowerCase()
}

export function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 1024 * 1024) {
        reject(new Error('Payload too large'))
      }
    })
    req.on('end', () => {
      if (!data) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(data))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

export function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export function isMethod(req, method) {
  return String(req.method || '').toUpperCase() === method
}

export async function resolveAuthorizedMachine({ supabase, machineCode, esp32Id, token }) {
  const tokenHash = sha256(token)
  let query = supabase
    .from('machines')
    .select('id, company_id, machine_code, machine_name, active, apontamento_tipo, esp32_id, sensor_token_hash, sensor_last_pulse_at, sensor_last_heartbeat_at, sensor_status, sensor_last_cycle_seconds, sensor_avg_cycle_seconds, sensor_cycle_count, sensor_auto_stopped, sensor_auto_stop_at, sensor_operation_mode, sensor_ignore_pulse_count')
    .eq('machine_code', machineCode)
    .eq('active', true)

  if (esp32Id) {
    query = query.eq('esp32_id', esp32Id)
  }

  const { data, error } = await query.limit(5)
  if (error) throw error

  const row = (data || []).find((m) => {
    if (!m?.sensor_token_hash) return false
    return m.sensor_token_hash === tokenHash
  })

  return row || null
}

export function parseProductCode(product) {
  const raw = String(product || '').trim()
  if (!raw) return ''
  return raw.split('-')[0]?.trim() || ''
}
