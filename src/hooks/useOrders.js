// src/hooks/useOrders.js
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { MAQUINAS, MOTIVOS_PARADA } from '../domain/constants'
import { localDateTimeToISO, jaIniciou } from '../lib/utils'
import { mapOrder } from '../domain/entities'
import { fetchAllPages } from '../lib/supabasePagination'

export default function useOrders(clientId = null, machineIds = MAQUINAS){
  const [orders, setOrders] = useState([])
  const [finalizedOrders, setFinalizedOrders] = useState([])
  const [stops, setStops] = useState([])

  // local map to store low efficiency session ids by order key
  const [lowEffSessions, setLowEffSessions] = useState({})

  const withClient = (query) => (clientId ? query.eq('company_id', clientId) : query)

  // basic fetchers
  async function hydrateSensorProduction(openOrders) {
    const rows = Array.isArray(openOrders) ? openOrders : []
    const orderIds = rows.map((o) => o?.id).filter(Boolean)
    if (!orderIds.length) return rows

    const { data, error } = await fetchAllPages(() => {
      let query = supabase
        .from('injection_production_entries')
        .select('order_id, good_qty, pulse_count, cavities_used')
        .in('order_id', orderIds)

      return withClient(query)
    })
    if (error) {
      console.warn('Falha ao carregar producao por sensor:', error)
      return rows
    }

    const totalsByOrder = new Map()
    ;(data || []).forEach((entry) => {
      const key = String(entry?.order_id || '')
      if (!key) return
      const current = totalsByOrder.get(key) || { pieces: 0, pulses: 0, cavities: 0 }
      current.pieces += Number(entry?.good_qty || 0)
      current.pulses += Number(entry?.pulse_count || 0)
      const cavities = Number(entry?.cavities_used || 0)
      if (cavities > 0) current.cavities = cavities
      totalsByOrder.set(key, current)
    })

    return rows.map((order) => {
      const totals = totalsByOrder.get(String(order?.id || '')) || { pieces: 0, pulses: 0, cavities: 0 }
      return {
        ...order,
        sensor_produced_pieces: totals.pieces,
        sensor_pulse_count: totals.pulses,
        sensor_cavities_used: totals.cavities,
      }
    })
  }

  async function fetchOpenOrders(){
    // NOTE: scanned_count:production_scans(count) -> agrega o count de production_scans por order_id
    const res = await withClient(supabase
      .from('orders')
      .select(`
        *,
        scanned_count:production_scans(count)
      `)
      .eq('finalized', false)
      .order('pos',{ascending:true})
      .order('created_at',{ascending:true}))

    if(!res.error) {
      const normalized = (res.data || []).map(row => {
        const sc = row.scanned_count;
        const scannedCount = Array.isArray(sc)
          ? Number(sc[0]?.count || 0)
          : (sc && typeof sc === 'object' && typeof sc.count !== 'undefined')
            ? Number(sc.count || 0)
            : (typeof sc === 'number' ? sc : Number(sc || 0));
        return mapOrder({ ...row, scanned_count: scannedCount })
      });

      const withSensorProduction = await hydrateSensorProduction(normalized)
      setOrders(withSensorProduction)
    }
  }

  async function fetchFinalizedOrders(){
    const res = await withClient(supabase.from('orders').select('*')).eq('finalized', true).order('finalized_at',{ascending:false}).limit(500)
    if(!res.error) setFinalizedOrders((res.data || []).map(mapOrder))
  }
  async function fetchStops(){
    const res = await withClient(supabase.from('machine_stops').select('*')).order('started_at',{ascending:false}).limit(1000)
    if(!res.error) setStops(res.data||[])
  }

  useEffect(()=>{ 
    fetchOpenOrders(); fetchFinalizedOrders(); fetchStops()

    let scansRefreshTimer = null
    function scheduleOpenOrdersRefresh() {
      if (scansRefreshTimer) window.clearTimeout(scansRefreshTimer)
      scansRefreshTimer = window.setTimeout(() => {
        fetchOpenOrders()
      }, 120)
    }

    const chOrders = supabase.channel('orders-rt')
      .on('postgres_changes', { event:'*', schema:'public', table:'orders' }, (p)=>{
        const r = p.new; if(!r) return;
        if (clientId && r.company_id !== clientId) return

        setOrders(prev=>{
          const i=prev.findIndex(o=>o.id===r.id)
          const preservedScanned = i>=0 ? prev[i].scanned_count : undefined
          const merged = mapOrder({ ...r, scanned_count: preservedScanned !== undefined ? preservedScanned : r.scanned_count })

          if (r.finalized) { if(i>=0){const cp=[...prev]; cp.splice(i,1); return cp} return prev }
          if (i>=0){ const cp=[...prev]; cp[i]={...cp[i],...merged}; return cp }
          return [...prev, merged]
        })
        if (r.finalized) setFinalizedOrders(prev=>{
          const i=prev.findIndex(x=>x.id===r.id)
          if(i>=0){const cp=[...prev]; cp[i]=mapOrder(r); return cp}
          return [mapOrder(r),...prev]
        })
      }).subscribe()
    const chStops = supabase.channel('stops-rt')
      .on('postgres_changes', { event:'*', schema:'public', table:'machine_stops' }, (p)=>{
        const r = p.new; if(!r) return;
        if (clientId && r.company_id !== clientId) return
        setStops(prev=>{
          const i=prev.findIndex(x=>x.id===r.id)
          if(i>=0){const cp=[...prev]; cp[i]=r; return cp}
          return [r,...prev]
        })
      }).subscribe()
    const chScans = supabase.channel('scans-rt')
      .on('postgres_changes', { event:'*', schema:'public', table:'production_scans' }, (p)=>{
        const row = p.new || p.old
        if (!row) return
        // Mantem atualização reativa entre abas (Painel/TV/Lista), mesmo sem callback local.
        if (clientId && String(row.company_id || '') !== String(clientId)) return
        scheduleOpenOrdersRefresh()
      }).subscribe()
    const chEntries = supabase.channel('injection-entries-rt')
      .on('postgres_changes', { event:'*', schema:'public', table:'injection_production_entries' }, (p)=>{
        const row = p.new || p.old
        if (!row) return
        if (clientId && String(row.company_id || '') !== String(clientId)) return
        scheduleOpenOrdersRefresh()
      }).subscribe()

    return ()=>{
      if (scansRefreshTimer) window.clearTimeout(scansRefreshTimer)
      supabase.removeChannel(chOrders)
      supabase.removeChannel(chStops)
      supabase.removeChannel(chScans)
      supabase.removeChannel(chEntries)
    }
  },[clientId])

  // helpers
  function patchOrderLocal(id, patch) { setOrders(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o)); }
  function removeOrderLocal(id) { setOrders(prev => prev.filter(o => o.id !== id)); }
  function upsertFinalizedLocal(row) { setFinalizedOrders(prev => { const i=prev.findIndex(o=>o.id===row.id); if(i>=0){const cp=[...prev]; cp[i]=row; return cp} return [row,...prev] }) }

  // expose derived data
  const activeByMachine = useMemo(()=>{
    const ids = Array.from(new Set([
      ...(Array.isArray(machineIds) ? machineIds : []),
      ...orders.map((o) => String(o?.machine_id || '').toUpperCase()).filter(Boolean),
    ]))
    const map = Object.fromEntries(ids.map(m=>[m,[]]))
    orders.forEach(o=>{
      if(o.finalized) return
      const machineId = String(o.machine_id || '').toUpperCase()
      if(!machineId) return
      if(!map[machineId]) map[machineId] = []
      map[machineId].push(o)
    })
    for(const m of Object.keys(map)) map[m]=[...map[m]].sort((a,b)=>(a.pos??999)-(b.pos??999))
    return map
  },[machineIds, orders])

  const lastFinalizedByMachine = useMemo(()=>{
    const ids = Array.from(new Set([
      ...(Array.isArray(machineIds) ? machineIds : []),
      ...finalizedOrders.map((o) => String(o?.machine_id || '').toUpperCase()).filter(Boolean),
    ]))
    const map = Object.fromEntries(ids.map(m=>[m,null]))
    for(const o of finalizedOrders){
      const machineId = String(o.machine_id || '').toUpperCase()
      if(!machineId||!o.finalized_at) continue
      if(!(machineId in map)) map[machineId] = null
      const prev = map[machineId] ? new Date(map[machineId]).getTime() : 0
      const cur = new Date(o.finalized_at).getTime()
      if(cur>prev) map[machineId]=o.finalized_at
    }
    return map
  },[finalizedOrders, machineIds])

  const orderRecordGroups = useMemo(()=>{
    const byId = new Map(); const push = (o)=>{ if(!o) return; byId.set(o.id,{...o}) }
    finalizedOrders.forEach(push); orders.forEach(o=>{ if(o.started_at) push(o) })
    const stopsByOrder = stops.reduce((acc,st)=>{ (acc[st.order_id] ||= []).push(st); return acc },{})
    const arr = Array.from(byId.values())
    arr.sort((a,b)=>{
      const ta = new Date(a.finalized_at||a.restarted_at||a.interrupted_at||a.started_at||a.created_at||0).getTime()
      const tb = new Date(b.finalized_at||b.restarted_at||b.interrupted_at||b.started_at||b.created_at||0).getTime()
      return tb-ta
    })
    return arr.map(o=>({ order:o, ordem:o, stops:(stopsByOrder[o.id]||[]).sort((a,b)=>new Date(a.started_at)-new Date(b.started_at)) }))
  },[finalizedOrders, orders, stops])

  // ========================= Helpers/Actions internas =========================
  async function setStatus(order, newStatus) {
    const patch = { status: newStatus }
    const before = { status: order.status }
    patchOrderLocal(order.id, patch)
    const res = await supabase.from('orders').update(patch).eq('id', order.id).select('*').maybeSingle()
    if (res.error) { alert('Erro ao alterar status: ' + res.error.message); patchOrderLocal(order.id, before) }
    if (res.data) patchOrderLocal(res.data.id, res.data)
    return res
  }

  // ========================= Ações públicas (assinaturas mantidas) =========================

  async function createOrder(form, setForm, setTab){
    if(!form.code.trim()) return
    const { data: last, error: maxErr } = await withClient(supabase.from('orders').select('pos')).eq('machine_id', form.machine_id).eq('finalized', false).order('pos',{ascending:false}).limit(1).maybeSingle()
    if (maxErr) { alert('Erro ao obter posição: ' + maxErr.message); return; }
    const nextPos = (last?.pos ?? -1) + 1
    const novo = { company_id: clientId, machine_id: form.machine_id, code: form.code, customer: form.customer, product: form.product, color: form.color, qty: form.qty, boxes: form.boxes, standard: form.standard, due_date: form.due_date || null, notes: form.notes, status: 'AGUARDANDO', pos: nextPos, finalized:false, started_at:null, started_by:null, restarted_at:null, restarted_by:null, interrupted_at:null, interrupted_by:null }
    const tempId = `tmp-${crypto.randomUUID()}`
    setOrders(prev=>[...prev,{id:tempId, ...novo}])
    const res = await supabase.from('orders').insert([novo]).select('*').maybeSingle()
    if (res.error) { setOrders(prev => prev.filter(o => o.id !== tempId)); alert('Erro ao criar ordem: ' + res.error.message); return }
    if (res.data) setOrders(prev => prev.map(o => o.id === tempId ? res.data : o))
    setForm({code:'', customer:'', product:'', color:'', qty:'', boxes:'', standard:'', due_date:'', notes:'', machine_id: form.machine_id})
    setTab('painel')
  }

  async function updateOrder(orderPartial){
    const before = orders.find(o => o.id === orderPartial.id)
    if (!before) return
    if (before.machine_id !== orderPartial.machine_id) {
      patchOrderLocal(orderPartial.id, { ...before, ...orderPartial })
      const { data, error } = await supabase.rpc('orders_move_to_machine', { p_order_id: orderPartial.id, p_target_machine: orderPartial.machine_id, p_insert_at: null })
      if (error) { alert('Erro ao mover ordem de máquina: ' + error.message); patchOrderLocal(before.id, before); return }
      if (data && data[0]) patchOrderLocal(data[0].id, data[0])
      return
    }

    patchOrderLocal(orderPartial.id, { ...orderPartial })
    const res = await supabase.from('orders').update({
      machine_id: orderPartial.machine_id,
      code: orderPartial.code, customer: orderPartial.customer, product: orderPartial.product, color: orderPartial.color,
      qty: orderPartial.qty, boxes: orderPartial.boxes, standard: orderPartial.standard, due_date: orderPartial.due_date || null,
      notes: orderPartial.notes, status: orderPartial.status, pos: orderPartial.pos ?? null,
      started_at: orderPartial.started_at ?? null, started_by: orderPartial.started_by ?? null,
      restarted_at: orderPartial.restarted_at ?? null, restarted_by: orderPartial.restarted_by ?? null,
      interrupted_at: orderPartial.interrupted_at ?? null, interrupted_by: orderPartial.interrupted_by ?? null,
      // NOTE: não alteramos mais campos relacionados a baixa eficiência na tabela `orders`
    }).eq('id', orderPartial.id).select('*').maybeSingle()

    if (res.error) { alert('Erro ao atualizar: ' + res.error.message); if (before) patchOrderLocal(before.id, before); return }
    if (res.data) patchOrderLocal(res.data.id, res.data)
  }

  async function finalizeOrder(order, payload){
    const iso = localDateTimeToISO(payload.data, payload.hora)
    const p = { finalized:true, status: 'FINALIZADA', finalized_by: payload.por, finalized_at: iso }
    const before = orders.find(o=>o.id===order.id)

    // Se houver baixa eficiência aberta, encerra o log no mesmo timestamp da finalização
    try {
      if (order.status === 'BAIXA_EFICIENCIA') {
        const key = `order_${order.id}`
        const sessionId = lowEffSessions?.[key]
        if (sessionId) {
          const upd = await supabase.from('low_efficiency_logs').update({ ended_at: iso }).eq('id', sessionId)
          if (upd.error) {
            // fallback: encerra por order_id quaisquer registros abertos
            await supabase.from('low_efficiency_logs').update({ ended_at: iso }).eq('order_id', order.id).is('ended_at', null)
          } else {
            // remove mapeamento local
            setLowEffSessions(prev => { const c = { ...prev }; delete c[key]; return c })
          }
        } else {
          // fallback direto
          await supabase.from('low_efficiency_logs').update({ ended_at: iso }).eq('order_id', order.id).is('ended_at', null)
        }
      }
    } catch (e) {
      console.warn('Falha ao encerrar baixa eficiência ao finalizar ordem:', e)
    }

    // Se houver PARADA aberta, encerra (resumed_at) no mesmo timestamp da finalização
    try {
      if (order.status === 'PARADA') {
        const sel = await supabase.from('machine_stops').select('*')
          .eq('order_id', order.id).is('resumed_at', null)
          .order('started_at', { ascending:false })
          .limit(1).maybeSingle()
        if (sel.data) {
          await supabase.from('machine_stops').update({ resumed_by: payload.por || 'Sistema', resumed_at: iso })
            .eq('id', sel.data.id)
        }
      }
    } catch (e) {
      console.warn('Falha ao encerrar parada ao finalizar ordem:', e)
    }

    removeOrderLocal(order.id)
    upsertFinalizedLocal({...order,...p})
    const res = await supabase.from('orders').update(p).eq('id', order.id).select('*').maybeSingle()
    if (res.error) { alert('Erro ao finalizar: ' + res.error.message); if(before) setOrders(prev=>[before,...prev]); setFinalizedOrders(prev=>prev.filter(o=>o.id!==order.id)); return }
    if (res.data) upsertFinalizedLocal(res.data)
  }

  // === ENVIAR PARA FILA (só aparece na LISTA) =======================
  async function sendToQueue(orderActive, opts) {
    const operador = opts?.operador?.trim()
    const data = opts?.data
    const hora = opts?.hora
    const maquina = orderActive.machine_id
    const lista = [...orders]
      .filter(o => !o.finalized && o.machine_id === maquina)
      .sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999))

    if (!lista.length) return

    const activeOrder = lista[0]
    const queue = lista.slice(1)

    if (!queue.length) {
      alert('Não há itens na fila para promover.')
      return
    }

    const nextPanelOrder = queue[0]
    const remainingQueue = queue.slice(1)

    // 1) posições temporárias altas para evitar UNIQUE
    const BASE = 1_000_000
    for (let i = 0; i < lista.length; i++) {
      const o = lista[i]
      const tempPos = BASE + i + 1
      const r = await supabase.from('orders').update({ pos: tempPos }).eq('id', o.id)
      if (r.error) { alert('Erro ao preparar envio para fila: ' + r.error.message); return }
    }

    // 2) promover primeiro da fila ao painel (SEM zerar started_* para não perder histórico)
    {
      const r = await supabase.from('orders').update({
        pos: 0,
        status: 'AGUARDANDO'
      }).eq('id', nextPanelOrder.id)
      if (r.error) { alert('Erro ao promover item para o painel: ' + r.error.message); return }
    }

    // 3) reindexar fila 1..N
    for (let i = 0; i < remainingQueue.length; i++) {
      const o = remainingQueue[i]
      const r = await supabase.from('orders').update({ pos: i + 1 }).eq('id', o.id)
      if (r.error) { alert('Erro ao reordenar fila: ' + r.error.message); return }
    }

    // 4) enviar a atual para o fim e registrar interrupção
    {
      const finalPos = remainingQueue.length + 1;
      const agoraISO = (data && hora)
        ? localDateTimeToISO(data, hora)
        : new Date().toISOString();
      // Se status atual é PARADA, encerra parada aberta
      if (activeOrder.status === 'PARADA') {
        const sel = await supabase.from('machine_stops').select('*')
          .eq('order_id', activeOrder.id).is('resumed_at', null)
          .order('started_at', { ascending:false })
          .limit(1).maybeSingle();
        if (sel.data) {
          await supabase.from('machine_stops').update({ resumed_by: operador || 'Sistema', resumed_at: agoraISO })
            .eq('id', sel.data.id);
        }
      }
      // Se status atual é BAIXA_EFICIENCIA, encerra o log aberto
      if (activeOrder.status === 'BAIXA_EFICIENCIA') {
        try {
          const key = `order_${activeOrder.id}`
          const sessionId = lowEffSessions?.[key]
          if (sessionId) {
            const upd = await supabase.from('low_efficiency_logs').update({ ended_at: agoraISO }).eq('id', sessionId)
            if (upd.error) {
              await supabase.from('low_efficiency_logs').update({ ended_at: agoraISO }).eq('order_id', activeOrder.id).is('ended_at', null)
            } else {
              setLowEffSessions(prev => { const c = { ...prev }; delete c[key]; return c })
            }
          } else {
            await supabase.from('low_efficiency_logs').update({ ended_at: agoraISO }).eq('order_id', activeOrder.id).is('ended_at', null)
          }
        } catch (e) {
          console.warn('Erro ao encerrar baixa eficiência ao enviar para fila:', e)
        }
      }
      const r = await supabase.from('orders').update({
        pos: finalPos,
        status: 'AGUARDANDO',
        interrupted_at: agoraISO,
        interrupted_by: operador || 'Sistema',
      }).eq('id', activeOrder.id);
      if (r.error) { alert('Erro ao enviar a atual para o fim da fila: ' + r.error.message); return; }
    }

    // 5) atualizar estado local
    setOrders(prev => {
      const map = new Map(prev.map(o => [o.id, { ...o }]))
      const np = map.get(nextPanelOrder.id)
      if (np) {
        np.pos = 0;
        np.status = 'AGUARDANDO';
        // preserva started_at/started_by (não zera) para manter o histórico no Registro
      }

      remainingQueue.forEach((o, i) => {
        const it = map.get(o.id); if (it) it.pos = i + 1
      })

      const itActive = map.get(activeOrder.id)
      if (itActive) {
        itActive.pos = remainingQueue.length + 1
        itActive.status = 'AGUARDANDO'
        itActive.interrupted_at = (data && hora) ? localDateTimeToISO(data, hora) : new Date().toISOString()
        itActive.interrupted_by = operador || 'Sistema'
      }
      return Array.from(map.values())
    })
  }

  // ========================= Confirmadores (agora recebem payloads) =========================

  async function confirmStart(payload = {}) {
    const order = payload.order || payload.ordem
    const operador = payload.operador
    const data = payload.data
    const hora = payload.hora

    if (!order?.id) { alert('Não foi possível identificar a ordem para iniciar.'); return }
    if (!operador || !data || !hora) { alert('Preencha operador, data e hora.'); return }
    const iso = localDateTimeToISO(data, hora)

    // Detecta reinício (já tinha started_at e foi interrompida)
    const isRestart = !!order.started_at && !!order.interrupted_at

    const updatePayload = isRestart
      ? {
          // reinício após interrupção
          status: 'PRODUZINDO',
          restarted_by: operador,
          restarted_at: iso,
          // ao retomar normal, zera possíveis campos de baixa eficiência abertos (apenas localmente)
        }
      : {
          // primeiro início
          started_by: operador,
          started_at: iso,
          status: 'PRODUZINDO',
          interrupted_at: null, interrupted_by: null,
        }

    patchOrderLocal(order.id, updatePayload)
    const res = await supabase.from('orders').update(updatePayload).eq('id', order.id).select('*').maybeSingle()
    if (res.error) { alert('Erro ao iniciar: '+res.error.message); return }
    if (res.data) patchOrderLocal(res.data.id, res.data)
  }

  // Evita registrar parada com horário que se sobrepõe a outra parada da mesma máquina
  async function validarSobreposicaoParada({ machineId, startedAt }) {
    try {
      // existe parada em aberto?
      const open = await supabase.from('machine_stops')
        .select('id, started_at')
        .eq('machine_id', machineId)
        .is('resumed_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (open.error) {
        console.warn('Falha ao checar parada aberta:', open.error)
        return 'Não foi possível validar paradas em aberto. Tente novamente.'
      }
      if (open.data) {
        return 'Já existe uma parada aberta nesta máquina. Encerre antes de registrar outra.'
      }

      // verifica interseção: start existente <= novo start <= end existente
      const overlaps = await supabase.from('machine_stops')
        .select('id, started_at, resumed_at')
        .eq('machine_id', machineId)
        .lte('started_at', startedAt)
        .or(`resumed_at.is.null,resumed_at.gte.${startedAt}`)

      if (overlaps.error) {
        console.warn('Falha ao validar sobreposição de parada:', overlaps.error)
        return 'Não foi possível validar sobreposição de parada. Tente novamente.'
      }

      if (Array.isArray(overlaps.data) && overlaps.data.length > 0) {
        const hit = overlaps.data[0]
        const ini = new Date(hit.started_at).toLocaleString('pt-BR')
        const fim = hit.resumed_at ? new Date(hit.resumed_at).toLocaleString('pt-BR') : 'em aberto'
        return `Já existe uma parada registrada neste intervalo (${ini} - ${fim}). Ajuste a data/hora.`
      }
    } catch (err) {
      console.warn('Erro inesperado ao validar parada:', err)
      return 'Não foi possível validar sobreposição de parada agora.'
    }

    return null
  }

  async function confirmStop({ order, operador, motivo, obs, data, hora, endLowEffAtStopStart }) {
    if (!operador || !data || !hora) { alert('Preencha operador, data e hora.'); return }
    if (!String(motivo || '').trim()) { alert('Selecione o motivo da parada.'); return }
    const started_at = localDateTimeToISO(data, hora)

    const overlapMsg = await validarSobreposicaoParada({ machineId: order.machine_id, startedAt: started_at })
    if (overlapMsg) { alert(overlapMsg); return }

    // 1) Se vier de baixa eficiência, encerra-a neste mesmo timestamp + limpa observação NO LOG NOVO
    if (endLowEffAtStopStart) {
      // tenta encerrar log associado
      try {
        const key = `order_${order.id}`
        const sessionId = lowEffSessions?.[key]
        if (sessionId) {
          await supabase.from('low_efficiency_logs').update({ ended_at: started_at }).eq('id', sessionId)
          // remove mapping
          setLowEffSessions(prev => { const c={...prev}; delete c[key]; return c })
        } else {
          // fallback: encerra registros abertos para essa ordem
          await supabase.from('low_efficiency_logs').update({ ended_at: started_at }).eq('order_id', order.id).is('ended_at', null)
        }
      } catch (e) {
        console.warn('Erro ao encerrar baixa eficiência automaticamente ao iniciar parada:', e)
      }
    }

    // 2) Registra parada
    const ins = await supabase.from('machine_stops')
      .insert([{ company_id: clientId, order_id: order.id, machine_id: order.machine_id, started_by: operador, started_at, reason: String(motivo).trim(), notes: obs }])
      .select('*').maybeSingle()
    if (ins.error) { alert('Erro ao registrar parada: ' + ins.error.message); return }

    // 3) Muda status para PARADA
    await setStatus(order, 'PARADA')
  }

  async function confirmResume({ order, operador, data, hora, targetStatus }) {
    if (!operador || !data || !hora) { alert('Preencha operador, data e hora.'); return }
    const resumed_at = localDateTimeToISO(data, hora)
    const sel = await supabase.from('machine_stops').select('*')
      .eq('order_id', order.id).is('resumed_at', null)
      .order('started_at', { ascending:false })
      .limit(1).maybeSingle()
    if (sel.error) { alert('Erro ao localizar parada aberta: ' + sel.error.message); return }
    if (sel.data) {
      const upd = await supabase.from('machine_stops').update({ resumed_by: operador, resumed_at })
        .eq('id', sel.data.id)
      if (upd.error) { alert('Erro ao encerrar parada: ' + upd.error.message); return }
    }
    await setStatus(order, targetStatus || 'PRODUZINDO')
  }

  // ========================= NOVA LÓGICA: Baixa Eficiência no low_efficiency_logs =========================

  async function confirmLowEfficiency({ order, operador, data, hora, obs }) {
    if (!operador || !data || !hora) { alert('Preencha operador, data e hora.'); return }
    const started_at = localDateTimeToISO(data, hora);

    // Se status anterior era PARADA, encerra-a neste mesmo timestamp + limpa observação
    if (order.status === 'PARADA') {
      const sel = await supabase.from('machine_stops').select('*')
        .eq('order_id', order.id).is('resumed_at', null)
        .order('started_at', { ascending:false })
        .limit(1).maybeSingle();
      if (sel.data) {
        await supabase.from('machine_stops').update({ resumed_by: operador, resumed_at: started_at })
          .eq('id', sel.data.id);
      }
    }

    // 1) Inserir registro na tabela nova low_efficiency_logs
    try {
      const payload = {
        company_id: clientId,
        order_id: order.id,
        machine_id: order.machine_id,
        started_at,
        started_by: operador,
        notes: obs || null
      }
      const ins = await supabase.from('low_efficiency_logs').insert([payload]).select('*').maybeSingle()
      if (ins.error) {
        alert('Erro ao registrar baixa eficiência no log: ' + ins.error.message);
        return;
      }
      // salva id da sessão localmente para podermos encerrar exatamente esse registro depois
      if (ins.data && ins.data.id) {
        const key = `order_${order.id}`
        setLowEffSessions(prev => ({ ...prev, [key]: ins.data.id }))
      }
    } catch (e) {
      console.error('Erro ao inserir low_efficiency_logs:', e)
      alert('Erro ao gravar baixa eficiência.')
      return
    }

    // 2) Atualiza somente o status da order no banco (não grava campos de baixa no orders)
    patchOrderLocal(order.id, {
      status: 'BAIXA_EFICIENCIA',
      // atualiza localmente campos para UI (não persistimos estes campos em orders)
      loweff_started_at: started_at,
      loweff_ended_at: null,
      loweff_by: operador,
      loweff_notes: obs || null
    })
    const res = await supabase.from('orders').update({ status: 'BAIXA_EFICIENCIA' }).eq('id', order.id).select('*').maybeSingle()
    if (res.error) { alert('Erro ao registrar baixa eficiência (status): ' + res.error.message); return; }
    if (res.data) patchOrderLocal(res.data.id, res.data);
  }

  async function confirmEndLowEfficiency({ order, targetStatus, data, hora }) {
    if (!data || !hora) { alert('Preencha data e hora.'); return }
    const ended_at = localDateTimeToISO(data, hora)

    // 1) Encerrar o registro em low_efficiency_logs
    try {
      const key = `order_${order.id}`
      const sessionId = lowEffSessions?.[key]
      if (sessionId) {
        const upd = await supabase.from('low_efficiency_logs').update({ ended_at }).eq('id', sessionId)
        if (upd.error) {
          console.warn('Falha ao encerrar log por id, tentando fallback:', upd.error)
          // fallback: encerrar por order_id
          await supabase.from('low_efficiency_logs').update({ ended_at }).eq('order_id', order.id).is('ended_at', null)
        } else {
          // remove mapping local
          setLowEffSessions(prev => { const c = { ...prev }; delete c[key]; return c })
        }
      } else {
        // fallback: encerra por order_id registros abertos
        await supabase.from('low_efficiency_logs').update({ ended_at }).eq('order_id', order.id).is('ended_at', null)
      }
    } catch (e) {
      console.warn('Erro ao encerrar baixa eficiência no log:', e)
      // não interrompe o fluxo — apenas loga
    }

    // 2) Atualiza localmente para UI e atualiza status na tabela orders (sem tocar campos loweff_* no banco)
    const patch = {
      status: targetStatus || 'PRODUZINDO',
      loweff_ended_at: ended_at,
      loweff_notes: null
    }
    const before = orders.find(o=>o.id===order.id)
    patchOrderLocal(order.id, patch)
    const res = await supabase.from('orders').update({ status: patch.status }).eq('id', order.id).select('*').maybeSingle()
    if (res.error) { alert('Erro ao encerrar baixa eficiência (status): ' + res.error.message); if(before) patchOrderLocal(before.id, before) }
    if (res.data) patchOrderLocal(res.data.id, res.data)
  }

  const onStatusChange = async (order, targetStatus, options = {}) => {
    const atual = order.status
    if (jaIniciou(order) && targetStatus === 'AGUARDANDO') {
      return { action: 'alert', message: 'Após iniciar a produção, não é permitido voltar para "Aguardando".' }
    }

    if (targetStatus === 'BAIXA_EFICIENCIA' && atual !== 'BAIXA_EFICIENCIA') {
      const now = new Date()
      return {
        action: 'openLowEffModal',
        payload: {
          order,
          operador: '',
          obs: '',
          data: now.toISOString().slice(0,10),
          hora: now.toTimeString().slice(0,5),
        }
      }
    }

    if (atual === 'BAIXA_EFICIENCIA' && targetStatus === 'PRODUZINDO') {
      const now = new Date()
      return {
        action: 'openLowEffEndModal',
        payload: {
          order,
          targetStatus: 'PRODUZINDO',
          operador: '',
          data: now.toISOString().slice(0,10),
          hora: now.toTimeString().slice(0,5),
        }
      }
    }

    if (atual === 'BAIXA_EFICIENCIA' && targetStatus === 'PARADA') {
      if (options.autoStop) {
        await setStatus(order, 'PARADA')
      }
      const now = new Date()
      return {
        action: 'openStopModal',
        payload: {
          order,
          operador:'', motivo: MOTIVOS_PARADA[0], obs:'',
          data: now.toISOString().slice(0,10),
          hora: now.toTimeString().slice(0,5),
          endLowEffAtStopStart: true,
        }
      }
    }

    if (targetStatus === 'PARADA' && atual !== 'PARADA') {
      if (options.autoStop) {
        await setStatus(order, 'PARADA')
      }
      const now=new Date()
      return { action: 'openStopModal', payload: { order, operador:'', motivo: MOTIVOS_PARADA[0], obs:'', data: now.toISOString().slice(0,10), hora: now.toTimeString().slice(0,5) } }
    }

    if (atual === 'PARADA' && targetStatus !== 'PARADA') {
      const now = new Date();
      if (targetStatus === 'BAIXA_EFICIENCIA') {
        try {
          const sel = await supabase.from('machine_stops').select('*')
            .eq('order_id', order.id).is('resumed_at', null)
            .order('started_at', { ascending:false })
            .limit(1).maybeSingle();
          if (sel.data) {
            await supabase.from('machine_stops').update({ resumed_by: 'Sistema', resumed_at: now.toISOString() })
              .eq('id', sel.data.id);
          }
        } catch (e) {
          console.warn('Erro ao encerrar parada automaticamente:', e)
        }
        await setStatus(order, targetStatus);
        return { action: 'statusSet', newStatus: targetStatus }
      }
      return { action: 'openResumeModal', payload: { order, operador:'', data: now.toISOString().slice(0,10), hora: now.toTimeString().slice(0,5), targetStatus } }
    }

    await setStatus(order, targetStatus)
    return { action: 'statusSet', newStatus: targetStatus }
  }

  return {
    orders, finalizedOrders, stops,
    fetchOpenOrders, fetchFinalizedOrders, fetchStops,
    createOrder, updateOrder, sendToQueue, finalizeOrder,
    confirmStart, confirmStop, confirmResume, confirmLowEfficiency, confirmEndLowEfficiency,
    activeByMachine, orderRecordGroups, lastFinalizedByMachine, onStatusChange,
    ordens: orders, finalizadas: finalizedOrders, paradas: stops,
    fetchOrdensAbertas: fetchOpenOrders, fetchOrdensFinalizadas: fetchFinalizedOrders, fetchParadas: fetchStops,
    criarOrdem: createOrder, atualizar: updateOrder, enviarParaFila: sendToQueue, finalizar: finalizeOrder,
    confirmarInicio: confirmStart, confirmarParada: confirmStop, confirmarRetomada: confirmResume, confirmarBaixaEf: confirmLowEfficiency, confirmarEncerrarBaixaEf: confirmEndLowEfficiency,
    ativosPorMaquina: activeByMachine, registroGrupos: orderRecordGroups, lastFinalizadoPorMaquina: lastFinalizedByMachine,
  }
}

