// src/hooks/useAuthAdmin.js
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  ADMIN_EMAILS,
  PRODUCAO_EMAILS,
} from '../domain/constants'
import {
  PERMISSIONS,
  USER_ROLES,
  normalizeUserRole,
  permissionSetForRole,
} from '../domain/rbac'

export default function useAuthAdmin(tenantCompanyId = null, { isDemoTenant = false } = {}){
  const [authUser, setAuthUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [tenantAccess, setTenantAccess] = useState(false)
  const [tenantRole, setTenantRole] = useState(null)
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
        setTenantRole(null)
        setTenantAccessChecked(false)
        return
      }

      if (!authUser) {
        setTenantAccess(false)
        setTenantRole(null)
        setTenantAccessChecked(true)
        return
      }

      if (isAdmin) {
        setTenantAccess(true)
        setTenantRole(USER_ROLES.ADMIN)
        setTenantAccessChecked(true)
        return
      }

      if (isDemoTenant) {
        const email = String(authUser?.email || '').trim().toLowerCase()
        setTenantAccess(!!email)
        setTenantRole(email ? USER_ROLES.MANAGER : null)
        setTenantAccessChecked(true)
        return
      }

      if (!tenantCompanyId) {
        setTenantAccess(isProducao)
        setTenantRole(isProducao ? USER_ROLES.OPERATOR : null)
        setTenantAccessChecked(true)
        return
      }

      const email = String(authUser?.email || '').trim().toLowerCase()
      const userId = String(authUser?.id || '').trim()
      if (!email) {
        setTenantAccess(false)
        setTenantRole(null)
        setTenantAccessChecked(true)
        return
      }

      let q = supabase
        .from('company_users')
        .select('id, role')
        .eq('company_id', tenantCompanyId)
        .eq('active', true)

      if (userId) {
        q = q.or(`user_id.eq.${userId},email.ilike.${email}`)
      } else {
        q = q.ilike('email', email)
      }

      const { data, error } = await q.limit(1).maybeSingle()

      if (cancelled) return

      if (error) {
        console.warn('Falha ao validar acesso por cliente:', error)
        setTenantAccess(false)
        setTenantRole(null)
        setTenantAccessChecked(true)
        return
      }

      setTenantAccess(!!data?.id)
      setTenantRole(data?.id ? normalizeUserRole(data?.role) : null)
      setTenantAccessChecked(true)
    }

    checkTenantAccess()
    return () => { cancelled = true }
  }, [authChecked, authUser, isAdmin, isProducao, isDemoTenant, tenantCompanyId])

  const hasAccess = useMemo(() => {
    if (isAdmin) return true
    return tenantAccess
  }, [isAdmin, tenantAccess])

  const accessLevel = useMemo(() => {
    if (isAdmin) return USER_ROLES.ADMIN
    return tenantRole
  }, [isAdmin, tenantRole])

  const permissions = useMemo(() => {
    const role = normalizeUserRole(accessLevel)
    const set = permissionSetForRole(role)
    const has = (perm) => set.has(perm)
    const isTv = role === USER_ROLES.TV
    const isOperator = role === USER_ROLES.OPERATOR
    const isSupervisor = role === USER_ROLES.SUPERVISOR
    const isManager = role === USER_ROLES.MANAGER
    const roleIsAdmin = role === USER_ROLES.ADMIN
    return {
      role,
      isTv,
      isOperator,
      isSupervisor,
      isManager,
      isAdmin: roleIsAdmin,
      hasPermission: has,
      canViewDashboard: has(PERMISSIONS.VIEW_DASHBOARD),
      canViewTvPanel: has(PERMISSIONS.VIEW_TV_PANEL),
      canViewReports: has(PERMISSIONS.VIEW_REPORTS),
      canRegisterProduction: has(PERMISSIONS.REGISTER_PRODUCTION),
      canMakeApontamentos: has(PERMISSIONS.MAKE_APONTAMENTOS),
      canReportStops: has(PERMISSIONS.REPORT_STOPS),
      canApproveOperational: has(PERMISSIONS.APPROVE_OPERATIONAL),
      canManageOperational: has(PERMISSIONS.MANAGE_OPERATIONAL),
      canCreateOrder: has(PERMISSIONS.CREATE_ORDER),
      canEditQueue: has(PERMISSIONS.REORDER_QUEUE),
      canEditOrder: has(PERMISSIONS.EDIT_ORDER),
      canViewRastreio: has(PERMISSIONS.VIEW_RASTREIO),
      canAccessGestao: has(PERMISSIONS.ACCESS_GESTAO),
      canManageMachines: has(PERMISSIONS.MANAGE_MACHINES),
      canManageUsers: has(PERMISSIONS.MANAGE_USERS),
      canManageCompanySettings: has(PERMISSIONS.MANAGE_COMPANY_SETTINGS),
      canManagePermissions: has(PERMISSIONS.MANAGE_PERMISSIONS),
      canManageCatalog: has(PERMISSIONS.MANAGE_CATALOG),
    }
  }, [accessLevel])

  return {
    authUser,
    authChecked,
    isAdmin: isAdmin || permissions.isAdmin,
    isProducao,
    hasAccess,
    tenantAccessChecked,
    tenantRole: accessLevel,
    permissions,
  }
}

