// src/hooks/useAuthAdmin.js
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  ADMIN_EMAILS,
  PRODUCAO_EMAILS,
} from '../lib/constants'

export default function useAuthAdmin(tenantClientId = null){
  const [authUser, setAuthUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [tenantAccess, setTenantAccess] = useState(false)
  const [tenantAccessChecked, setTenantAccessChecked] = useState(false)

  useEffect(() => {
    let active = true
    let authSubscription = null
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!active) return
      setAuthUser(data?.user ?? null)
      setAuthChecked(true)
    })()

    const { data: listenerData } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setAuthUser(session?.user ?? null)
      setAuthChecked(true)
    })
    authSubscription = listenerData?.subscription ?? null

    return () => {
      active = false
      try {
        authSubscription?.unsubscribe?.()
      } catch {
        // noop
      }
    }
  }, [])

  const isAdmin = useMemo(() => {
    const email = authUser?.email?.toLowerCase()
    return !!email && Array.isArray(ADMIN_EMAILS) && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email)
  }, [authUser])

  const isProducao = useMemo(() => {
    const email = authUser?.email?.toLowerCase()
    return !!email && Array.isArray(PRODUCAO_EMAILS) && PRODUCAO_EMAILS.map(e => e.toLowerCase()).includes(email)
  }, [authUser])

  useEffect(() => {
    let cancelled = false

    async function checkTenantAccess() {
      if (!authChecked) {
        setTenantAccess(false)
        setTenantAccessChecked(false)
        return
      }

      if (!authUser) {
        setTenantAccess(false)
        setTenantAccessChecked(true)
        return
      }

      if (isAdmin) {
        setTenantAccess(true)
        setTenantAccessChecked(true)
        return
      }

      if (!tenantClientId) {
        setTenantAccess(isProducao)
        setTenantAccessChecked(true)
        return
      }

      const email = String(authUser?.email || '').trim().toLowerCase()
      if (!email) {
        setTenantAccess(false)
        setTenantAccessChecked(true)
        return
      }

      const { data, error } = await supabase
        .from('client_users')
        .select('id')
        .eq('client_id', tenantClientId)
        .eq('active', true)
        .ilike('email', email)
        .limit(1)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        console.warn('Falha ao validar acesso por cliente:', error)
        setTenantAccess(false)
        setTenantAccessChecked(true)
        return
      }

      setTenantAccess(!!data?.id)
      setTenantAccessChecked(true)
    }

    checkTenantAccess()
    return () => { cancelled = true }
  }, [authChecked, authUser, isAdmin, isProducao, tenantClientId])

  const hasAccess = useMemo(() => {
    if (isAdmin) return true
    return tenantAccess
  }, [isAdmin, tenantAccess])

  return { authUser, authChecked, isAdmin, isProducao, hasAccess, tenantAccessChecked }
}
