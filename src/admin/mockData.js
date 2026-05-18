export const initialClients = [
  {
    id: 'cl-001',
    companyName: 'Metal Sul Componentes',
    owner: 'Juliana Ribeiro',
    phone: '(11) 99882-1100',
    email: 'juliana@metalsul.com.br',
    plan: 'Enterprise',
    machines: 24,
    status: 'active',
    lastAccess: '10/03/2026 08:14',
    subdomain: 'metalsul.techargos.com.br',
  },
  {
    id: 'cl-002',
    companyName: 'Injetec Plásticos',
    owner: 'Roberto Lessa',
    phone: '(19) 99771-2200',
    email: 'roberto@injetec.com.br',
    plan: 'Pro',
    machines: 13,
    status: 'active',
    lastAccess: '10/03/2026 07:42',
    subdomain: 'injetec.techargos.com.br',
  },
  {
    id: 'cl-003',
    companyName: 'Fabril Nordeste',
    owner: 'Tatiane Moura',
    phone: '(81) 98883-7788',
    email: 'tatiane@fabrilnordeste.com.br',
    plan: 'Starter',
    machines: 6,
    status: 'inactive',
    lastAccess: '08/03/2026 21:10',
    subdomain: 'fabrilnordeste.techargos.com.br',
  },
  {
    id: 'cl-004',
    companyName: 'Usinagem Prime',
    owner: 'Leandro Xavier',
    phone: '(41) 99652-1200',
    email: 'leandro@usinagemprime.com.br',
    plan: 'Pro',
    machines: 11,
    status: 'active',
    lastAccess: '10/03/2026 08:02',
    subdomain: 'usinagemprime.techargos.com.br',
  },
]

export const plansCatalog = [
  { id: 'starter', name: 'Starter', monthlyPrice: 990, maxMachines: 8 },
  { id: 'pro', name: 'Pro', monthlyPrice: 2190, maxMachines: 20 },
  { id: 'enterprise', name: 'Enterprise', monthlyPrice: 4890, maxMachines: 60 },
]

export const machineInventory = [
  { id: 'mc-101', companyName: 'Metal Sul Componentes', code: 'P1', status: 'running' },
  { id: 'mc-102', companyName: 'Metal Sul Componentes', code: 'P2', status: 'idle' },
  { id: 'mc-103', companyName: 'Metal Sul Componentes', code: 'P3', status: 'maintenance' },
  { id: 'mc-201', companyName: 'Injetec Plásticos', code: 'I1', status: 'running' },
  { id: 'mc-202', companyName: 'Injetec Plásticos', code: 'I2', status: 'offline' },
  { id: 'mc-301', companyName: 'Fabril Nordeste', code: 'F1', status: 'offline' },
  { id: 'mc-401', companyName: 'Usinagem Prime', code: 'U1', status: 'running' },
  { id: 'mc-402', companyName: 'Usinagem Prime', code: 'U2', status: 'running' },
]

export const monitoringLogs = [
  {
    id: 'log-1',
    level: 'error',
    category: 'Sincronizacao',
    companyName: 'Injetec Plásticos',
    message: 'Fila de apontamentos acumulou 32 eventos sem envio.',
    timestamp: '10/03/2026 07:58',
  },
  {
    id: 'log-2',
    level: 'warning',
    category: 'Acesso',
    companyName: 'Fabril Nordeste',
    message: '4 tentativas de login inválidas no turno da madrugada.',
    timestamp: '10/03/2026 06:21',
  },
  {
    id: 'log-3',
    level: 'error',
    category: 'Integracao',
    companyName: 'Metal Sul Componentes',
    message: 'Webhook de fechamento retornou status 500.',
    timestamp: '09/03/2026 23:49',
  },
  {
    id: 'log-4',
    level: 'info',
    category: 'Sistema',
    companyName: 'Usinagem Prime',
    message: 'Rotina de backup concluida com sucesso.',
    timestamp: '09/03/2026 23:10',
  },
]

export const usageSummary = {
  activeUsersNow: 46,
  scansToday: 1892,
  openAlerts: 5,
  avgSessionMinutes: 34,
}

export const adminShortcuts = [
  { id: 'sc-1', title: 'Abrir chamados', description: 'Acessar pendencias de suporte da equipe.' },
  { id: 'sc-2', title: 'Auditoria de acessos', description: 'Revisar acessos administrativos recentes.' },
  { id: 'sc-3', title: 'Parametrizacao global', description: 'Atualizar regras padrao para novas empresas.' },
]
