import React, { useMemo, useState } from 'react'
import './admin.css'
import {
  adminShortcuts,
  initialClients,
  machineInventory,
  monitoringLogs,
  plansCatalog,
  usageSummary,
} from './mockData'
import AdminLayout from './components/AdminLayout'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import DashboardCards from './components/DashboardCards'
import ClientsTable from './components/ClientsTable'
import ClientForm from './components/ClientForm'
import PlansSection from './components/PlansSection'
import MachinesSection from './components/MachinesSection'
import MonitoringSection from './components/MonitoringSection'
import SupportSection from './components/SupportSection'

const ADMIN_LOGIN = 'gabrielalvesdesiqueira683@gmail.com'
const ADMIN_PASSWORD = 'gabrielalvesdesiqueira683@gmail.com'

const MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard geral', description: 'Visao de operacao e clientes' },
  { key: 'clients', label: 'Gestao de clientes', description: 'Status, planos e acessos' },
  { key: 'new-client', label: 'Cadastro de cliente', description: 'Onboarding de empresas' },
  { key: 'plans', label: 'Planos', description: 'Distribuicao e alteracoes' },
  { key: 'machines', label: 'Maquinas', description: 'Parque instalado por cliente' },
  { key: 'monitoring', label: 'Monitoramento', description: 'Erros e sincronizacao' },
  { key: 'support', label: 'Suporte/Admin', description: 'Atalhos administrativos' },
]

export default function AdminPanel() {
  const [activeSection, setActiveSection] = useState('dashboard')
  const [clients, setClients] = useState(initialClients)
  const [credentials, setCredentials] = useState({ login: '', password: '' })
  const [authError, setAuthError] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)

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

  const metrics = useMemo(() => {
    const activeCompanies = clients.filter((item) => item.status === 'active').length
    const inactiveCompanies = clients.length - activeCompanies
    const totalMachines = clients.reduce((sum, item) => sum + Number(item.machines || 0), 0)

    return {
      totalClients: clients.length,
      activeCompanies,
      inactiveCompanies,
      totalMachines,
      recentAlerts: monitoringLogs.filter((log) => log.level !== 'info').length,
      scansToday: usageSummary.scansToday,
    }
  }, [clients])

  function handleToggleStatus(clientId) {
    setClients((prev) =>
      prev.map((client) =>
        client.id === clientId
          ? { ...client, status: client.status === 'active' ? 'inactive' : 'active' }
          : client
      )
    )
  }

  function handleCreateClient(payload) {
    const now = new Date()
    const createdClient = {
      id: `cl-${Math.random().toString(36).slice(2, 7)}`,
      companyName: payload.companyName,
      owner: payload.owner,
      phone: payload.phone,
      email: payload.email,
      plan: payload.plan,
      machines: Number(payload.machines || 1),
      status: 'active',
      lastAccess: `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      subdomain: `${payload.subdomain}.techargos.com.br`,
    }

    setClients((prev) => [createdClient, ...prev])
    setActiveSection('clients')
  }

  function handleChangePlan(clientId, nextPlan) {
    setClients((prev) => prev.map((client) => (client.id === clientId ? { ...client, plan: nextPlan } : client)))
  }

  function handleEditClient(clientId) {
    const client = clients.find((item) => item.id === clientId)
    if (!client) return
    alert(`Edicao futura: ${client.companyName}`)
  }

  function renderSection() {
    if (activeSection === 'dashboard') {
      return (
        <div className="admin-stack">
          <DashboardCards metrics={metrics} />
          <MonitoringSection logs={monitoringLogs.slice(0, 3)} />
        </div>
      )
    }

    if (activeSection === 'clients') {
      return <ClientsTable clients={clients} onToggleStatus={handleToggleStatus} onEdit={handleEditClient} />
    }

    if (activeSection === 'new-client') {
      return <ClientForm onCreateClient={handleCreateClient} />
    }

    if (activeSection === 'plans') {
      return <PlansSection plans={plansCatalog} clients={clients} onChangePlan={handleChangePlan} />
    }

    if (activeSection === 'machines') {
      return <MachinesSection machines={machineInventory} />
    }

    if (activeSection === 'monitoring') {
      return <MonitoringSection logs={monitoringLogs} />
    }

    return <SupportSection shortcuts={adminShortcuts} />
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
            quickStats={usageSummary}
          />
        }
      >
        {renderSection()}
      </AdminLayout>
    </div>
  )
}
