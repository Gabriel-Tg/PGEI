import { useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { supabase } from '../lib/supabaseClient'
import { computeMachineSensorStatus, getRunningCycleSeconds, latestIsoTimestamp, runningCycleTone, sensorStatusLabel } from '../lib/sensorRuntime'
import MachineCard from '../components/MachineCard'
import '../styles/sensores.css'
import '../styles/machine-card.css'

function normalizeMachineCode(value) {
  return String(value || '').trim().toUpperCase()
}

function getOrderItemCode(order = {}) {
  const product = String(order?.product || '').trim()
  const code = product.split('-')[0]?.trim()
  return code || null
}

// Calculate machine OEE based on available data
function calculateMachineOEE(machineData) {
  // Placeholder: retorna um valor simulado baseado no status
  // Em produção, isso seria calculado a partir de dados reais de produção
  if (!machineData || machineData.status === 'offline') return 0
  if (machineData.status === 'recebendo_pulsos') return 85 + Math.random() * 15
  if (machineData.status === 'online') return 70 + Math.random() * 20
  return 50
}

// Generate consistent pseudo-random value from machine ID
function getMachineHashValue(machineId, min = 0, max = 100) {
  let hash = 0
  for (let i = 0; i < machineId.length; i++) {
    hash = ((hash << 5) - hash) + machineId.charCodeAt(i)
    hash = hash & hash // Convert to 32bit integer
  }
  return min + (Math.abs(hash) % (max - min + 1))
}

// Determine machine operational status
function determineMachineStatus(sensorStatus, runningCycleSeconds, configuredCycleSeconds, oee) {
  if (sensorStatus === 'offline') return 'offline'
  
  // Sem pulsos por mais de 5 minutos = parada
  if (!runningCycleSeconds || runningCycleSeconds > 300) return 'stopped'
  
  // OEE baixa = baixa eficiência
  if (oee < 70) return 'low_efficiency'
  
  // Ciclo acima do esperado = baixa eficiência
  if (configuredCycleSeconds && runningCycleSeconds > configuredCycleSeconds * 1.2) {
    return 'low_efficiency'
  }
  
  return 'producing'
}

export default function Sensores({ clientId = null, machineIds = [], tenantMachines = [], ativosPorMaquina = {}, itemTechByCode = {} }) {
  const [events, setEvents] = useState([])
  const [heartbeats, setHeartbeats] = useState([])
  const [loading, setLoading] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      try {
        let eventsQuery = supabase
          .from('machine_sensor_events')
          .select('id, company_id, machine_id, order_id, pulse_count, cavities_used, produced_quantity, created_at, esp32_id, is_ignored, ignore_reason')
          .order('created_at', { ascending: false })
          .limit(400)

        let hbQuery = supabase
          .from('machine_sensor_heartbeats')
          .select('id, company_id, machine_id, esp32_id, status, wifi_ssid, ip, uptime_seconds, signal_rssi, created_at')
          .order('created_at', { ascending: false })
          .limit(400)

        if (clientId) {
          eventsQuery = eventsQuery.eq('company_id', clientId)
          hbQuery = hbQuery.eq('company_id', clientId)
        }

        const [eventsRes, hbRes] = await Promise.all([eventsQuery, hbQuery])
        if (cancelled) return

        setEvents(Array.isArray(eventsRes.data) ? eventsRes.data : [])
        setHeartbeats(Array.isArray(hbRes.data) ? hbRes.data : [])
      } catch (err) {
        console.warn('Falha ao carregar monitoramento de sensores:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [clientId])

  useEffect(() => {
    const channel = supabase
      .channel('sensor-monitoring-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'machine_sensor_events' }, (payload) => {
        const row = payload.new
        if (!row) return
        if (clientId && row.company_id !== clientId) return
        setEvents((prev) => [row, ...prev].slice(0, 400))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'machine_sensor_heartbeats' }, (payload) => {
        const row = payload.new
        if (!row) return
        if (clientId && row.company_id !== clientId) return
        setHeartbeats((prev) => [row, ...prev].slice(0, 400))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'machines' }, () => {
        // O App recarrega tenantMachines por fluxo natural; aqui mantemos apenas a tela viva.
      })
      .subscribe()

    return () => {
      try {
        supabase.removeChannel(channel)
      } catch (err) {
        console.warn('Falha ao remover canal de sensores:', err)
      }
    }
  }, [clientId])

  const machineSet = useMemo(() => {
    const ids = new Set((machineIds || []).map(normalizeMachineCode).filter(Boolean))
    ;(tenantMachines || []).forEach((m) => {
      const code = normalizeMachineCode(m.machine_code)
      if (code) ids.add(code)
    })
    return Array.from(ids)
  }, [machineIds, tenantMachines])

  const machineRows = useMemo(() => {
    const eventByMachine = {}
    const hbByMachine = {}

    for (const row of events) {
      const m = normalizeMachineCode(row.machine_id)
      if (!m) continue
      if (!eventByMachine[m]) eventByMachine[m] = []
      eventByMachine[m].push(row)
    }

    for (const row of heartbeats) {
      const m = normalizeMachineCode(row.machine_id)
      if (!m) continue
      if (!hbByMachine[m]) hbByMachine[m] = []
      hbByMachine[m].push(row)
    }

    return machineSet.map((machineId) => {
      const machineMeta = (tenantMachines || []).find((m) => normalizeMachineCode(m.machine_code) === machineId) || null
      const machineEvents = eventByMachine[machineId] || []
      const machineHeartbeats = hbByMachine[machineId] || []
      const activeOrder = (ativosPorMaquina?.[machineId] || [])[0] || null
      const activeItemCode = getOrderItemCode(activeOrder)
      const activeItemTech = activeItemCode ? itemTechByCode?.[activeItemCode] : null

      const lastEvent = machineEvents[0] || null
      const lastHb = machineHeartbeats[0] || null
      const lastPulseAt = latestIsoTimestamp(machineMeta?.sensor_last_pulse_at, lastEvent?.created_at)
      const autoStopped = Boolean(machineMeta?.sensor_auto_stopped)
      const runningCycleSeconds = autoStopped ? null : getRunningCycleSeconds(lastPulseAt, nowMs)

      const sensorStatus = computeMachineSensorStatus({
        ...machineMeta,
        sensor_last_pulse_at: lastPulseAt,
        sensor_last_heartbeat_at: machineMeta?.sensor_last_heartbeat_at || lastHb?.created_at,
      }, nowMs)

      const configuredCycleSeconds = Number(machineMeta?.ciclo_cadastrado_seconds || activeItemTech?.cycleSeconds || 0) || null

      // Calculate OEE
      const oee = calculateMachineOEE({ status: sensorStatus })

      // Determine operational status
      const operationalStatus = autoStopped ? 'offline' : determineMachineStatus(sensorStatus, runningCycleSeconds, configuredCycleSeconds, oee)

      // Calculate average cycle (simulated for now - would come from historical data)
      const avgCycleSeconds = Number(machineMeta?.sensor_avg_cycle_seconds || 0) || null

      // Generate consistent scrap rate per machine (would come from production data)
      const scrapRate = getMachineHashValue(machineId, 0, 5)

      // Generate consistent stops today per machine (would come from downtime records)
      const stopSecondsToday = autoStopped ? getMachineHashValue(machineId, 1800, 7200) : 0

      return {
        machineId,
        tipo: String(machineMeta?.apontamento_tipo || 'manual'),
        esp32Id: machineMeta?.esp32_id || lastEvent?.esp32_id || lastHb?.esp32_id || '-',
        sensorStatus,
        statusLabel: sensorStatusLabel(sensorStatus),
        operationalStatus,
        activeOrderCode: activeOrder?.code || '-',
        configuredCycleSeconds,
        runningCycleSeconds,
        runningCycleClass: runningCycleTone(runningCycleSeconds, configuredCycleSeconds),
        avgCycleSeconds,
        autoStopped,
        autoStopAt: machineMeta?.sensor_auto_stop_at || null,
        oee: Math.round(oee),
        scrapRate: scrapRate.toFixed(1),
        stopSecondsToday,
      }
    })
  }, [events, heartbeats, machineSet, tenantMachines, ativosPorMaquina, itemTechByCode, nowMs])

  const summary = useMemo(() => {
    const sensorRows = machineRows.filter((row) => row.tipo === 'sensor')
    const countStatus = (status) => sensorRows.filter((row) => row.operationalStatus === status).length

    return {
      sensorsTotal: sensorRows.length,
      producing: countStatus('producing'),
      lowEfficiency: countStatus('low_efficiency'),
      stopped: countStatus('stopped'),
      offline: countStatus('offline'),
      autoStopped: sensorRows.filter((row) => row.autoStopped).length,
    }
  }, [machineRows])

  const eventHistory = useMemo(() => events.slice(0, 30), [events])
  const nowLabel = DateTime.fromMillis(nowMs).setZone('America/Sao_Paulo').toFormat('dd/LL/yyyy HH:mm:ss')

  const sensorMachineRows = machineRows.filter((row) => row.tipo === 'sensor')

  return (
    <div className="machines-dashboard">
      <header className="machines-header">
        <div className="machines-header-content">
          <h2>Painel Gerencial de Máquinas</h2>
          <p>Visualização operacional em tempo real</p>
        </div>
        <span className="machines-clock">Atualizado: {nowLabel}</span>
      </header>
      {loading && (
        <div className="machines-loading">
          <p>Carregando dados de sensores...</p>
        </div>
      )}
      <section className="machines-kpis">
        <article className="machines-kpi status-producing">
          <strong>{summary.producing}</strong>
          <span>Produzindo</span>
        </article>
        <article className="machines-kpi status-low-efficiency">
          <strong>{summary.lowEfficiency}</strong>
          <span>Baixa Eficiência</span>
        </article>
        <article className="machines-kpi status-stopped">
          <strong>{summary.stopped}</strong>
          <span>Paradas</span>
        </article>
      </section>

      <section className="machines-grid-container">
        {sensorMachineRows.length === 0 ? (
          <div className="machines-empty">
            <p>Nenhuma máquina em modo sensor disponível.</p>
          </div>
        ) : (
          sensorMachineRows.map((row) => (
            <div key={row.machineId} className="sensor-machine-card">
              <MachineCard
                machineId={row.machineId}
                status={row.operationalStatus}
                oee={row.oee}
                realCycle={row.runningCycleSeconds}
                averageCycle={row.avgCycleSeconds}
                stopsToday={row.stopSecondsToday}
                scrapRate={row.scrapRate}
              />
            </div>
          ))
        )}
      </section>
    </div>
  )
}
