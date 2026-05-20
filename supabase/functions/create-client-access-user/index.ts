// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Role = 'admin' | 'manager' | 'supervisor' | 'operator' | 'tv'

type Payload = {
  clientId: string
  username: string
  password: string
  role?: string
  fullName?: string
}

function normalizeEmail(value: string | undefined) {
  return String(value || '').trim().toLowerCase()
}

function normalizeUsername(value: string | undefined) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
}

function generateSyntheticEmail(username: string, companyId: string) {
  const suffix = String(companyId || '').replace(/[^a-z0-9]/gi, '').slice(0, 10).toLowerCase() || 'tenant'
  return `${username}+${suffix}@users.argos.local`
}

function normalizeRole(value: string | undefined): Role {
  const role = String(value || '').trim().toLowerCase()
  if (role === 'admin') return 'admin'
  if (role === 'manager' || role === 'gestao') return 'manager'
  if (role === 'supervisor' || role === 'pcp') return 'supervisor'
  if (role === 'tv') return 'tv'
  if (role === 'operator' || role === 'fabrica') return 'operator'
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

function fail(error: string, status = 400) {
  return json({ ok: false, error, status }, 200)
}

async function createAuthUserWithRetry(
  admin: ReturnType<typeof createClient>,
  email: string,
  password: string,
  username: string,
  companyId: string,
) {
  const delays = [0, 400, 1000]
  let lastError: string | null = null

  for (const delay of delays) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        company_id: companyId,
        must_change_password: true,
      },
    })

    if (!error) return { ok: true, userId: data?.user?.id || null }

    const msg = String(error.message || '')
    const low = msg.toLowerCase()
    const already = low.includes('already registered') || low.includes('already been registered')
    const rateLimited = low.includes('email rate limit exceeded') || low.includes('rate limit') || low.includes('too many requests')
    if (already) return { ok: true, userId: null }
    if (rateLimited) return { ok: false, error: 'Limite temporário de criação de usuários no Supabase atingido. Aguarde alguns minutos e tente novamente.' }

    lastError = msg || 'Falha ao criar usuário no Auth.'
  }

  return { ok: false, error: lastError || 'Falha ao criar usuário no Auth.', userId: null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (req.method !== 'POST') return fail('Metodo nao permitido.', 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRole || !anonKey) {
    return fail('Ambiente invalido: segredos do Supabase ausentes.', 500)
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return fail('Payload JSON invalido.', 400)
  }

  const clientId = String(payload?.clientId || '').trim()
  const username = normalizeUsername(payload?.username)
  const fullName = String(payload?.fullName || '').trim()
  const password = String(payload?.password || '').trim()
  const role = normalizeRole(payload?.role)

  if (!clientId || !username || !password) {
    return fail('Campos obrigatorios: clientId, username e password.', 400)
  }

  if (username.length < 3) {
    return fail('Usuario invalido. Use ao menos 3 caracteres.', 400)
  }

  if (!password) {
    return fail('Senha obrigatoria.', 400)
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const authHeader = req.headers.get('Authorization') || ''
  const caller = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  })

  const { data: callerRoleData, error: callerRoleErr } = await caller
    .rpc('company_role_for_user', { target_company_id: clientId })

  const { data: platformAdminData } = await caller.rpc('is_platform_admin')
  const isPlatformAdmin = !!platformAdminData

  const callerRole = String(callerRoleData || '').toLowerCase()
  if (!isPlatformAdmin && (callerRoleErr || callerRole !== 'admin')) {
    return fail('Apenas administradores da empresa podem criar usuários.', 403)
  }

  const email = generateSyntheticEmail(username, clientId)

  const { data: existing, error: findErr } = await admin
    .from('company_users')
    .select('id, user_id, email')
    .eq('company_id', clientId)
    .eq('username', username)
    .limit(1)
    .maybeSingle()

  if (findErr) return fail(findErr.message || 'Falha ao consultar company_users.', 500)

  if (existing?.id) {
    let updateAuthErr: string | null = null
    if (existing.user_id) {
      const { error: authUpdErr } = await admin.auth.admin.updateUserById(existing.user_id, {
        password,
        user_metadata: {
          username,
          company_id: clientId,
          must_change_password: true,
        },
      })
      if (authUpdErr) updateAuthErr = authUpdErr.message || 'Falha ao atualizar senha no Auth.'
    }

    const { error: updErr } = await admin
      .from('company_users')
      .update({ email, username, full_name: fullName || null, role, active: true })
      .eq('id', existing.id)

    if (updErr) return fail(updErr.message || 'Falha ao atualizar company_users.', 500)
    if (updateAuthErr) return fail(updateAuthErr, 500)
    return json({ ok: true, updated: true, username })
  }

  const authResult = await createAuthUserWithRetry(admin, email, password, username, clientId)
  if (!authResult.ok) {
    return fail(authResult.error || 'Falha ao criar usuario no Auth.', 500)
  }

  let authUserId = authResult.userId
  if (!authUserId) {
    const { data: foundUsers, error: listErr } = await admin.auth.admin.listUsers()
    if (!listErr) {
      const found = (foundUsers?.users || []).find((u) => normalizeEmail(u.email) === email)
      authUserId = found?.id || null
    }
  }

  if (!authUserId) {
    return fail('Nao foi possivel resolver user_id do Auth para vinculo em company_users.', 500)
  }

  const { error: insErr } = await admin
    .from('company_users')
    .insert([{ company_id: clientId, user_id: authUserId, email, username, full_name: fullName || null, role, active: true }])

  if (insErr) return fail(insErr.message || 'Falha ao inserir company_users.', 500)

  return json({ ok: true, created: true, username })
})
