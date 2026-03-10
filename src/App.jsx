import React from 'react'
import DemoApp from './demo/DemoApp'
import SiteApp from './site/SiteApp'

export default function App() {
  const hostname = String(window.location.hostname || '').toLowerCase()
  const demoHosts = new Set(['demo.localhost', 'demo.techargos.com.br'])
  const isDemoHost = demoHosts.has(hostname)

  return isDemoHost ? <DemoApp /> : <SiteApp />
}
