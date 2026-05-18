import React from 'react'

export default function MonitoringSection({ logs }) {
  return (
    <section className="admin-section-card">
      <div className="admin-section-head">
        <h3>Monitoramento do sistema</h3>
        <span>Erros, falhas de sincronizacao e problemas de acesso</span>
      </div>

      <div className="admin-log-grid">
        {logs.map((log) => (
          <article key={log.id} className={`admin-log-card level-${log.level}`}>
            <header>
              <span>{log.category}</span>
              <small>{log.timestamp}</small>
            </header>
            <h4>{log.companyName}</h4>
            <p>{log.message}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
