import { useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { supabase } from '../lib/supabaseClient'
import { computeMachineSensorStatus, formatDateTimeBr, sensorStatusLabel } from '../lib/sensorRuntime'
import '../styles/sensores.css'

function normalizeMachineCode(value) {
  return String(value || '').trim().toUpperCase()
}

export default function Sensores({ clientId = null, machineIds = [], tenantMachines = [], ativosPorMaquina = {} }) {
  const [events, setEvents] = useState([])
  const [heartbeats, setHeartbeats] = useState([])
  const [loading, setLoading] = useState(false)

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
    const nowMs = Date.now()
    const oneHourAgo = nowMs - (60 * 60 * 1000)

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

      const lastEvent = machineEvents[0] || null
      const lastHb = machineHeartbeats[0] || null

      const status = computeMachineSensorStatus({
        ...machineMeta,
        sensor_last_pulse_at: machineMeta?.sensor_last_pulse_at || lastEvent?.created_at,
        sensor_last_heartbeat_at: machineMeta?.sensor_last_heartbeat_at || lastHb?.created_at,
      }, nowMs)

      return {
        machineId,
        tipo: String(machineMeta?.apontamento_tipo || 'manual'),
        esp32Id: machineMeta?.esp32_id || lastEvent?.esp32_id || lastHb?.esp32_id || '-',
        status,
        statusLabel: sensorStatusLabel(status),
        activeOrderCode: activeOrder?.code || '-',
        configuredCycleSeconds: Number(machineMeta?.ciclo_cadastrado_seconds || 0) || null,
        lastCycleSeconds: Number(machineMeta?.sensor_last_cycle_seconds || 0) || null,
        avgCycleSeconds: Number(machineMeta?.sensor_avg_cycle_seconds || 0) || null,
        autoStopped: Boolean(machineMeta?.sensor_auto_stopped),
        autoStopAt: machineMeta?.sensor_auto_stop_at || null,
      }
    })
  }, [events, heartbeats, machineSet, tenantMachines, ativosPorMaquina])

  const summary = useMemo(() => {
    const sensorRows = machineRows.filter((row) => row.tipo === 'sensor')
    const countStatus = (status) => sensorRows.filter((row) => row.status === status).length

    return {
      sensorsTotal: sensorRows.length,
      online: countStatus('online'),
      receiving: countStatus('recebendo_pulsos'),
      offline: countStatus('offline'),
      semComunicacao: countStatus('sem_comunicacao'),
      autoStopped: sensorRows.filter((row) => row.autoStopped).length,
    }
  }, [machineRows])

  const eventHistory = useMemo(() => events.slice(0, 30), [events])
  const nowLabel = DateTime.now().setZone('America/Sao_Paulo').toFormat('dd/LL/yyyy HH:mm:ss')

  return (
    <div className="sensor-page">
      <header className="sensor-header">
        <div>
          <h2>Monitoramento Industrial</h2>
          <p>Heartbeat, pulsos e produção em tempo real via ESP32</p>
        </div>
        <span className="sensor-clock">Atualizado: {nowLabel}</span>
      </header>

      <section className="sensor-kpis">
        <article>
          <strong>{summary.sensorsTotal}</strong>
          <span>Máquinas em modo sensor</span>
        </article>
        <article>
          <strong>{summary.receiving}</strong>
          <span>Recebendo pulsos</span>
        </article>
        <article>
          <strong>{summary.online}</strong>
          <span>Online</span>
        </article>
        <article>
          <strong>{summary.offline}</strong>
          <span>Offline</span>
        </article>
        <article>
          <strong>{summary.autoStopped}</strong>
          <span>Paradas sugeridas</span>
        </article>
      </section>

      <section className="sensor-grid">
        <article className="sensor-card">
          <h3>Máquinas e Conectividade</h3>
          {loading ? <p>Carregando dados de sensores...</p> : null}
          <div className="sensor-table-wrap">
            <table className="sensor-table">
              <thead>
                <tr>
                  <th>Máquina</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>ESP32</th>
                  <th>Ciclo cad.</th>
                  <th>Ciclo real</th>
                  <th>Ciclo médio</th>
                  <th>Auto-stop</th>
                  <th>O.P ativa</th>
                </tr>
              </thead>
              <tbody>
                {machineRows.map((row) => (
                  <tr key={row.machineId}>
                    <td>{row.machineId}</td>
                    <td><span className={`sensor-badge type ${row.tipo}`}>{row.tipo}</span></td>
                    <td><span className={`sensor-badge status ${row.status}`}>{row.statusLabel}</span></td>
                    <td>{row.esp32Id}</td>
                    <td>{row.configuredCycleSeconds ? `${row.configuredCycleSeconds}s` : '—'}</td>
                    <td>{row.lastCycleSeconds ? `${row.lastCycleSeconds.toFixed(3)}s` : '—'}</td>
                    <td>{row.avgCycleSeconds ? `${row.avgCycleSeconds.toFixed(3)}s` : '—'}</td>
                    <td className={row.autoStopped ? 'auto-stop-yes' : ''}>{row.autoStopped ? 'SIM' : '—'}</td>
                    <td>{row.activeOrderCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="sensor-card">
          <h3>Histórico de Pulsos</h3>
          <div className="sensor-history">
            {eventHistory.length === 0 ? (
              <div className="sensor-empty">Sem eventos de sensor registrados.</div>
            ) : (
              eventHistory.map((ev) => (
                <div key={ev.id} className="sensor-event-row">
                  <div>
                    <strong>{ev.machine_id}</strong>
                    <span>{formatDateTimeBr(ev.created_at)}</span>
                  </div>
                  <div>
                    <span>{Number(ev.pulse_count || 0)} pulsos</span>
                    <span>{Number(ev.cavities_used || 0)} cavidades</span>
                    <span>{Number(ev.produced_quantity || 0)} peças</span>
                  </div>
                  <div>
                    <span className={`sensor-badge inline ${ev.is_ignored ? 'offline' : 'recebendo_pulsos'}`}>
                      {ev.is_ignored ? 'Ignorado' : 'Processado'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  )
}
