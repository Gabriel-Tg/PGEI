import React from 'react'

export default function DashboardCards({ metrics }) {
  const cards = [
    { key: 'clients', label: 'Total de clientes', value: metrics.totalClients },
    { key: 'active', label: 'Empresas ativas', value: metrics.activeCompanies },
    { key: 'inactive', label: 'Empresas inativas', value: metrics.inactiveCompanies },
    { key: 'machines', label: 'Total de maquinas', value: metrics.totalMachines },
    { key: 'alerts', label: 'Alertas recentes', value: metrics.recentAlerts },
    { key: 'usage', label: 'Scans hoje', value: metrics.scansToday },
  ]

  return (
    <section className="admin-grid-cards" aria-label="Indicadores principais">
      {cards.map((card) => (
        <article className="admin-card" key={card.key}>
          <p>{card.label}</p>
          <strong>{card.value}</strong>
        </article>
      ))}
    </section>
  )
}
