// src/App.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { DndContext, useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core'
import { useLocation, useNavigate } from 'react-router-dom';

import { MAQUINAS } from '../lib/constants'
import CadastroItens from '../abas/CadastroItens'
import Login from '../abas/Login'
import Painel from '../abas/Painel'
import Lista from '../abas/Lista'
import NovaOrdem from '../abas/NovaOrdem'
import Rastreio from '../abas/Rastreio'
import Gestao from '../abas/Gestao'
import PainelTV from '../abas/PainelTV'
import Tablets from '../pages/Tablets'
import Ficha from '../pages/Ficha'
import Prioridade from '../pages/Prioridade'
import useOrders from '../hooks/useOrders'
import useAuthAdmin from '../hooks/useAuthAdmin'
import GlobalModals from '../components/GlobalModals'
import Apontamento from '../abas/Apontamento'
import { DateTime } from 'luxon';
import { supabase } from '../lib/supabaseClient'


export default function DemoApp({ tenantClient = null }){
  const [tab,setTab] = useState('login')
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 5 }})
  const touchSensor = useSensor(TouchSensor, { pressDelay: 150, activationConstraint: { distance: 5 }})
  const sensors = useSensors(mouseSensor, touchSensor)

  const [form,setForm] = useState({
    code:'', customer:'', product:'', color:'', qty:'', boxes:'', standard:'', due_date:'', notes:'', machine_id:'P1'
  })

  // modals state (local UI)
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

  const [openSet, setOpenSet] = useState(()=>new Set())
  function toggleOpen(id){ setOpenSet(prev=>{ const n=new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n }) }

  // prioridades por máquina (persistidas no Supabase)
  const [machinePriorities, setMachinePriorities] = useState({})
  const [prioritiesLoading, setPrioritiesLoading] = useState(false)
  const [tenantMachines, setTenantMachines] = useState([])
  const [machinesLoading, setMachinesLoading] = useState(false)
  const [machinesResolved, setMachinesResolved] = useState(false)
  const tenantClientId = tenantClient?.id || null
  const machineIds = useMemo(() => {
    if (!tenantClientId) return MAQUINAS
    return tenantMachines
      .map((m) => String(m.machine_code || '').toUpperCase())
      .filter(Boolean)
  }, [tenantClientId, tenantMachines])
  const tenantMachinesReady = !tenantClientId || machinesResolved

  const { authUser, authChecked, isAdmin, hasAccess, tenantAccessChecked, permissions } = useAuthAdmin(tenantClientId)
  const hasGestaoAccess = !!authUser && !!permissions?.canAccessGestao
  const canCreateOrder = !!permissions?.canCreateOrder
  const canEditQueue = !!permissions?.canEditQueue
  const canEditOrder = !!permissions?.canEditOrder
  const canViewRastreio = !!permissions?.canViewRastreio

  const {
    ordens, paradas,
    fetchOrdensAbertas,
    fetchOrdensFinalizadas, fetchParadas,
    criarOrdem, atualizar, enviarParaFila, finalizar,
    confirmarInicio, confirmarParada, confirmarRetomada, confirmarBaixaEf, confirmarEncerrarBaixaEf,
    ativosPorMaquina, registroGrupos, lastFinalizadoPorMaquina, onStatusChange
  } = useOrders(tenantClientId)

  useEffect(() => {
    if (!authChecked || !tenantAccessChecked || !authUser || !hasAccess) return
    fetchOrdensAbertas()
    fetchOrdensFinalizadas()
    fetchParadas()
  }, [authChecked, tenantAccessChecked, authUser, hasAccess, tenantClientId])

  useEffect(()=>{
     const nowBR = DateTime.now().setZone('America/Sao_Paulo')
    setConfirmData({
    por: '',
    data: nowBR.toISODate(),       // 'YYYY-MM-DD' correto para <input type="date">
    hora: nowBR.toFormat('HH:mm')  // 'HH:mm' correto para <input type="time">
    })
  }, [finalizando?.id])

  const location = useLocation();
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
      if (!tenantClientId) {
        setTenantMachines([])
        setMachinesResolved(true)
        return
      }

      setMachinesLoading(true)
      const { data, error } = await supabase
        .from('machines')
        .select('id, client_id, machine_code, route_slug, active')
        .eq('client_id', tenantClientId)
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
  }, [tenantClientId])

  // Busca prioridades do Supabase
  useEffect(() => {
    async function loadPriorities() {
      setPrioritiesLoading(true)
      try {
        let q = supabase
          .from('machine_priorities')
          .select('machine_id, priority')
          .order('machine_id', { ascending: true })

        if (tenantClientId) q = q.eq('client_id', tenantClientId)

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

    // assinatura realtime para refletir atualizações
    const channel = supabase
      .channel('machine-priorities')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'machine_priorities' },
        (payload) => {
          const row = payload.new || payload.old
          if (!row) return
          if (tenantClientId && row.client_id !== tenantClientId) return
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
  }, [tenantClientId])

  async function handlePriorityChange(machineId, priorityValue) {
    const userEmail = String(authUser?.email || '').toLowerCase();
    if (userEmail !== 'gabrielalvesdesiqueira683@gmail.com') {
      alert('Apenas o e-mail autorizado pode alterar prioridades.');
      return;
    }
    try {
      const val = priorityValue === '' || priorityValue == null ? null : Number(priorityValue)
      const payload = {
        ...(tenantClientId ? { client_id: tenantClientId } : {}),
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

  // Atalhos de teclado: Ctrl+L (Login) e Ctrl+I (Cadastro Itens)
  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey; // permitir Cmd no Mac
      if (!ctrl) return;
      const key = String(e.key).toLowerCase();
      if (key === 'l') {
        e.preventDefault();
        setTab('login');
      } else if (key === 'i') {
        e.preventDefault();
        setTab('admin-itens');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // central handler: recebe instrução do hook onStatusChange e abre modais localmente
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
      setTab('login')
      return
    }
    if (!authUser) return

    if (!hasAccess) {
      setTab('login')
      return
    }

    if (tab === 'login') {
      setTab('painel')
      return
    }

    if (!canCreateOrder && tab === 'nova') {
      setTab('painel')
      return
    }

    if (!canViewRastreio && tab === 'rastreio') {
      setTab('painel')
      return
    }

    if (!hasGestaoAccess && tab === 'gestao') {
      setTab('painel')
    }
  }, [authChecked, authUser, tab, hasAccess, canCreateOrder, canViewRastreio, hasGestaoAccess])

  async function handleSignOut() {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.warn('Falha ao encerrar sessão:', err)
    } finally {
      setTab('login')
    }
  }

  function handleLoginSuccess(user) {
    if (!user) return
    setTab('painel')
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

  const hasTenantRouteAccess = !!authUser && tenantAccessChecked && hasAccess

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
        <Login onAuthenticated={handleLoginSuccess} showAdminShortcut={false} />
      </div>
    )
  }

  // rotas rápidas
  // rota de login para acesso via celular (/login)
  if (location && location.pathname === '/login') {
    return (
      <div className="app">
        {renderBrandBar('Acesso Admin')}
        <Login />
      </div>
    )
  }

  if (location && location.pathname === '/ficha') {
    if (!hasTenantRouteAccess) return renderTenantAccessRequired()
    return (
      <div className="app">
        {renderBrandBar('Ficha Técnica Digital')}
        <Ficha />
      </div>
    )
  }

  if (location && location.pathname === '/indicadores') {
    if (!hasTenantRouteAccess) return renderTenantAccessRequired()
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
    setTab('painel')
    navigate('/', { replace: true })
  }, [invalidMachineRoute, navigate])

  if (isMachineRoute) {
    if (!hasTenantRouteAccess) return renderTenantAccessRequired()
    if (machinesLoading) {
      return <div className="app" style={{ padding: 24 }}>Carregando máquina...</div>
    }
    if (!resolvedMachine) {
      return null
    }

    const machineId = String(resolvedMachine.machine_code || '').toUpperCase()
    const ativosMaquina = ordens.filter(o => o.machine_id === machineId && !o.finalized).sort((a,b)=>(a.pos??999)-(b.pos??999))
    return (
      <>
        <Tablets
          registroGrupos={registroGrupos}
          ativosP1={ativosMaquina}
          machineId={machineId}
          clientId={tenantClientId}
          tick={tick}
          paradas={paradas}
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
          onUpdateOrder={atualizar}
          onFinalize={finalizar}
          onConfirmStart={confirmarInicio}
          onConfirmStop={confirmarParada}
          onConfirmResume={confirmarRetomada}
          onConfirmLowEffStart={confirmarBaixaEf}
          onConfirmLowEffEnd={confirmarEncerrarBaixaEf}
        />
      </>
    );
  }

  if (location && location.pathname === '/prioridade') {
    if (!hasTenantRouteAccess) return renderTenantAccessRequired()
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
    if (!hasTenantRouteAccess) return renderTenantAccessRequired()
    if (!tenantMachinesReady) {
      return <div className="app" style={{ padding: 24 }}>Carregando maquinas...</div>
    }

    return (
      <div className="app" style={{ padding: 0 }}>
        <PainelTV
          ativosPorMaquina={ativosPorMaquina}
          machineIds={machineIds}
          paradas={paradas}
          tick={tick}
          lastFinalizadoPorMaquina={lastFinalizadoPorMaquina}
        />
      </div>
    )
  }

  // controle de abas e renderização

  return (
    <div className="app">


{/* mostre a barra de marca apenas quando não estivermos no painel */}
{tab !== 'painel' && tab !== 'login' && (
  renderBrandBar('Controle da Produção')
)}

      {authUser && tenantAccessChecked && hasAccess && tab !== 'login' && (
        <div className="tabs">
          <>
            <button className={`tabbtn ${tab==='painel'?'active':''}`} onClick={()=>setTab('painel')}>Painel</button>
            <button className={`tabbtn ${tab==='lista'?'active':''}`} onClick={()=>setTab('lista')}>Lista</button>
            <button className={`tabbtn ${tab==='apontamento'?'active':''}`} onClick={()=>setTab('apontamento')}>Apontamento</button>
            {canCreateOrder && (
              <button className={`tabbtn ${tab==='nova'?'active':''}`} onClick={()=>setTab('nova')}>Nova Ordem</button>
            )}
            {canViewRastreio && (
              <button className={`tabbtn ${tab==='rastreio'?'active':''}`} onClick={()=>setTab('rastreio')}>Rastreio</button>
            )}
            {hasGestaoAccess && (
              <button className={`tabbtn ${tab==='gestao'?'active':''}`} onClick={()=>setTab('gestao')}>Gestão</button>
            )}
            <button className="tabbtn" onClick={handleSignOut}>Sair</button>
          </>
        </div>
      )}

      {tab === 'login' && (
        <Login
          onAuthenticated={handleLoginSuccess}
          authenticatedTitle={authUser && tenantAccessChecked && !hasAccess ? 'Acesso negado' : 'Acesso liberado'}
          authenticatedDescription={authUser && tenantAccessChecked && !hasAccess
            ? 'Este usuário não possui acesso para este cliente.'
            : 'Clique em Continuar para abrir seu ambiente.'}
          showAdminShortcut={false}
          allowContinueWhenAuthenticated={!authUser || !tenantAccessChecked || hasAccess}
        />
      )}

      {tab === 'admin-itens' && (
        authChecked ? (
          isAdmin ? (
            <CadastroItens clientId={tenantClientId} />
          ) : (
            <div style={{ padding: 24 }}>
              <h2>Acesso Negado</h2>
              <p>Esta página não está disponível.</p>
            </div>
          )
        ) : (
          <div style={{ padding: 16 }}>
            <small>Verificando permissões…</small>
          </div>
        )
      )}

      {tab === 'painel' && tenantAccessChecked && hasAccess && (
        tenantMachinesReady ? (
          <Painel
            ativosPorMaquina={ativosPorMaquina}
            machineIds={machineIds}
            paradas={paradas}
            tick={tick}
            onStatusChange={handleStatusChange}
            setStartModal={setStartModal}
            setFinalizando={setFinalizando}
            lastFinalizadoPorMaquina={lastFinalizadoPorMaquina}
            onScanned={fetchOrdensAbertas}
            authUser={authUser}
            machinePriorities={machinePriorities}
          />
        ) : (
          <div style={{ padding: 16 }}><small>Carregando maquinas do cliente...</small></div>
        )
      )}

      {tab === 'lista' && tenantAccessChecked && hasAccess && (
        tenantMachinesReady ? (
          <Lista
            ativosPorMaquina={ativosPorMaquina}
            machineIds={machineIds}
            sensors={sensors}
            onStatusChange={handleStatusChange}
            setStartModal={setStartModal}
            setEditando={setEditando}
            setFinalizando={setFinalizando}
            enviarParaFila={enviarParaFila}
            refreshOrdens={fetchOrdensAbertas}
            isAdmin={canEditOrder}
            canReorder={canEditQueue}
            canEditOrder={canEditOrder}
            clientId={tenantClientId}
          />
        ) : (
          <div style={{ padding: 16 }}><small>Carregando maquinas do cliente...</small></div>
        )
      )}

      {tab === 'nova' && canCreateOrder && (
        canCreateOrder && tenantMachinesReady ? (
          <NovaOrdem form={form} setForm={setForm} criarOrdem={() => criarOrdem(form, setForm, setTab)} clientId={tenantClientId} machineIds={machineIds} />
        ) : canCreateOrder ? (
          <div style={{ padding: 16 }}><small>Carregando maquinas do cliente...</small></div>
        ) : (
          <div style={{ padding: 24 }}>
            <h2>Acesso Negado</h2>
            <p>Esta página não está disponível.</p>
          </div>
        )
      )}

      {tab === 'rastreio' && canViewRastreio && (
        <Rastreio clientId={tenantClientId} />
      )}

      {tab === 'apontamento' && tenantAccessChecked && hasAccess && (
        tenantMachinesReady ? (
          <Apontamento isAdmin={isAdmin} clientId={tenantClientId} machineIds={machineIds} />
        ) : (
          <div style={{ padding: 16 }}><small>Carregando maquinas do cliente...</small></div>
        )
      )}

      {tab === 'gestao' && hasGestaoAccess && (
        hasGestaoAccess && tenantMachinesReady ? (
          <Gestao clientId={tenantClientId} machineIds={machineIds} />
        ) : hasGestaoAccess ? (
          <div style={{ padding: 16 }}><small>Carregando maquinas do cliente...</small></div>
        ) : (
          <div style={{ padding: 24 }}>
            <h2>Acesso Negado</h2>
            <p>Esta página não está disponível.</p>
          </div>
        )
      )}

      {/* Modais centralizados */}
      <GlobalModals
        editando={editando} setEditando={setEditando}
        finalizando={finalizando} setFinalizando={setFinalizando} confirmData={confirmData} setConfirmData={setConfirmData}
        startModal={startModal} setStartModal={setStartModal}
        stopModal={stopModal} setStopModal={setStopModal}
        resumeModal={resumeModal} setResumeModal={setResumeModal}
        lowEffModal={lowEffModal} setLowEffModal={setLowEffModal}
        lowEffEndModal={lowEffEndModal} setLowEffEndModal={setLowEffEndModal}
        onUpdateOrder={atualizar}
        onFinalize={finalizar}
        onConfirmStart={confirmarInicio}
        onConfirmStop={confirmarParada}
        onConfirmResume={confirmarRetomada}
        onConfirmLowEffStart={confirmarBaixaEf}
        onConfirmLowEffEnd={confirmarEncerrarBaixaEf}
      />
    </div>
  )
}
