import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const ROLE_OPTIONS = [
  { value: 'tv', label: 'TV / Painel' },
  { value: 'operator', label: 'Operador' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'manager', label: 'Gerente' },
  { value: 'admin', label: 'Administrador' },
]

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
}

export default function Usuarios({ companyId = null, canManageUsers = false }) {
  const [users, setUsers] = useState([])
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [form, setForm] = useState({
    username: '',
    fullName: '',
    password: '',
    role: 'operator',
  })

  const canLoad = !!companyId && !!canManageUsers

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!active) return
      setCurrentUserId(data?.user?.id || null)
    })()

    return () => { active = false }
  }, [])

  function normalizeEdgeFunctionError(err) {
    const message = String(err?.message || '')
    const lower = message.toLowerCase()
    if (lower.includes('failed to send a request to the edge function')) {
      return 'Falha de integração: a função create-client-access-user não está publicada no Supabase (ou está inacessível). Faça o deploy da Edge Function e tente novamente.'
    }
    if (lower.includes('not found') || lower.includes('404')) {
      return 'A função create-client-access-user não foi encontrada no Supabase. Publique a Edge Function e tente novamente.'
    }
    return message || 'Falha ao criar usuário.'
  }

  async function loadUsers() {
    if (!canLoad) return
    setLoading(true)
    setError('')

    const { data, error: listErr } = await supabase
      .from('company_users')
      .select('id, user_id, username, full_name, role, active, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (listErr) {
      setError(listErr.message || 'Falha ao carregar usuários.')
      setUsers([])
    } else {
      setUsers(Array.isArray(data) ? data : [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
  }, [companyId, canManageUsers])

  const roleLabel = useMemo(() => {
    const map = {}
    ROLE_OPTIONS.forEach((item) => { map[item.value] = item.label })
    return map
  }, [])

  const protectedInitialAdminUserId = useMemo(() => {
    if (!Array.isArray(users) || users.length === 0) return null

    const adminsByOldest = [...users]
      .filter((item) => String(item?.role || '').toLowerCase() === 'admin')
      .sort((a, b) => {
        const aTime = new Date(a?.created_at || 0).getTime()
        const bTime = new Date(b?.created_at || 0).getTime()
        return aTime - bTime
      })

    if (adminsByOldest.length === 0) return null
    const target = adminsByOldest[0]
    return target?.user_id || target?.id || null
  }, [users])

  const visibleUsers = useMemo(() => {
    if (!protectedInitialAdminUserId) return users

    return users.filter((item) => {
      const referenceId = item?.user_id || item?.id
      if (!referenceId) return true
      if (referenceId !== protectedInitialAdminUserId) return true
      return referenceId === currentUserId
    })
  }, [currentUserId, protectedInitialAdminUserId, users])

  async function handleCreate(event) {
    event.preventDefault()
    if (!canLoad || saving) return

    const username = normalizeUsername(form.username)
    const fullName = String(form.fullName || '').trim()
    const password = String(form.password || '').trim()
    const role = String(form.role || 'operator').trim().toLowerCase()

    if (!username || !password) {
      setError('Informe usuário e senha.')
      return
    }

    setSaving(true)
    setError('')
    setOk('')

    const { data, error: fnErr } = await supabase.functions.invoke('create-client-access-user', {
      body: {
        clientId: companyId,
        username,
        fullName,
        password,
        role,
      },
    })

    if (fnErr) {
      setError(normalizeEdgeFunctionError(fnErr))
      setSaving(false)
      return
    }

    if (data?.error) {
      setError(String(data.error))
      setSaving(false)
      return
    }

    setOk('Usuário salvo com sucesso.')
    setForm({ username: '', fullName: '', password: '', role: 'operator' })
    await loadUsers()
    setSaving(false)
  }

  if (!canManageUsers) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Acesso negado</h2>
        <p>Seu perfil não possui permissão para gerenciar usuários.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Novo usuário da empresa</h3>
        <form onSubmit={handleCreate} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span>Usuário</span>
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: normalizeUsername(e.target.value) }))}
              placeholder="ex: joao.silva"
              required
            />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span>Nome completo</span>
            <input
              className="input"
              value={form.fullName}
              onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
              placeholder="Nome do colaborador"
            />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span>Nível de acesso</span>
            <select
              className="select"
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
            >
              {ROLE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span>Senha</span>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Defina a senha"
              required
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button className="btn primary" type="submit" disabled={saving || !companyId}>
              {saving ? 'Salvando...' : 'Criar usuário'}
            </button>
          </div>
        </form>

        {error ? <div style={{ marginTop: 10, color: '#a80000' }}>{error}</div> : null}
        {ok ? <div style={{ marginTop: 10, color: '#0a7a33' }}>{ok}</div> : null}
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Usuários da empresa</h3>
        {loading ? <div>Carregando usuários...</div> : null}
        {!loading && visibleUsers.length === 0 ? <div>Nenhum usuário disponível para gerenciamento.</div> : null}
        {!loading && visibleUsers.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 6px' }}>Usuário</th>
                  <th style={{ textAlign: 'left', padding: '8px 6px' }}>Nome</th>
                  <th style={{ textAlign: 'left', padding: '8px 6px' }}>Perfil</th>
                  <th style={{ textAlign: 'left', padding: '8px 6px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => (
                  <tr key={user.id}>
                    <td style={{ padding: '8px 6px' }}>{user.username || '-'}</td>
                    <td style={{ padding: '8px 6px' }}>{user.full_name || '-'}</td>
                    <td style={{ padding: '8px 6px' }}>{roleLabel[user.role] || user.role}</td>
                    <td style={{ padding: '8px 6px' }}>{user.active ? 'Ativo' : 'Inativo'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
