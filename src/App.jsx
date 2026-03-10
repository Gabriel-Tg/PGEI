import React from 'react'
import DemoApp from './demo/DemoApp'
import SiteApp from './site/SiteApp'
import AdminPanel from './admin/AdminPanel'

export default function App() {
  const hostname = String(window.location.hostname || '').toLowerCase()
  const demoHosts = new Set(['demo.localhost', 'demo.techargos.com.br'])
  const adminHosts = new Set(['painel.localhost', 'painel.techargos.com.br'])
  const isDemoHost = demoHosts.has(hostname)
  const isAdminHost = adminHosts.has(hostname)

  if (isAdminHost) {
    return <AdminPanel />
  }

  return isDemoHost ? <DemoApp /> : <SiteApp />
}
