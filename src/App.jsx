import React from 'react'
import DemoApp from './demo/DemoApp'
import SiteApp from './site/SiteApp'

export default function App() {
  const hostname = String(window.location.hostname || '').toLowerCase()
  const isDemoHost = hostname === 'demo.localhost'

  return isDemoHost ? <DemoApp /> : <SiteApp />
}
