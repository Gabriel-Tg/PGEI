import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { DndContext, useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core'
import { useLocation, useNavigate } from 'react-router-dom'

import { MAQUINAS } from './domain/constants'
import CadastroItens from './abas/CadastroItens'
import Login from './abas/Login'
import Painel from './abas/Painel'
import Lista from './abas/Lista'
import NovaOrdem from './abas/NovaOrdem'
import Rastreio from './abas/Rastreio'
import Estoque from './abas/Estoque'
import PainelTV from './abas/PainelTV'
import Tablets from './pages/Tablets'
import Ficha from './pages/Ficha'
import Prioridade from './pages/Prioridade'
import useOrders from './hooks/useOrders'
import useAuthAdmin from './hooks/useAuthAdmin'
import GlobalModals from './components/GlobalModals'
import TabTransition, { getTabDirection } from './components/TabTransition'
import Apontamento from './abas/Apontamento'
import Usuarios from './abas/Usuarios'
import { DateTime } from 'luxon'
import SiteApp from './site/SiteApp'
import AdminPanel from './admin/AdminPanel'
import { supabase } from './lib/supabaseClient'
import { canAccessPath } from './domain/rbac'

export default function App() {
  const [loadingTenant, setLoadingTenant] = useState(true)
  const [tenantCompany, setTenantCompany] = useState(null)

  const hostname = String(window.location.hostname || '').toLowerCase()
  const adminHosts = new Set(['painel.localhost', 'painel.techargos.com.br'])
  const isAdminHost = adminHosts.has(hostname)

  function normalizeTenantKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('.')[0]
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  useEffect(() => {
    let cancelled = false

    async function resolveTenant() {
      setLoadingTenant(true)
      if (isAdminHost) {
        if (!cancelled) {
          setTenantCompany(null)
          setLoadingTenant(false)
        }
        return
      }

      const labels = hostname.split('.')
      const subdomain = labels[0] || ''
      const normalizedSubdomain = normalizeTenantKey(subdomain)
      const isProdTenantDomain = hostname.endsWith('.techargos.com.br') && labels.length >= 4
      const isLocalTenantDomain = hostname.endsWith('.localhost') && labels.length >= 2
      const isTenantDomain = (isProdTenantDomain || isLocalTenantDomain) && subdomain && !['www', 'painel'].includes(subdomain)

      if (!isTenantDomain) {
        if (!cancelled) {
          setTenantCompany(null)
          setLoadingTenant(false)
        }
        return
      }

      let tenantData = null

      if (normalizedSubdomain) {
        const { data: resolvedData, error: resolveErr } = await supabase
          .rpc('resolve_public_company_by_subdomain', { target_subdomain: normalizedSubdomain })
          .maybeSingle()

        tenantData = resolvedData || null

        // fallback para ambientes onde a função ainda não foi aplicada no banco
        if (!tenantData && resolveErr) {
          const { data } = await supabase
            .from('companies')
            .select('id, name, slug, subdomain, is_demo, active')
            .or(`subdomain.ilike.${normalizedSubdomain},slug.ilike.${normalizedSubdomain}`)
            .eq('active', true)
            .maybeSingle()

          tenantData = data || null
        }
      }

      if (!cancelled) {
        setTenantCompany(tenantData)
        setLoadingTenant(false)
      }
    }

    resolveTenant()
    return () => { cancelled = true }
  }, [hostname, isAdminHost])

  if (isAdminHost) {
    return <AdminPanel />
  }

  if (loadingTenant) {
    return <div style={{ padding: 20 }}>Carregando ambiente...</div>
  }

  if (tenantCompany) {
    return <TenantApp tenantCompany={tenantCompany} />
  }

  return <SiteApp />
}

function TenantApp({ tenantCompany = null }){
  const [tab, setTab] = useState('login')
  const [tabDirection, setTabDirection] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [nowLabel, setNowLabel] = useState(() => DateTime.now().setZone('America/Sao_Paulo').toFormat('dd/LL/yyyy HH:mm:ss'))
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 5 }})
  const touchSensor = useSensor(TouchSensor, { pressDelay: 150, activationConstraint: { distance: 5 }})
  const sensors = useSensors(mouseSensor, touchSensor)

  const [form,setForm] = useState({
    code:'', customer:'', product:'', color:'', qty:'', boxes:'', standard:'', due_date:'', notes:'', machine_id:'P1'
  })

  const [editando,setEditando] = useState(null)
  const [finalizando,setFinalizando] = useState(null)
  const [confirmData, setConfirmData] = useState({por:'', data:'', hora:''})

  const [startModal, setStartModal]   = useState(null)
  const [stopModal, setStopModal]     = useState(null)
  const [resumeModal, setResumeModal] = useState(null)
  const [lowEffModal, setLowEffModal] = useState(null)
  const [lowEffEndModal, setLowEffEndModal] = useState(null)

  const [tick, setTick] = useState(0)
  useEffect(()=>{ const id=setInterval(()=>setTick(t=>t+1),1000); return ()=>clearInterval(id) },[])

  useEffect(() => {
    const id = setInterval(() => {
      setNowLabel(DateTime.now().setZone('America/Sao_Paulo').toFormat('dd/LL/yyyy HH:mm:ss'))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const [openSet, setOpenSet] = useState(()=>new Set())
  function toggleOpen(id){ setOpenSet(prev=>{ const n=new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n }) }

  const [machinePriorities, setMachinePriorities] = useState({})
  const [prioritiesLoading, setPrioritiesLoading] = useState(false)
  const [tenantMachines, setTenantMachines] = useState([])
  const [machinesLoading, setMachinesLoading] = useState(false)
  const [machinesResolved, setMachinesResolved] = useState(false)
  const tenantCompanyId = tenantCompany?.id || null
  const machineIds = useMemo(() => {
    if (!tenantCompanyId) return MAQUINAS
    return tenantMachines
      .map((m) => String(m.machine_code || '').toUpperCase())
      .filter(Boolean)
  }, [tenantCompanyId, tenantMachines])
  const tenantMachinesReady = !tenantCompanyId || machinesResolved

  const { authUser, authChecked, isAdmin, hasAccess, tenantAccessChecked, permissions } = useAuthAdmin(tenantCompanyId)
  const canViewDashboard = !!authUser && !!permissions?.canViewDashboard
  const canUseProduction = !!permissions?.canRegisterProduction
  const canMakeApontamentos = !!permissions?.canMakeApontamentos
  const canApproveOperational = !!permissions?.canApproveOperational
  const hasGestaoAccess = !!authUser && !!permissions?.canAccessGestao
  const canCreateOrder = !!permissions?.canCreateOrder
  const canEditQueue = !!permissions?.canEditQueue
  const canEditOrder = !!permissions?.canEditOrder
  const canViewRastreio = !!permissions?.canViewRastreio
  const canManageCatalog = !!permissions?.canManageCatalog
  const canManageUsers = !!permissions?.canManageUsers
  const canViewTvPanel = !!permissions?.canViewTvPanel
  const canManageOperational = !!permissions?.canManageOperational
  const canAccessList = canUseProduction || canApproveOperational || canManageOperational
  const isTvOnly = !!permissions?.isTv
  const mustChangePassword = !!authUser?.user_metadata?.must_change_password

  const tabNavOrder = useMemo(() => {
    const ids = []
    if (canViewDashboard) ids.push('painel')
    if (canAccessList) ids.push('lista')
    if (canMakeApontamentos) ids.push('apontamento')
    if (canCreateOrder) ids.push('nova')
    if (canViewRastreio) ids.push('rastreio')
    if (hasGestaoAccess) ids.push('estoque')
    if (canManageUsers) ids.push('usuarios')
    if (canManageCatalog) ids.push('admin-itens')
    return ids
  }, [canAccessList, canCreateOrder, canMakeApontamentos, canManageCatalog, canManageUsers, canViewDashboard, canViewRastreio, hasGestaoAccess])

  const tabItems = useMemo(() => {
    const items = []
    if (canViewDashboard) items.push({ id: 'painel', label: 'Dashboard', icon: 'dashboard' })
    if (canAccessList) items.push({ id: 'lista', label: 'Painel', icon: 'production' })
    if (canMakeApontamentos) items.push({ id: 'apontamento', label: 'Apontamento', icon: 'apontamento' })
    if (canCreateOrder) items.push({ id: 'nova', label: 'Ordens', icon: 'orders' })
    if (canViewRastreio) items.push({ id: 'rastreio', label: 'Rastreio', icon: 'tracking' })
    if (hasGestaoAccess) items.push({ id: 'estoque', label: 'Estoque', icon: 'inventory' })
    if (canManageUsers) items.push({ id: 'usuarios', label: 'Configurações', icon: 'settings' })
    if (canManageCatalog) items.push({ id: 'admin-itens', label: 'Cadastro Itens', icon: 'catalog' })
    return items
  }, [canAccessList, canCreateOrder, canMakeApontamentos, canManageCatalog, canManageUsers, canViewDashboard, canViewRastreio, hasGestaoAccess])

  const mobileTabItems = useMemo(() => {
    const preferredOrder = ['painel', 'lista', 'apontamento', 'nova', 'usuarios']
    const byId = new Map(tabItems.map((item) => [item.id, item]))
    const preferred = preferredOrder
      .map((id) => byId.get(id))
      .filter(Boolean)

    return preferred.length > 0 ? preferred : tabItems.slice(0, 5)
  }, [tabItems])

  const currentTabLabel = useMemo(() => {
    if (tab === 'admin-itens') return 'Cadastro de Itens'
    if (tab === 'apontamento') return 'Apontamento'
    const current = tabItems.find((item) => item.id === tab)
    return current?.label || 'Painel'
  }, [tab, tabItems])

  const goToTab = useCallback((next) => {
    setTab((current) => {
      if (current !== next) {
        setTabDirection(getTabDirection(current, next, tabNavOrder))
      }
      return next
    })
  }, [tabNavOrder])

  const setTabInstant = useCallback((next) => {
    setTabDirection(0)
    setTab(next)
  }, [])

  const renderNavIcon = (iconName) => {
    const commonProps = {
      width: 18,
      height: 18,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    }

    switch (iconName) {
      case 'dashboard':
        return (
          <svg {...commonProps}>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        )
      case 'production':
        return (
          <svg {...commonProps}>
            <path d="M4 20h16V10H4v10z" />
            <path d="M4 10l6-4v4" />
            <path d="M14 10V4l6 4" />
            <path d="M7 20V13h3v7" />
          </svg>
        )
      case 'apontamento':
        return (
          <svg {...commonProps}>
            <path d="M4 20h16" />
            <path d="M7 17.5 16.5 8" />
            <path d="M17.5 6.5 15.5 8.5 13.5 6.5 15.5 4.5 17.5 6.5Z" />
          </svg>
        )
      case 'orders':
        return (
          <svg {...commonProps}>
            <path d="M3 8.5h18v10H3z" />
            <path d="M3 8.5 12 3l9 5.5" />
            <path d="M12 3v10" />
          </svg>
        )
      case 'tracking':
        return (
          <svg {...commonProps}>
            <circle cx="11" cy="11" r="6" />
            <path d="M16 16l4 4" />
          </svg>
        )
      case 'management':
        return (
          <svg {...commonProps}>
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a7.9 7.9 0 0 0 .2-1.5 7.9 7.9 0 0 0-.2-1.5" />
            <path d="M4.6 15a7.9 7.9 0 0 1-.2-1.5 7.9 7.9 0 0 1 .2-1.5" />
            <path d="M12 4.6V3" />
            <path d="M12 21v-1.6" />
            <path d="M18.3 6.7l1.1-1.1" />
            <path d="M4.6 19.4l1.1-1.1" />
          </svg>
        )
      case 'inventory':
        return (
          <svg {...commonProps}>
            <rect x="4" y="6" width="16" height="12" rx="2" />
            <path d="M4 10h16" />
            <path d="M9 6v12" />
          </svg>
        )
      case 'settings':
        return (
          <svg {...commonProps}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a7.9 7.9 0 0 0 .2-1.5 7.9 7.9 0 0 0-.2-1.5" />
            <path d="M4.6 15a7.9 7.9 0 0 1-.2-1.5 7.9 7.9 0 0 1 .2-1.5" />
            <path d="M12 4.6V3" />
            <path d="M12 21v-1.6" />
          </svg>
        )
      case 'users':
        return (
          <svg {...commonProps}>
            <path d="M7 9a3 3 0 1 1 6 0 3 3 0 0 1-6 0Z" />
            <path d="M4 20c0-3 2.5-5 5.5-5h5c3 0 5.5 2 5.5 5" />
          </svg>
        )
      case 'catalog':
        return (
          <svg {...commonProps}>
            <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
            <path d="M7 9h10" />
            <path d="M10 13h4" />
          </svg>
        )
      case 'logout':
        return (
          <svg {...commonProps}>
            <path d="M9 8l-4 4 4 4" />
            <path d="M5 12h11" />
            <path d="M16 6v12" />
          </svg>
        )
      default:
        return (
          <svg {...commonProps}>
            <circle cx="12" cy="12" r="9" />
          </svg>
        )
    }
  }

  const {
    orders, stops,
    fetchOpenOrders,
    fetchFinalizedOrders, fetchStops,
    createOrder, updateOrder, sendToQueue, finalizeOrder,
    confirmStart, confirmStop, confirmResume, confirmLowEfficiency, confirmEndLowEfficiency,
    activeByMachine, orderRecordGroups, lastFinalizedByMachine, onStatusChange
  } = useOrders(tenantCompanyId)
  const ativosPorMaquina = activeByMachine || {}

  useEffect(() => {
    if (!authChecked || !tenantAccessChecked || !authUser || !hasAccess) return
    fetchOpenOrders()
    fetchFinalizedOrders()
    fetchStops()
  }, [authChecked, tenantAccessChecked, authUser, hasAccess, tenantCompanyId])

  useEffect(() => {
    if (!authChecked || !tenantAccessChecked || !authUser || !hasAccess) return
    if (tab !== 'painel') return
    fetchOpenOrders()
  }, [tab, authChecked, tenantAccessChecked, authUser, hasAccess, tenantCompanyId])

  useEffect(()=>{
     const nowBR = DateTime.now().setZone('America/Sao_Paulo')
    setConfirmData({
    por: '',
    data: nowBR.toISODate(),
    hora: nowBR.toFormat('HH:mm')
    })
  }, [finalizando?.id])

  const location = useLocation()
  const navigate = useNavigate()

  function getDefaultRouteSlug(machineCode) {
    const m = String(machineCode || '').toUpperCase().match(/^P(\d+)$/)
    if (m) return `pet-${String(Number(m[1])).padStart(2, '0')}`
    return String(machineCode || '').trim().toLowerCase()
  }

  function normalizeRouteSlug(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^\/+/, '')
  }

  useEffect(() => {
    let cancelled = false

    async function loadTenantMachines() {
      setMachinesResolved(false)
      if (!tenantCompanyId) {
        setTenantMachines([])
        setMachinesResolved(true)
        return
      }

      setMachinesLoading(true)
      const { data, error } = await supabase
        .from('machines')
        .select('id, company_id, machine_code, route_slug, active')
        .eq('company_id', tenantCompanyId)
        .eq('active', true)
        .order('machine_code', { ascending: true })

      if (cancelled) return

      if (error) {
        console.warn('Falha ao carregar máquinas do cliente:', error)
        setTenantMachines([])
      } else {
        setTenantMachines(Array.isArray(data) ? data : [])
      }
      setMachinesLoading(false)
      setMachinesResolved(true)
    }

    loadTenantMachines()
    return () => { cancelled = true }
  }, [tenantCompanyId])

  useEffect(() => {
    async function loadPriorities() {
      setPrioritiesLoading(true)
      try {
        let q = supabase
          .from('machine_priorities')
          .select('machine_id, priority')
          .order('machine_id', { ascending: true })

        if (tenantCompanyId) q = q.eq('company_id', tenantCompanyId)

        const { data, error } = await q

        if (!error && Array.isArray(data)) {
          const mapped = {}
          data.forEach((row) => {
            const key = String(row.machine_id || '').toUpperCase()
            const val = row.priority == null ? null : Number(row.priority)
            if (key) mapped[key] = Number.isFinite(val) ? val : null
          })
          setMachinePriorities(mapped)
        } else if (error) {
          console.warn('Falha ao carregar prioridades:', error)
        }
      } catch (err) {
        console.warn('Erro ao buscar prioridades:', err)
      } finally {
        setPrioritiesLoading(false)
      }
    }

    loadPriorities()

    const channel = supabase
      .channel('machine-priorities')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'machine_priorities' },
        (payload) => {
          const row = payload.new || payload.old
          if (!row) return
          if (tenantCompanyId && row.company_id !== tenantCompanyId) return
          setMachinePriorities((prev) => {
            const next = { ...prev }
            if (payload.eventType === 'DELETE') {
              delete next[String(row.machine_id || '').toUpperCase()]
            } else {
              const key = String(row.machine_id || '').toUpperCase()
              const val = row.priority == null ? null : Number(row.priority)
              if (key) next[key] = Number.isFinite(val) ? val : null
            }
            return next
          })
        }
      )
      .subscribe()

    return () => {
      try {
        supabase.removeChannel(channel)
      } catch (err) {
        console.warn('Falha ao remover canal de prioridades:', err)
      }
    }
  }, [tenantCompanyId])

  async function handlePriorityChange(machineId, priorityValue) {
    if (!canManageOperational) {
      alert('Seu perfil não possui permissão para alterar prioridades.')
      return
    }
    try {
      const val = priorityValue === '' || priorityValue == null ? null : Number(priorityValue)
      const payload = {
        ...(tenantCompanyId ? { company_id: tenantCompanyId } : {}),
        machine_id: machineId,
        priority: val,
        updated_by: authUser?.email || null,
      }
      const { data, error } = await supabase.from('machine_priorities').upsert(payload).select()
      if (error) {
        alert('Não foi possível salvar a prioridade agora.')
        console.warn('Erro ao salvar prioridade:', error)
        return
      }
      if (data && data[0]) {
        const key = String(machineId || '').toUpperCase()
        const valNum = data[0].priority == null ? null : Number(data[0].priority)
        setMachinePriorities((prev) => ({ ...prev, [key]: Number.isFinite(valNum) ? valNum : null }))
      }
    } catch (err) {
      alert('Erro ao salvar prioridade.')
      console.warn('Erro ao salvar prioridade:', err)
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      const key = String(e.key).toLowerCase()
      if (key === 'l') {
        e.preventDefault()
        goToTab('apontamento')
      } else if (key === 'i') {
        e.preventDefault()
        goToTab('admin-itens')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goToTab])

  async function handleStatusChange(ordem, targetStatus){
    const res = await onStatusChange(ordem, targetStatus)
    if (!res) return
    if (res.action === 'alert') {
      alert(res.message)
      return
    }
    if (res.action === 'openLowEffModal') {
      setLowEffModal(res.payload); return
    }
    if (res.action === 'openLowEffEndModal') {
      setLowEffEndModal(res.payload); return
    }
    if (res.action === 'openStopModal') {
      setStopModal(res.payload); return
    }
    if (res.action === 'openResumeModal') {
      setResumeModal(res.payload); return
    }
    return
  }

  useEffect(() => {
    if (!authChecked) return
    if (!authUser && tab !== 'login') {
      setTabInstant('login')
      return
    }
    if (!authUser) return

    if (!hasAccess) {
      setTabInstant('login')
      return
    }

    if (mustChangePassword) {
      if (tab !== 'login') setTabInstant('login')
      return
    }

    if (tab === 'login') {
      goToTab('painel')
      return
    }

    if (!canViewDashboard && tab === 'painel') {
      setTabInstant('login')
      return
    }

    if (!canAccessList && tab === 'lista') {
      setTabInstant('painel')
      return
    }

    if (!canMakeApontamentos && tab === 'apontamento') {
      setTabInstant('painel')
      return
    }

    if (!canCreateOrder && tab === 'nova') {
      setTabInstant('painel')
      return
    }

    if (!canViewRastreio && tab === 'rastreio') {
      setTabInstant('painel')
      return
    }

    if (!hasGestaoAccess && tab === 'estoque') {
      setTabInstant('painel')
      return
    }

    if (!canManageUsers && tab === 'usuarios') {
      setTabInstant('painel')
      return
    }

    if (!canManageCatalog && tab === 'admin-itens') {
      setTabInstant('painel')
    }
  }, [authChecked, authUser, tab, hasAccess, mustChangePassword, canAccessList, canCreateOrder, canMakeApontamentos, canManageCatalog, canManageUsers, canViewDashboard, canViewRastreio, hasGestaoAccess, goToTab, setTabInstant])

  async function handleSignOut() {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.warn('Falha ao encerrar sessão:', err)
    } finally {
      setTabInstant('login')
    }
  }

  function handleLoginSuccess(user) {
    if (!user) return
    if (user?.user_metadata?.must_change_password) {
      setTabInstant('login')
      return
    }
    goToTab('painel')
  }

  function renderBrandBar(subtitle) {
    return (
      <div className="brand-bar">
        <img
          src="/Argos sem fundo.png"
          alt="ARGOS"
          className="brand-logo"
          onError={(e)=>{ e.currentTarget.src='/ARGOS.png' }}
        />
        <div className="brand-titles">
          <h1 className="brand-title">Gestão de Eficiência Industrial</h1>
          <div className="brand-sub">{subtitle}</div>
        </div>
      </div>
    )
  }

  const hasTenantRouteAccess = !!authUser && tenantAccessChecked && hasAccess && !mustChangePassword
  const hasPathPermission = canAccessPath(location?.pathname, {
    has: (perm) => !!permissions?.hasPermission?.(perm),
  })

  function renderTenantAccessRequired() {
    const accessDenied = !!authUser && tenantAccessChecked && !hasAccess
    return (
      <div className="app">
        {renderBrandBar('Acesso restrito ao cliente')}
        {accessDenied ? (
          <div style={{ maxWidth: 520, margin: '16px auto', padding: '0 16px' }}>
            <div style={{ background: '#ffecec', color: '#a80000', padding: 10, borderRadius: 10 }}>
              Este usuário não possui acesso ativo para este cliente.
            </div>
          </div>
        ) : null}
        <Login
          onAuthenticated={handleLoginSuccess}
          showAdminShortcut={false}
          tenantSubdomain={tenantCompany?.subdomain || null}
          useUsernameLogin={!!tenantCompany?.subdomain}
        />
      </div>
    )
  }

  if (location && location.pathname === '/login') {
    return (
      <div className="app">
        {renderBrandBar('Acesso Admin')}
        <Login
          tenantSubdomain={tenantCompany?.subdomain || null}
          useUsernameLogin={!!tenantCompany?.subdomain}
        />
      </div>
    )
  }

  if (location && location.pathname === '/ficha') {
    if (!hasTenantRouteAccess || !hasPathPermission) return renderTenantAccessRequired()
    return (
      <div className="app">
        {renderBrandBar('Ficha Técnica Digital')}
        <Ficha />
      </div>
    )
  }

  if (location && location.pathname === '/indicadores') {
    if (!hasTenantRouteAccess || !hasPathPermission) return renderTenantAccessRequired()
    return (
      <div className="app">
        {renderBrandBar('Indicadores por Setor')}
        <Indicadores />
      </div>
    )
  }
  const pathName = String(location?.pathname || '').toLowerCase()
  const machineSlug = pathName.match(/^\/([a-z0-9-]+)$/)?.[1] || null
  const reservedRoutes = new Set(['login', 'ficha', 'indicadores', 'prioridade', 'tv'])
  const isMachineRoute = !!machineSlug && !reservedRoutes.has(machineSlug)

  const resolvedMachine = isMachineRoute
    ? tenantMachines.find((m) => {
        const slug = normalizeRouteSlug(m.route_slug) || normalizeRouteSlug(getDefaultRouteSlug(m.machine_code))
        return slug === normalizeRouteSlug(machineSlug)
      })
    : null

  const invalidMachineRoute = isMachineRoute && machinesResolved && !resolvedMachine

  useEffect(() => {
    if (!invalidMachineRoute) return
    setTabInstant('painel')
    navigate('/', { replace: true })
  }, [invalidMachineRoute, navigate])

  if (isMachineRoute) {
    if (!hasTenantRouteAccess || !canUseProduction) return renderTenantAccessRequired()
    if (machinesLoading) {
      return <div className="app" style={{ padding: 24 }}>Carregando máquina...</div>
    }
    if (!resolvedMachine) {
      return null
    }

    const machineId = String(resolvedMachine.machine_code || '').toUpperCase()
    const ativosMaquina = orders.filter(o => o.machine_id === machineId && !o.finalized).sort((a,b)=>(a.pos??999)-(b.pos??999))
    return (
      <>
        <Tablets
          registroGrupos={orderRecordGroups}
          ativosP1={ativosMaquina}
          machineId={machineId}
          clientId={tenantCompanyId}
          tick={tick}
          paradas={stops}
          onStatusChange={handleStatusChange}
          setStartModal={setStartModal}
          setStopModal={setStopModal}
          setLowEffModal={setLowEffModal}
          setLowEffEndModal={setLowEffEndModal}
          setResumeModal={setResumeModal}
          setFinalizando={setFinalizando}
          setEditando={setEditando}
        />
        <GlobalModals
          editando={editando} setEditando={setEditando}
          finalizando={finalizando} setFinalizando={setFinalizando} confirmData={confirmData} setConfirmData={setConfirmData}
          startModal={startModal} setStartModal={setStartModal}
          stopModal={stopModal} setStopModal={setStopModal}
          resumeModal={resumeModal} setResumeModal={setResumeModal}
          lowEffModal={lowEffModal} setLowEffModal={setLowEffModal}
          lowEffEndModal={lowEffEndModal} setLowEffEndModal={setLowEffEndModal}
          onUpdateOrder={updateOrder}
          onFinalize={finalizeOrder}
          onConfirmStart={confirmStart}
          onConfirmStop={confirmStop}
          onConfirmResume={confirmResume}
          onConfirmLowEffStart={confirmLowEfficiency}
          onConfirmLowEffEnd={confirmEndLowEfficiency}
        />
      </>
    )
  }

  if (location && location.pathname === '/prioridade') {
    if (!hasTenantRouteAccess || !canManageOperational) return renderTenantAccessRequired()
    return (
      <div className="app">
        <Prioridade
          machinePriorities={machinePriorities}
          onChangePriority={handlePriorityChange}
          loading={prioritiesLoading}
          authUser={authUser}
        />
      </div>
    )
  }

  if (location && String(location.pathname || '').toLowerCase() === '/tv') {
    if (!hasTenantRouteAccess || !canViewTvPanel) return renderTenantAccessRequired()
    if (!tenantMachinesReady) {
      return <div className="app" style={{ padding: 24 }}>Carregando maquinas...</div>
    }

    return (
      <div className="app" style={{ padding: 0 }}>
        <PainelTV
          ativosPorMaquina={ativosPorMaquina}
          machineIds={machineIds}
          paradas={stops}
          tick={tick}
          lastFinalizadoPorMaquina={lastFinalizedByMachine}
        />
      </div>
    )
  }

  function renderTabContent() {
    if (tab === 'login') {
      return (
        <Login
          onAuthenticated={handleLoginSuccess}
          tenantSubdomain={tenantCompany?.subdomain || null}
          useUsernameLogin={!!tenantCompany?.subdomain}
          authenticatedTitle={authUser && tenantAccessChecked && !hasAccess ? 'Acesso negado' : 'Acesso liberado'}
          authenticatedDescription={authUser && tenantAccessChecked && !hasAccess
            ? 'Este usuário não possui acesso para este cliente.'
            : 'Clique em Continuar para abrir seu ambiente.'}
          showAdminShortcut={false}
          allowContinueWhenAuthenticated={!authUser || !tenantAccessChecked || hasAccess}
        />
      )
    }

    if (tab === 'admin-itens') {
      if (!authChecked) {
        return <div style={{ padding: 16 }}><small>Verificando permissões…</small></div>
      }
      if (!canManageCatalog) {
        return (
          <div style={{ padding: 24 }}>
            <h2>Acesso Negado</h2>
            <p>Esta página não está disponível.</p>
          </div>
        )
      }
      return <CadastroItens clientId={tenantCompanyId} canManage={canManageCatalog} />
    }

    if (tab === 'painel' && tenantAccessChecked && hasAccess && canViewDashboard) {
      if (!tenantMachinesReady) {
        return <div style={{ padding: 16 }}><small>Carregando maquinas do cliente...</small></div>
      }
      return (
          <Painel
            ativosPorMaquina={ativosPorMaquina}
            machineIds={machineIds}
            paradas={stops}
            tick={tick}
            onStatusChange={handleStatusChange}
            setStartModal={setStartModal}
            setFinalizando={setFinalizando}
            lastFinalizadoPorMaquina={lastFinalizedByMachine}
            onScanned={fetchOpenOrders}
            authUser={authUser}
            machinePriorities={machinePriorities}
            clientId={tenantCompanyId}
            readOnly={isTvOnly}
          />
      )
    }

    if (tab === 'lista' && tenantAccessChecked && hasAccess && canAccessList) {
      if (!tenantMachinesReady) {
        return <div style={{ padding: 16 }}><small>Carregando maquinas do cliente...</small></div>
      }
      return (
        <Lista
          ativosPorMaquina={ativosPorMaquina}
          machineIds={machineIds}
          sensors={sensors}
          onStatusChange={handleStatusChange}
          setStartModal={setStartModal}
          setEditando={setEditando}
          setFinalizando={setFinalizando}
          enviarParaFila={sendToQueue}
          refreshOrdens={fetchOpenOrders}
          isAdmin={canEditOrder}
          canReorder={canEditQueue}
          canEditOrder={canEditOrder}
          clientId={tenantCompanyId}
        />
      )
    }

    if (tab === 'nova' && canCreateOrder) {
      if (!tenantMachinesReady) {
        return <div style={{ padding: 16 }}><small>Carregando maquinas do cliente...</small></div>
      }
      return (
        <NovaOrdem
          form={form}
          setForm={setForm}
          criarOrdem={() => createOrder(form, setForm, goToTab)}
          clientId={tenantCompanyId}
          machineIds={machineIds}
        />
      )
    }

    if (tab === 'rastreio' && canViewRastreio) {
      return <Rastreio clientId={tenantCompanyId} />
    }

    if (tab === 'apontamento' && tenantAccessChecked && hasAccess && canMakeApontamentos) {
      if (!tenantMachinesReady) {
        return <div style={{ padding: 16 }}><small>Carregando maquinas do cliente...</small></div>
      }
      return <Apontamento isAdmin={isAdmin} clientId={tenantCompanyId} machineIds={machineIds} />
    }

if (tab === 'estoque' && hasGestaoAccess) {
      if (!tenantMachinesReady) {
        return <div style={{ padding: 16 }}><small>Carregando maquinas do cliente...</small></div>
      }
      return <Estoque clientId={tenantCompanyId} machineIds={machineIds} />
    }

    if (tab === 'usuarios' && canManageUsers) {
      return <Usuarios companyId={tenantCompanyId} canManageUsers={canManageUsers} />
    }

    return null
  }

  const showDashboardShell = authUser && tenantAccessChecked && hasAccess && !mustChangePassword && tab !== 'login'

  return (
    <div className="app">
      {showDashboardShell ? (
        <div className={`dashboard-shell ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
          <aside className="dashboard-sidebar" aria-label="Menu principal">
            <div className="sidebar-brand">
              <img
                src="/Argos sem fundo.png"
                alt="ARGOS"
                className="sidebar-logo"
                onError={(e)=>{ e.currentTarget.src='/ARGOS.png' }}
              />
              {!sidebarCollapsed && (
                <div className="sidebar-brand-text">
                  <strong>ARGOS</strong>
                  <span>Controle Industrial</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              <span className="sidebar-collapse-icon" aria-hidden="true">☰</span>
              {!sidebarCollapsed && <span>Menu</span>}
            </button>

            <nav className="sidebar-nav">
              {tabItems.map((item) => (
                <button
                  key={item.id}
                  className={`sidebar-nav-item ${tab === item.id ? 'active' : ''}`}
                  onClick={() => goToTab(item.id)}
                  title={item.label}
                >
                  <span className="sidebar-nav-icon" aria-hidden="true">{renderNavIcon(item.icon)}</span>
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </button>
              ))}
            </nav>

            <button className="sidebar-signout" onClick={handleSignOut}>
              <span className="sidebar-nav-icon" aria-hidden="true">{renderNavIcon('logout')}</span>
              {!sidebarCollapsed && <span>Sair</span>}
            </button>
          </aside>

          <section className="dashboard-main">
            <header className="dashboard-topbar">
              <div className="topbar-title-group">
                <h2>{currentTabLabel}</h2>
              </div>
            </header>

            <div className="dashboard-content">
              <TabTransition tabKey={tab} direction={tabDirection}>
                {renderTabContent()}
              </TabTransition>
            </div>
          </section>
        </div>
      ) : (
        <>
          {tab !== 'painel' && tab !== 'login' && renderBrandBar('Controle da Produção')}
          <TabTransition tabKey={tab} direction={tabDirection}>
            {renderTabContent()}
          </TabTransition>
        </>
      )}

      {showDashboardShell && (
        <div className="mobile-bottom-nav" aria-label="Menu principal">
          {mobileTabItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`mobile-bottom-nav-item ${tab === item.id ? 'active' : ''}`}
              onClick={() => goToTab(item.id)}
              title={item.label}
              aria-label={item.label}
            >
              <span className="mobile-nav-icon" aria-hidden="true">{renderNavIcon(item.icon)}</span>
            </button>
          ))}
        </div>
      )}

      <GlobalModals
        editando={editando} setEditando={setEditando}
        finalizando={finalizando} setFinalizando={setFinalizando} confirmData={confirmData} setConfirmData={setConfirmData}
        startModal={startModal} setStartModal={setStartModal}
        stopModal={stopModal} setStopModal={setStopModal}
        resumeModal={resumeModal} setResumeModal={setResumeModal}
        lowEffModal={lowEffModal} setLowEffModal={setLowEffModal}
        lowEffEndModal={lowEffEndModal} setLowEffEndModal={setLowEffEndModal}
        onUpdateOrder={updateOrder}
        onFinalize={finalizeOrder}
        onConfirmStart={confirmStart}
        onConfirmStop={confirmStop}
        onConfirmResume={confirmResume}
        onConfirmLowEffStart={confirmLowEfficiency}
        onConfirmLowEffEnd={confirmEndLowEfficiency}
      />
    </div>
  )
}
