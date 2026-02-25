// src/hooks/useAuthAdmin.js
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  ADMIN_EMAILS,
  PRODUCAO_EMAILS,
} from '../lib/constants'

export default function useAuthAdmin(){
  const [authUser, setAuthUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

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

  const hasAccess = useMemo(() => isAdmin || isProducao, [isAdmin, isProducao])

  return { authUser, authChecked, isAdmin, isProducao, hasAccess }
}
