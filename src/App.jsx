import React, { useEffect, useState } from 'react'
import DemoApp from './demo/DemoApp'
import SiteApp from './site/SiteApp'
import AdminPanel from './admin/AdminPanel'
import { supabase } from './lib/supabaseClient'

export default function App() {
  const [loadingTenant, setLoadingTenant] = useState(true)
  const [tenantCompany, setTenantCompany] = useState(null)

  const hostname = String(window.location.hostname || '').toLowerCase()
  const demoHosts = new Set(['demo.localhost', 'demo.techargos.com.br'])
  const adminHosts = new Set(['painel.localhost', 'painel.techargos.com.br'])
  const isDemoHost = demoHosts.has(hostname)
  const isAdminHost = adminHosts.has(hostname)

  function normalizeTenantKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('.')[0]
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  function normalizeTenantKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('.')[0]
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  useEffect(() => {
    let cancelled = false

    async function resolveTenant() {
      setLoadingTenant(true)
      if (isAdminHost) {
        if (!cancelled) {
          setTenantCompany(null)
          setLoadingTenant(false)
        }
        return
      }

      if (isDemoHost) {
        const { data } = await supabase
          .from('companies')
          .select('id, name, slug, subdomain, is_demo, active')
          .or('slug.eq.demo,subdomain.eq.demo')
          .eq('active', true)
          .order('is_demo', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!cancelled) {
          setTenantCompany(data || null)
          setLoadingTenant(false)
        }
        return
      }

      const labels = hostname.split('.')
      const subdomain = labels[0] || ''
      const normalizedSubdomain = normalizeTenantKey(subdomain)
      const isProdTenantDomain = hostname.endsWith('.techargos.com.br') && labels.length >= 4
      const isLocalTenantDomain = hostname.endsWith('.localhost') && labels.length >= 2
      const isTenantDomain = (isProdTenantDomain || isLocalTenantDomain) && subdomain && !['www', 'painel', 'demo'].includes(subdomain)

      if (!isTenantDomain) {
        if (!cancelled) {
          setTenantCompany(null)
          setLoadingTenant(false)
        }
        return
      }

      let tenantData = null

      if (normalizedSubdomain) {
        const { data: resolvedData, error: resolveErr } = await supabase
          .rpc('resolve_public_company_by_subdomain', { target_subdomain: normalizedSubdomain })
          .maybeSingle()

        tenantData = resolvedData || null

        // fallback para ambientes onde a função ainda não foi aplicada no banco
        if (!tenantData && resolveErr) {
          const { data } = await supabase
            .from('companies')
            .select('id, name, slug, subdomain, is_demo, active')
            .or(`subdomain.ilike.${normalizedSubdomain},slug.ilike.${normalizedSubdomain}`)
            .eq('active', true)
            .maybeSingle()

          tenantData = data || null
        }
      }

      if (!cancelled) {
        setTenantCompany(tenantData)
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

  if (tenantCompany) {
    return <DemoApp tenantCompany={tenantCompany} isDemoEnvironment={!!tenantCompany.is_demo} />
  }

  return isDemoHost ? <DemoApp tenantCompany={null} isDemoEnvironment /> : <SiteApp />
}
