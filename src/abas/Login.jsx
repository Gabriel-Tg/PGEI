// src/abas/Login.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function Login({
  onAuthenticated,
  authenticatedTitle = 'Você está autenticado',
  authenticatedDescription,
  showAdminShortcut = true,
  allowContinueWhenAuthenticated = true,
  tenantSubdomain = null,
  useUsernameLogin = false,
}) {
  const isMissingSessionError = (err) => String(err?.message || '').toLowerCase().includes('auth session missing')
  const shouldForcePasswordChange = (u) => Boolean(u?.user_metadata?.must_change_password)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordChangeError, setPasswordChangeError] = useState('')
  const [passwordChangeOk, setPasswordChangeOk] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (!active) return
        if (error) {
          if (!isMissingSessionError(error)) {
            setError(error.message)
          } else {
            setError(null)
          }
          setUser(null)
          return
        }
        setUser(data?.user ?? null)
      } catch {
        if (!active) return
        setError('Falha de conexão com o Supabase. Verifique a URL/chave do projeto no .env/.env.local e sua internet.')
        setUser(null)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  async function signIn(e) {
    e.preventDefault()
    setError(null)
    try {
      const id = String(identifier || '').trim().toLowerCase()
      if (!id || !password) {
        setError('Informe usuário e senha.')
        return
      }

      let loginEmail = id
      if (useUsernameLogin) {
        if (id.includes('@')) {
          loginEmail = id
        } else {
        const subdomain = String(tenantSubdomain || '').trim().toLowerCase()
        if (!subdomain) {
          setError('Não foi possível identificar a empresa para login por usuário.')
          return
        }

        const { data: resolved, error: resolveErr } = await supabase
          .rpc('resolve_company_user_login', {
            target_subdomain: subdomain,
            target_username: id,
          })
          .maybeSingle()

        if (resolveErr) {
          setError(resolveErr.message || 'Falha ao validar usuário.')
          return
        }

        loginEmail = String(resolved?.email || '').trim().toLowerCase()
        if (!loginEmail) {
          setError('Usuário ou senha inválidos.')
          return
        }
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password })
      if (error) { setError(error.message); return }
      setUser(data.user)
      if (!shouldForcePasswordChange(data?.user) && typeof onAuthenticated === 'function' && data?.user) {
        onAuthenticated(data.user)
      }
    } catch {
      setError('Falha de conexão com o Supabase. Verifique a URL/chave do projeto no .env/.env.local e sua internet.')
    }
  }

  async function changePasswordOnFirstLogin(event) {
    event.preventDefault()
    setPasswordChangeError('')
    setPasswordChangeOk('')

    if (!newPassword) {
      setPasswordChangeError('Informe a nova senha.')
      return
    }

    if (newPassword !== newPasswordConfirm) {
      setPasswordChangeError('A confirmação da senha não confere.')
      return
    }

    setChangingPassword(true)

    const payloadMetadata = {
      ...(user?.user_metadata || {}),
      must_change_password: false,
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
      data: payloadMetadata,
    })

    if (updateError) {
      setPasswordChangeError(updateError.message || 'Falha ao atualizar senha.')
      setChangingPassword(false)
      return
    }

    const { data: refreshed } = await supabase.auth.getUser()
    const refreshedUser = refreshed?.user || null
    setUser(refreshedUser)
    setPasswordChangeOk('Senha alterada com sucesso.')
    setChangingPassword(false)

    if (typeof onAuthenticated === 'function' && refreshedUser) {
      onAuthenticated(refreshedUser)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
  }

  if (loading) return <div style={{ padding: 24 }}>Verificando sessão…</div>

  if (user) {
    if (shouldForcePasswordChange(user)) {
      return (
        <div style={{ padding: 24, display: 'grid', gap: 12, maxWidth: 460 }}>
          <h2 style={{ margin: 0 }}>Troca de senha obrigatória</h2>
          <div>Este é seu primeiro acesso. Defina uma nova senha para continuar.</div>
          {passwordChangeError ? <div style={{ background: '#ffecec', color: '#a80000', padding: 10, borderRadius: 10 }}>{passwordChangeError}</div> : null}
          {passwordChangeOk ? <div style={{ background: '#eafff1', color: '#0a7a33', padding: 10, borderRadius: 10 }}>{passwordChangeOk}</div> : null}

          <form onSubmit={changePasswordOnFirstLogin} style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12 }}>Nova senha</span>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite sua nova senha"
                required
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12 }}>Confirmar nova senha</span>
              <input
                className="input"
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                placeholder="Confirme a nova senha"
                required
              />
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn primary" type="submit" disabled={changingPassword}>
                {changingPassword ? 'Salvando...' : 'Salvar nova senha'}
              </button>
              <button className="btn ghost" type="button" onClick={signOut} disabled={changingPassword}>Sair</button>
            </div>
          </form>
        </div>
      )
    }

    return (
      <div style={{ padding: 24, display: 'grid', gap: 12, maxWidth: 420 }}>
        <h2 style={{ margin: 0 }}>{authenticatedTitle}</h2>
        {authenticatedDescription ? <div>{authenticatedDescription}</div> : null}
        <div><b>Conta:</b> {user.email}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {showAdminShortcut ? (
            <button className="btn primary" onClick={() => { location.href = '/admin/itens' }}>
              Ir para Cadastro de Itens
            </button>
          ) : allowContinueWhenAuthenticated ? (
            <button className="btn primary" onClick={() => { if (typeof onAuthenticated === 'function') onAuthenticated(user) }}>
              Continuar
            </button>
          ) : null}
          <button className="btn ghost" onClick={signOut}>Sair</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, display: 'grid', gap: 12, maxWidth: 420 }}>
      <h2 style={{ margin: 0 }}>Entrar</h2>
      {error && <div style={{ background: '#ffecec', color: '#a80000', padding: 10, borderRadius: 10 }}>{error}</div>}
      <form onSubmit={signIn} style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12 }}>{useUsernameLogin ? 'Usuário ou E-mail' : 'E-mail'}</span>
          <input
            className="input"
            type={useUsernameLogin ? 'text' : 'email'}
            value={identifier}
            onChange={e=>setIdentifier(e.target.value)}
            placeholder={useUsernameLogin ? 'seu.usuario ou seu@email.com' : 'seu@email.com'}
            autoComplete={useUsernameLogin ? 'username' : 'email'}
            required
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12 }}>Senha</span>
          <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn primary" type="submit">Entrar</button>
        </div>
      </form>
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Precisa de acesso? Solicite ao administrador da sua empresa.
      </div>
    </div>
  )
}
