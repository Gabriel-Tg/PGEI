import React, { useEffect, useState } from 'react'
import DemoApp from './demo/DemoApp'
import SiteApp from './site/SiteApp'
import AdminPanel from './admin/AdminPanel'
import { supabase } from './lib/supabaseClient'

export default function App() {
  const [loadingTenant, setLoadingTenant] = useState(true)
  const [tenantClient, setTenantClient] = useState(null)

  const hostname = String(window.location.hostname || '').toLowerCase()
  const demoHosts = new Set(['demo.localhost', 'demo.techargos.com.br'])
  const adminHosts = new Set(['painel.localhost', 'painel.techargos.com.br'])
  const isDemoHost = demoHosts.has(hostname)
  const isAdminHost = adminHosts.has(hostname)

  useEffect(() => {
    let cancelled = false

    async function resolveTenant() {
      setLoadingTenant(true)
      if (isAdminHost) {
        if (!cancelled) {
          setTenantClient(null)
          setLoadingTenant(false)
        }
        return
      }

      if (isDemoHost) {
        const { data } = await supabase
          .from('clients')
          .select('id, name, slug, subdomain, is_demo, active')
          .or('slug.eq.demo,subdomain.eq.demo')
          .eq('active', true)
          .order('is_demo', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!cancelled) {
          setTenantClient(data || null)
          setLoadingTenant(false)
        }
        return
      }

      const labels = hostname.split('.')
      const subdomain = labels[0] || ''
      const isProdTenantDomain = hostname.endsWith('.techargos.com.br') && labels.length >= 4
      const isLocalTenantDomain = hostname.endsWith('.localhost') && labels.length >= 2
      const isTenantDomain = (isProdTenantDomain || isLocalTenantDomain) && subdomain && !['www', 'painel', 'demo'].includes(subdomain)

      if (!isTenantDomain) {
        if (!cancelled) {
          setTenantClient(null)
          setLoadingTenant(false)
        }
        return
      }

      const { data } = await supabase
        .from('clients')
        .select('id, name, slug, subdomain, is_demo, active')
        .eq('subdomain', subdomain)
        .eq('active', true)
        .maybeSingle()

      if (!cancelled) {
        setTenantClient(data || null)
        setLoadingTenant(false)
      }
    }

    resolveTenant()
    return () => { cancelled = true }
  }, [hostname, isAdminHost, isDemoHost])

  if (isAdminHost) {
    return <AdminPanel />
  }

  if (loadingTenant) {
    return <div style={{ padding: 20 }}>Carregando ambiente...</div>
  }

  if (tenantClient) {
    return <DemoApp tenantClient={tenantClient} />
  }

  return isDemoHost ? <DemoApp tenantClient={null} /> : <SiteApp />
}
