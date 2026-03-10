import React, { useEffect, useMemo, useState } from 'react'
import './admin.css'
import { supabase } from '../lib/supabaseClient'
import { createClient } from '@supabase/supabase-js'
import AdminLayout from './components/AdminLayout'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import DashboardCards from './components/DashboardCards'
import ClientsTable from './components/ClientsTable'
import MachinesSection from './components/MachinesSection'

const ADMIN_LOGIN = 'gabrielalvesdesiqueira683@gmail.com'
const ADMIN_PASSWORD = 'gabrielalvesdesiqueira683@gmail.com'

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
  const [authError, setAuthError] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showClientModal, setShowClientModal] = useState(false)
  const [showMachineModal, setShowMachineModal] = useState(false)
  const [editingClientId, setEditingClientId] = useState(null)
  const [editingMachineId, setEditingMachineId] = useState(null)
  const [clientForm, setClientForm] = useState({ name: '', slug: '', subdomain: '', active: true, is_demo: false, access_email: '', access_password: '', access_name: '' })
  const [machineForm, setMachineForm] = useState({ client_id: '', machine_code: '', machine_name: '', route_slug: '', sector: '', active: true })

  const url = import.meta.env.VITE_SUPABASE_URL
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

  function handleAuthInput(event) {
    const { name, value } = event.target
    setCredentials((prev) => ({ ...prev, [name]: value }))
  }

  function handleAuthenticate(event) {
    event.preventDefault()
    const login = String(credentials.login || '').trim().toLowerCase()
    const password = String(credentials.password || '').trim()

    if (login === ADMIN_LOGIN && password === ADMIN_PASSWORD) {
      setIsAuthenticated(true)
      setAuthError('')
      return
    }

    setAuthError('Credenciais invalidas. Verifique login e senha.')
  }

  async function loadData() {
    setLoadingData(true)
    setDataError('')
    try {
      const [{ data: clientsData, error: clientsErr }, { data: machinesData, error: machinesErr }] = await Promise.all([
        supabase.from('clients').select('id, name, slug, subdomain, active, is_demo, created_at').order('created_at', { ascending: false }),
        supabase.from('machines').select('id, client_id, machine_code, machine_name, route_slug, sector, active, created_at').order('created_at', { ascending: false }),
      ])

      if (clientsErr) throw clientsErr
      if (machinesErr) throw machinesErr

      const clientList = Array.isArray(clientsData) ? clientsData : []
      const machineList = Array.isArray(machinesData) ? machinesData : []

      const countByClient = machineList.reduce((acc, row) => {
        const key = String(row.client_id || '')
        if (!key) return acc
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})

      const nameByClient = clientList.reduce((acc, row) => {
        acc[String(row.id)] = row.name
        return acc
      }, {})

      setClients(clientList.map((item) => ({ ...item, machine_count: countByClient[String(item.id)] || 0 })))
      setMachines(machineList.map((item) => ({ ...item, client_name: nameByClient[String(item.client_id)] || '-' })))
    } catch (err) {
      setDataError(err?.message || 'Falha ao carregar dados do painel.')
    } finally {
      setLoadingData(false)
    }
  }

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

  function openClientModal() {
    setEditingClientId(null)
    setClientForm({ name: '', slug: '', subdomain: '', active: true, is_demo: false, access_email: '', access_password: '', access_name: '' })
    setShowClientModal(true)
  }

  function openMachineModal(client) {
    setEditingMachineId(null)
    setMachineForm({
      client_id: client?.id || '',
      machine_code: '',
      machine_name: '',
      route_slug: '',
      sector: '',
      active: true,
    })
    setShowMachineModal(true)
  }

  function openEditClientModal(client) {
    setEditingClientId(client.id)
    setClientForm({
      name: client.name || '',
      slug: client.slug || '',
      subdomain: client.subdomain || '',
      active: !!client.active,
      is_demo: !!client.is_demo,
      access_email: '',
      access_password: '',
      access_name: '',
    })
    setShowClientModal(true)
  }

  function openEditMachineModal(machine) {
    setEditingMachineId(machine.id)
    setMachineForm({
      client_id: machine.client_id || '',
      machine_code: machine.machine_code || '',
      machine_name: machine.machine_name || '',
      route_slug: machine.route_slug || '',
      sector: machine.sector || '',
      active: !!machine.active,
    })
    setShowMachineModal(true)
  }

  async function handleToggleStatus(clientId) {
    const current = clients.find((item) => item.id === clientId)
    if (!current) return
    const next = !current.active
    const { error } = await supabase.from('clients').update({ active: next }).eq('id', clientId)
    if (error) {
      alert(error.message || 'Falha ao alterar status do cliente.')
      return
    }
    await loadData()
  }

  async function createClientAccessUser({ clientId, email, password, fullName }) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const cleanPassword = String(password || '').trim()
    if (!normalizedEmail || !cleanPassword) return

    const isolated = createClient(url, anon, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const { error: signUpError } = await isolated.auth.signUp({
      email: normalizedEmail,
      password: cleanPassword,
      options: {
        data: {
          full_name: fullName || null,
        },
      },
    })

    if (signUpError && !String(signUpError.message || '').toLowerCase().includes('already')) {
      throw signUpError
    }

    const { data: existingRow, error: findErr } = await supabase
      .from('client_users')
      .select('id, email')
      .eq('client_id', clientId)
      .ilike('email', normalizedEmail)
      .limit(1)
      .maybeSingle()

    if (findErr) throw findErr

    if (existingRow?.id) {
      const { error: updErr } = await supabase
        .from('client_users')
        .update({
          email: normalizedEmail,
          full_name: String(fullName || '').trim() || null,
          role: 'manager',
          active: true,
        })
        .eq('id', existingRow.id)

      if (updErr) throw updErr
      return
    }

    const { error: insertErr } = await supabase.from('client_users').insert([
      {
        client_id: clientId,
        email: normalizedEmail,
        full_name: String(fullName || '').trim() || null,
        role: 'manager',
        active: true,
      },
    ])

    if (insertErr) throw insertErr
  }

  async function handleCreateClient(event) {
    event.preventDefault()
    const name = String(clientForm.name || '').trim()
    const slug = normalizeSlug(clientForm.slug || name)
    const subdomain = normalizeSlug(clientForm.subdomain || slug)

    if (!name || !slug || !subdomain) {
      alert('Preencha nome, slug e subdominio válidos.')
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
      const { error } = await supabase.from('clients').update(payload).eq('id', editingClientId)
      if (error) {
        alert(error.message || 'Falha ao atualizar cliente.')
        return
      }
    } else {
      const { data, error } = await supabase.from('clients').insert([payload]).select('id').maybeSingle()
      if (error) {
        alert(error.message || 'Falha ao cadastrar cliente.')
        return
      }
      clientId = data?.id || null
    }

    try {
      if (clientId && clientForm.access_email && clientForm.access_password) {
        await createClientAccessUser({
          clientId,
          email: clientForm.access_email,
          password: clientForm.access_password,
          fullName: clientForm.access_name,
        })
      }
    } catch (err) {
      alert(`Cliente salvo, mas falhou ao criar usuário de acesso: ${err?.message || 'erro desconhecido'}`)
    }

    setShowClientModal(false)
    setEditingClientId(null)
    setActiveSection('clients')
    await loadData()
  }

  async function handleCreateMachine(event) {
    event.preventDefault()

    const payload = {
      client_id: machineForm.client_id,
      machine_code: String(machineForm.machine_code || '').trim().toUpperCase(),
      machine_name: String(machineForm.machine_name || '').trim() || null,
      route_slug: normalizeSlug(machineForm.route_slug || machineForm.machine_code),
      sector: String(machineForm.sector || '').trim() || null,
      active: !!machineForm.active,
    }

    if (!payload.client_id || !payload.machine_code) {
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
      'client_users',
      'machines',
      'items',
      'item',
    ]

    async function deleteByClientId(table) {
      const { error } = await supabase.from(table).delete().eq('client_id', clientId)
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

    const { error: deleteClientErr } = await supabase.from('clients').delete().eq('id', clientId)
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
      return <MachinesSection machines={machines} onEditMachine={openEditMachineModal} onDeleteMachine={handleDeleteMachine} />
    }

    return null
  }

  if (!isAuthenticated) {
    return (
      <div className="admin-page admin-auth-page">
        <section className="admin-auth-card" aria-label="Acesso administrativo">
          <p className="admin-eyebrow">Painel restrito</p>
          <h2>Acesso ao ARGOS Admin</h2>
          <p className="admin-auth-subtitle">Entre com login e senha autorizados para painel.techargos.com.br.</p>

          <form className="admin-auth-form" onSubmit={handleAuthenticate}>
            <label>
              Login
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
            adminName={credentials.login || 'Equipe ARGOS'}
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
                  Slug
                  <input
                    value={clientForm.slug}
                    onChange={(e) => setClientForm((prev) => ({ ...prev, slug: e.target.value }))}
                    placeholder="ex: metal-sul"
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

                <label className="full-width" style={{ marginTop: 8, fontWeight: 700 }}>
                  Acesso do cliente (opcional)
                </label>

                <label>
                  E-mail de acesso
                  <input
                    type="email"
                    value={clientForm.access_email}
                    onChange={(e) => setClientForm((prev) => ({ ...prev, access_email: e.target.value }))}
                    placeholder="operador@cliente.com"
                  />
                </label>

                <label>
                  Senha inicial
                  <input
                    type="password"
                    value={clientForm.access_password}
                    onChange={(e) => setClientForm((prev) => ({ ...prev, access_password: e.target.value }))}
                    placeholder="Senha temporária"
                  />
                </label>

                <label>
                  Nome do usuário
                  <input
                    value={clientForm.access_name}
                    onChange={(e) => setClientForm((prev) => ({ ...prev, access_name: e.target.value }))}
                    placeholder="Operador responsável"
                  />
                </label>

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
                    value={machineForm.client_id}
                    onChange={(e) => setMachineForm((prev) => ({ ...prev, client_id: e.target.value }))}
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
