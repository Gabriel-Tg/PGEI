import React, { useEffect, useMemo, useState } from 'react'
import './admin.css'
import { supabase } from '../lib/supabaseClient'
import AdminLayout from './components/AdminLayout'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import DashboardCards from './components/DashboardCards'
import ClientsTable from './components/ClientsTable'
import MachinesSection from './components/MachinesSection'

const ADMIN_LOGIN = 'gabrielalvesdesiqueira683@gmail.com'

const MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard geral', description: 'Visao de operacao e clientes' },
  { key: 'clients', label: 'Gestao de clientes', description: 'Status, planos e acessos' },
  { key: 'machines', label: 'Maquinas', description: 'Parque instalado por cliente' },
]

export default function AdminPanel() {
  const [activeSection, setActiveSection] = useState('dashboard')
  const [clients, setClients] = useState([])
  const [machines, setMachines] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  const [dataError, setDataError] = useState('')
  const [credentials, setCredentials] = useState({ login: '', password: '' })
  const [adminEmail, setAdminEmail] = useState('')
  const [authError, setAuthError] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showClientModal, setShowClientModal] = useState(false)
  const [showMachineModal, setShowMachineModal] = useState(false)
  const [editingClientId, setEditingClientId] = useState(null)
  const [editingMachineId, setEditingMachineId] = useState(null)
  const [clientForm, setClientForm] = useState({
    name: '',
    subdomain: '',
    active: true,
    is_demo: false,
    admin_username: 'admin',
    admin_password: '',
  })
  const [machineForm, setMachineForm] = useState({
    company_id: '',
    machine_code: '',
    machine_name: '',
    route_slug: '',
    sector: '',
    active: true,
    apontamento_tipo: 'manual',
    esp32_id: '',
    sensor_token: '',
    sensor_token_last4: '',
  })

  async function sha256Hex(value) {
    const text = String(value || '')
    const data = new TextEncoder().encode(text)
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  function normalizeEdgeFunctionError(err) {
    const message = String(err?.message || '')
    const lower = message.toLowerCase()
    if (lower.includes('failed to send a request to the edge function')) {
      return 'Falha de integração: a função create-client-access-user não está publicada no Supabase (ou está inacessível). Faça o deploy da Edge Function e tente novamente.'
    }
    if (lower.includes('not found') || lower.includes('404')) {
      return 'A função create-client-access-user não foi encontrada no Supabase. Publique a Edge Function e tente novamente.'
    }
    return message || 'Falha ao criar usuário admin inicial do cliente.'
  }

  function handleAuthInput(event) {
    const { name, value } = event.target
    setCredentials((prev) => ({ ...prev, [name]: value }))
  }

  async function handleAuthenticate(event) {
    event.preventDefault()
    const login = String(credentials.login || '').trim().toLowerCase()
    const password = String(credentials.password || '').trim()

    if (login !== ADMIN_LOGIN) {
      setAuthError('Acesso permitido somente para o e-mail administrador principal.')
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: login, password })
    if (error) {
      setAuthError(`Falha ao autenticar no Supabase: ${error.message}. Use a senha definida no Supabase para este e-mail.`)
      return
    }

    const sessionEmail = String(data?.user?.email || login).trim().toLowerCase()
    if (sessionEmail !== ADMIN_LOGIN) {
      await supabase.auth.signOut()
      setAuthError('Sessão autenticada sem permissão para o painel administrativo.')
      return
    }

    setAdminEmail(sessionEmail)
    setIsAuthenticated(true)
    setAuthError('')
  }

  async function loadData() {
    setLoadingData(true)
    setDataError('')
    try {
      const [{ data: clientsData, error: clientsErr }, { data: machinesData, error: machinesErr }] = await Promise.all([
        supabase.from('companies').select('id, name, slug, subdomain, active, is_demo, created_at').order('created_at', { ascending: false }),
        supabase
          .from('machines')
          .select('id, company_id, machine_code, machine_name, route_slug, sector, active, apontamento_tipo, esp32_id, sensor_token_last4, sensor_last_pulse_at, sensor_last_heartbeat_at, sensor_status, sensor_auto_stopped, sensor_auto_stop_at, created_at')
          .order('created_at', { ascending: false }),
      ])

      if (clientsErr) throw clientsErr
      if (machinesErr) throw machinesErr

      const clientList = Array.isArray(clientsData) ? clientsData : []
      const machineList = Array.isArray(machinesData) ? machinesData : []

      const countByClient = machineList.reduce((acc, row) => {
        const key = String(row.company_id || '')
        if (!key) return acc
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})

      const nameByClient = clientList.reduce((acc, row) => {
        acc[String(row.id)] = row.name
        return acc
      }, {})

      setClients(clientList.map((item) => ({ ...item, machine_count: countByClient[String(item.id)] || 0 })))
      setMachines(machineList.map((item) => ({ ...item, client_name: nameByClient[String(item.company_id)] || '-' })))
    } catch (err) {
      setDataError(err?.message || 'Falha ao carregar dados do painel.')
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const email = String(data?.user?.email || '').trim().toLowerCase()
      if (!active) return

      if (email === ADMIN_LOGIN) {
        setAdminEmail(email)
        setIsAuthenticated(true)
      } else {
        setIsAuthenticated(false)
        if (email) {
          await supabase.auth.signOut()
        }
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    loadData()
  }, [isAuthenticated])

  const metrics = useMemo(() => {
    const activeCompanies = clients.filter((item) => item.active).length
    const inactiveCompanies = clients.length - activeCompanies
    const totalMachines = machines.length

    return {
      totalClients: clients.length,
      activeCompanies,
      inactiveCompanies,
      totalMachines,
      recentAlerts: 0,
      scansToday: 0,
    }
  }, [clients, machines])

  function normalizeSlug(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  function normalizeSubdomainInput(value) {
    const raw = String(value || '').trim().toLowerCase()
    if (!raw) return ''

    const clean = raw
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/^\.+/, '')

    const firstLabel = clean.split('.')[0] || ''
    return normalizeSlug(firstLabel)
  }

  function normalizeUsernameInput(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
  }

  function openClientModal() {
    setEditingClientId(null)
    setClientForm({
      name: '',
      subdomain: '',
      active: true,
      is_demo: false,
      admin_username: 'admin',
      admin_password: '',
    })
    setShowClientModal(true)
  }

  function openMachineModal(client) {
    setEditingMachineId(null)
    setMachineForm({
      company_id: client?.id || '',
      machine_code: '',
      machine_name: '',
      route_slug: '',
      sector: '',
      active: true,
      apontamento_tipo: 'manual',
      esp32_id: '',
      sensor_token: '',
      sensor_token_last4: '',
    })
    setShowMachineModal(true)
  }

  function openEditClientModal(client) {
    setEditingClientId(client.id)
    setClientForm({
      name: client.name || '',
      subdomain: client.subdomain || '',
      active: !!client.active,
      is_demo: !!client.is_demo,
      admin_username: '',
      admin_password: '',
    })
    setShowClientModal(true)
  }

  function openEditMachineModal(machine) {
    setEditingMachineId(machine.id)
    setMachineForm({
      company_id: machine.company_id || '',
      machine_code: machine.machine_code || '',
      machine_name: machine.machine_name || '',
      route_slug: machine.route_slug || '',
      sector: machine.sector || '',
      active: !!machine.active,
      apontamento_tipo: machine.apontamento_tipo || 'manual',
      esp32_id: machine.esp32_id || '',
      sensor_token: '',
      sensor_token_last4: machine.sensor_token_last4 || '',
    })
    setShowMachineModal(true)
  }

  async function handleToggleStatus(clientId) {
    const current = clients.find((item) => item.id === clientId)
    if (!current) return
    const next = !current.active
    const { error } = await supabase.from('companies').update({ active: next }).eq('id', clientId)
    if (error) {
      alert(error.message || 'Falha ao alterar status do cliente.')
      return
    }
    await loadData()
  }

  async function handleToggleSensorReception(machine) {
    if (!machine?.id) return
    const currentStopped = Boolean(machine.sensor_auto_stopped)
    const payload = {
      sensor_auto_stopped: !currentStopped,
      sensor_auto_stop_at: currentStopped ? null : new Date().toISOString(),
    }

    const { error } = await supabase.from('machines').update(payload).eq('id', machine.id)
    if (error) {
      alert(error.message || 'Falha ao alterar recepção do sensor.')
      return
    }

    setMachines((prev) => prev.map((item) => (
      item.id === machine.id ? { ...item, ...payload } : item
    )))
  }

  async function handleCreateClient(event) {
    event.preventDefault()
    const name = String(clientForm.name || '').trim()
    const subdomain = normalizeSubdomainInput(clientForm.subdomain) || normalizeSlug(name)
    const slug = subdomain

    if (!name || !subdomain) {
      alert('Preencha nome e subdominio válidos.')
      return
    }

    const payload = {
      name,
      slug,
      subdomain,
      active: !!clientForm.active,
      is_demo: !!clientForm.is_demo,
    }

    let clientId = editingClientId
    if (editingClientId) {
      const { error } = await supabase.from('companies').update(payload).eq('id', editingClientId)
      if (error) {
        alert(error.message || 'Falha ao atualizar cliente.')
        return
      }
    } else {
      const adminUsername = normalizeUsernameInput(clientForm.admin_username)
      const adminPassword = String(clientForm.admin_password || '').trim()
      if (!adminUsername) {
        alert('Informe o usuário admin inicial da empresa.')
        return
      }
      if (!adminPassword) {
        alert('Informe a senha do admin inicial da empresa.')
        return
      }

      const { data, error } = await supabase.from('companies').insert([payload]).select('id').maybeSingle()
      if (error) {
        alert(error.message || 'Falha ao cadastrar cliente.')
        return
      }
      clientId = data?.id || null

      if (!clientId) {
        alert('Cliente criado sem identificador. Tente novamente.')
        return
      }

      const { data: userData, error: userError } = await supabase.functions.invoke('create-client-access-user', {
        body: {
          clientId,
          username: adminUsername,
          fullName: `${name} - Admin`,
          password: adminPassword,
          role: 'admin',
        },
      })

      if (userError || userData?.error) {
        await supabase.from('companies').delete().eq('id', clientId)
        const edgeMessage = userError ? normalizeEdgeFunctionError(userError) : String(userData?.error || '')
        alert(edgeMessage || 'Falha ao criar usuário admin inicial do cliente.')
        return
      }
    }

    setShowClientModal(false)
    setEditingClientId(null)
    setActiveSection('clients')
    await loadData()
  }

  async function handleCreateMachine(event) {
    event.preventDefault()

    const sensorToken = String(machineForm.sensor_token || '').trim()
    const sensorTokenHash = sensorToken ? await sha256Hex(sensorToken) : ''
    const sensorTokenLast4 = sensorToken
      ? sensorToken.slice(-4)
      : (String(machineForm.sensor_token_last4 || '').trim() || null)

    const payload = {
      company_id: machineForm.company_id,
      machine_code: String(machineForm.machine_code || '').trim().toUpperCase(),
      machine_name: String(machineForm.machine_name || '').trim() || null,
      route_slug: normalizeSlug(machineForm.route_slug || machineForm.machine_code),
      sector: String(machineForm.sector || '').trim() || null,
      active: !!machineForm.active,
      apontamento_tipo: String(machineForm.apontamento_tipo || 'manual'),
      esp32_id: String(machineForm.esp32_id || '').trim().toLowerCase() || null,
    }

    if (sensorTokenHash) {
      payload.sensor_token_hash = sensorTokenHash
      payload.sensor_token_last4 = sensorTokenLast4
    }

    if (!payload.company_id || !payload.machine_code) {
      alert('Selecione um cliente e informe o código da máquina.')
      return
    }

    if (editingMachineId) {
      const { error } = await supabase.from('machines').update(payload).eq('id', editingMachineId)
      if (error) {
        alert(error.message || 'Falha ao atualizar máquina.')
        return
      }
    } else {
      const { error } = await supabase.from('machines').insert([payload])
      if (error) {
        alert(error.message || 'Falha ao cadastrar máquina.')
        return
      }
    }

    setShowMachineModal(false)
    setEditingMachineId(null)
    setActiveSection('machines')
    await loadData()
  }

  async function handleDeleteClient(clientId) {
    if (!window.confirm('Excluir cliente? Essa ação remove todos os registros desse cliente.')) return

    const orderedTables = [
      'production_scans',
      'scrap_logs',
      'machine_stops',
      'machine_sensor_events',
      'machine_sensor_heartbeats',
      'injection_production_entries',
      'low_efficiency_logs',
      'shift_responsibles',
      'tablet_status',
      'machine_priorities',
      'tech_sheet_revisions',
      'tech_sheets',
      'item_structures',
      'estoque_purchases',
      'orders',
      'company_users',
      'machines',
      'items',
      'item',
    ]

    async function deleteByClientId(table) {
      const { error } = await supabase.from(table).delete().eq('company_id', clientId)
      if (!error) return null

      const msg = String(error.message || '').toLowerCase()
      const code = String(error.code || '').toLowerCase()
      const relationMissing =
        msg.includes('does not exist') ||
        msg.includes('not found') ||
        msg.includes('could not find the table') ||
        msg.includes('schema cache') ||
        code === '42p01' ||
        code === 'pgrst204'
      if (relationMissing) return null
      return error
    }

    for (const table of orderedTables) {
      const err = await deleteByClientId(table)
      if (err) {
        alert(`Falha ao limpar dados em ${table}: ${err.message || 'erro desconhecido'}`)
        return
      }
    }

    const { error: deleteClientErr } = await supabase.from('companies').delete().eq('id', clientId)
    if (deleteClientErr) {
      alert(deleteClientErr.message || 'Falha ao excluir cliente.')
      return
    }

    await loadData()
  }

  async function handleDeleteMachine(machineId) {
    if (!window.confirm('Excluir máquina?')) return
    const { error } = await supabase.from('machines').delete().eq('id', machineId)
    if (error) {
      alert(error.message || 'Falha ao excluir máquina.')
      return
    }
    await loadData()
  }

  async function handleMachineApontamentoTypeChange(machine, nextType) {
    if (!machine?.id) return
    const normalizedType = String(nextType || 'manual')
    const { error } = await supabase
      .from('machines')
      .update({ apontamento_tipo: normalizedType })
      .eq('id', machine.id)

    if (error) {
      alert(error.message || 'Falha ao atualizar tipo de apontamento da máquina.')
      return
    }

    setMachines((prev) => prev.map((item) => (
      item.id === machine.id
        ? { ...item, apontamento_tipo: normalizedType }
        : item
    )))
  }

  function renderSection() {
    if (activeSection === 'dashboard') {
      return (
        <div className="admin-stack">
          <DashboardCards metrics={metrics} />
        </div>
      )
    }

    if (activeSection === 'clients') {
      return (
        <ClientsTable
          clients={clients}
          onToggleStatus={handleToggleStatus}
          onOpenAddMachine={openMachineModal}
          onEditClient={openEditClientModal}
          onDeleteClient={handleDeleteClient}
        />
      )
    }

    if (activeSection === 'machines') {
      return (
        <MachinesSection
          machines={machines}
          onEditMachine={openEditMachineModal}
          onDeleteMachine={handleDeleteMachine}
          onChangeApontamentoType={handleMachineApontamentoTypeChange}
          onToggleSensorReception={handleToggleSensorReception}
        />
      )
    }

    return null
  }

  if (!isAuthenticated) {
    return (
      <div className="admin-page admin-auth-page">
        <section className="admin-auth-card" aria-label="Acesso administrativo">
          <p className="admin-eyebrow">Painel restrito</p>
          <h2>Acesso ao ARGOS Admin</h2>
          <p className="admin-auth-subtitle">Entre com o e-mail administrador principal e a senha do Supabase.</p>

          <form className="admin-auth-form" onSubmit={handleAuthenticate}>
            <label>
              E-mail
              <input
                name="login"
                type="email"
                autoComplete="username"
                value={credentials.login}
                onChange={handleAuthInput}
                required
              />
            </label>

            <label>
              Senha
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                value={credentials.password}
                onChange={handleAuthInput}
                required
              />
            </label>

            {authError ? <p className="admin-auth-error">{authError}</p> : null}

            <button type="submit" className="btn-primary">
              Entrar no painel
            </button>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <AdminLayout
        sidebar={<Sidebar items={MENU_ITEMS} activeSection={activeSection} onChangeSection={setActiveSection} />}
        topbar={
          <Topbar
            adminName={adminEmail || credentials.login || 'Equipe ARGOS'}
            hostLabel={window.location.hostname}
            quickStats={{ activeUsersNow: clients.length, openAlerts: 0 }}
            onOpenNewClient={openClientModal}
          />
        }
      >
        {dataError ? <p className="admin-auth-error">{dataError}</p> : null}
        {loadingData ? <p>Carregando dados...</p> : null}
        {renderSection()}

        {showClientModal && (
          <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
            <div className="admin-modal-card">
              <h3>{editingClientId ? 'Editar cliente' : 'Novo cliente'}</h3>
              <form className="admin-form-grid" onSubmit={handleCreateClient}>
                <label>
                  Nome da empresa
                  <input
                    value={clientForm.name}
                    onChange={(e) => setClientForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </label>

                <label>
                  Subdominio
                  <input
                    value={clientForm.subdomain}
                    onChange={(e) => setClientForm((prev) => ({ ...prev, subdomain: e.target.value }))}
                    placeholder="ex: metal-sul"
                    required
                  />
                </label>

                <label>
                  Ativo
                  <select
                    value={clientForm.active ? '1' : '0'}
                    onChange={(e) => setClientForm((prev) => ({ ...prev, active: e.target.value === '1' }))}
                  >
                    <option value="1">Sim</option>
                    <option value="0">Não</option>
                  </select>
                </label>

                {!editingClientId ? (
                  <>
                    <label>
                      Usuário Admin inicial
                      <input
                        value={clientForm.admin_username}
                        onChange={(e) => setClientForm((prev) => ({ ...prev, admin_username: e.target.value }))}
                        placeholder="admin"
                        required
                      />
                    </label>

                    <label>
                      Senha Admin inicial
                      <input
                        type="password"
                        value={clientForm.admin_password}
                        onChange={(e) => setClientForm((prev) => ({ ...prev, admin_password: e.target.value }))}
                        placeholder="Minimo 8 caracteres"
                        required
                      />
                    </label>
                  </>
                ) : null}

                <div className="full-width admin-form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowClientModal(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingClientId ? 'Salvar alterações' : 'Salvar cliente'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showMachineModal && (
          <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
            <div className="admin-modal-card">
              <h3>{editingMachineId ? 'Editar maquina' : 'Nova maquina'}</h3>
              <form className="admin-form-grid" onSubmit={handleCreateMachine}>
                <label>
                  Cliente
                  <select
                    value={machineForm.company_id}
                    onChange={(e) => setMachineForm((prev) => ({ ...prev, company_id: e.target.value }))}
                    required
                  >
                    <option value="">Selecione...</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Codigo
                  <input
                    value={machineForm.machine_code}
                    onChange={(e) => setMachineForm((prev) => ({ ...prev, machine_code: e.target.value }))}
                    placeholder="P1"
                    required
                  />
                </label>

                <label>
                  Nome
                  <input
                    value={machineForm.machine_name}
                    onChange={(e) => setMachineForm((prev) => ({ ...prev, machine_name: e.target.value }))}
                    placeholder="Injetora P1"
                  />
                </label>

                <label>
                  Rota
                  <input
                    value={machineForm.route_slug}
                    onChange={(e) => setMachineForm((prev) => ({ ...prev, route_slug: e.target.value }))}
                    placeholder="pet-01"
                  />
                </label>

                <label>
                  Setor
                  <input
                    value={machineForm.sector}
                    onChange={(e) => setMachineForm((prev) => ({ ...prev, sector: e.target.value }))}
                    placeholder="Injecao"
                  />
                </label>

                <label>
                  Ativa
                  <select
                    value={machineForm.active ? '1' : '0'}
                    onChange={(e) => setMachineForm((prev) => ({ ...prev, active: e.target.value === '1' }))}
                  >
                    <option value="1">Sim</option>
                    <option value="0">Não</option>
                  </select>
                </label>

                <label>
                  Tipo de apontamento
                  <select
                    value={machineForm.apontamento_tipo}
                    onChange={(e) => setMachineForm((prev) => ({ ...prev, apontamento_tipo: e.target.value }))}
                  >
                    <option value="manual">Manual</option>
                    <option value="bipagem">Bipagem</option>
                    <option value="sensor">Sensor (ESP32)</option>
                  </select>
                </label>

                <label>
                  ESP32 ID
                  <input
                    value={machineForm.esp32_id}
                    onChange={(e) => setMachineForm((prev) => ({ ...prev, esp32_id: e.target.value }))}
                    placeholder="argos-box-01"
                  />
                </label>

                <label className="full-width">
                  Token do sensor {editingMachineId ? '(deixe vazio para manter)' : ''}
                  <input
                    type="password"
                    value={machineForm.sensor_token}
                    onChange={(e) => setMachineForm((prev) => ({ ...prev, sensor_token: e.target.value }))}
                    placeholder={editingMachineId && machineForm.sensor_token_last4 ? `Token atual termina com ${machineForm.sensor_token_last4}` : 'Defina um token seguro'}
                  />
                </label>

                <div className="full-width admin-form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowMachineModal(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary">
                    Salvar maquina
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </AdminLayout>
    </div>
  )
}

