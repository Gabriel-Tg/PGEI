// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Role = 'admin' | 'manager' | 'operator'

type Payload = {
  clientId: string
  email: string
  password: string
  role?: string
}

function normalizeEmail(value: string | undefined) {
  return String(value || '').trim().toLowerCase()
}

function normalizeRole(value: string | undefined): Role {
  const role = String(value || '').trim().toLowerCase()
  if (role === 'admin' || role === 'manager' || role === 'operator') return role
  return 'operator'
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  })
}

function isStrongPassword(value: string) {
  if (value.length < 8) return false
  if (!/[A-Z]/.test(value)) return false
  if (!/[a-z]/.test(value)) return false
  return true
}

async function createAuthUserWithRetry(
  admin: ReturnType<typeof createClient>,
  email: string,
  password: string,
) {
  const delays = [0, 400, 1000]
  let lastError: string | null = null

  for (const delay of delays) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (!error) return { ok: true }

    const msg = String(error.message || '')
    const low = msg.toLowerCase()
    const already = low.includes('already registered') || low.includes('already been registered')
    const rateLimited = low.includes('email rate limit exceeded') || low.includes('rate limit') || low.includes('too many requests')
    if (already) return { ok: true }
    if (rateLimited) return { ok: false, error: 'Limite temporário de criação de usuários no Supabase atingido. Aguarde alguns minutos e tente novamente.' }

    lastError = msg || 'Falha ao criar usuário no Auth.'
  }

  return { ok: false, error: lastError || 'Falha ao criar usuário no Auth.' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRole) {
    return json({ error: 'Ambiente invalido: segredos do Supabase ausentes.' }, 500)
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Payload JSON invalido.' }, 400)
  }

  const clientId = String(payload?.clientId || '').trim()
  const email = normalizeEmail(payload?.email)
  const password = String(payload?.password || '').trim()
  const role = normalizeRole(payload?.role)

  if (!clientId || !email || !password) {
    return json({ error: 'Campos obrigatorios: clientId, email e password.' }, 400)
  }

  if (!email.includes('@')) {
    return json({ error: 'E-mail invalido.' }, 400)
  }

  if (!isStrongPassword(password)) {
    return json({ error: 'Senha fraca. Use ao menos 8 caracteres com maiuscula e minuscula.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { data: existing, error: findErr } = await admin
    .from('client_users')
    .select('id')
    .eq('client_id', clientId)
    .ilike('email', email)
    .limit(1)
    .maybeSingle()

  if (findErr) return json({ error: findErr.message || 'Falha ao consultar client_users.' }, 500)

  if (existing?.id) {
    const { error: updErr } = await admin
      .from('client_users')
      .update({ email, role, active: true })
      .eq('id', existing.id)

    if (updErr) return json({ error: updErr.message || 'Falha ao atualizar client_users.' }, 500)
    return json({ ok: true, updated: true })
  }

  const authResult = await createAuthUserWithRetry(admin, email, password)
  if (!authResult.ok) {
    return json({ error: authResult.error || 'Falha ao criar usuario no Auth.' }, 500)
  }

  const { error: insErr } = await admin
    .from('client_users')
    .insert([{ client_id: clientId, email, role, active: true }])

  if (insErr) return json({ error: insErr.message || 'Falha ao inserir client_users.' }, 500)

  return json({ ok: true, created: true })
})
