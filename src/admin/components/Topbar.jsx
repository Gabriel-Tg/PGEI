import React from 'react'

export default function Topbar({ adminName, hostLabel, quickStats, onOpenNewClient }) {
  return (
    <header className="admin-topbar">
      <div>
        <p className="admin-eyebrow">Ambiente interno</p>
        <h2>ARGOS Control Center</h2>
        <p className="admin-host">Host atual: {hostLabel}</p>
      </div>

      <div className="admin-topbar-actions">
        <div className="admin-mini-stats">
          <div>
            <strong>{quickStats.activeUsersNow}</strong>
            <span>usuarios online</span>
          </div>
          <div>
            <strong>{quickStats.openAlerts}</strong>
            <span>alertas abertos</span>
          </div>
        </div>
        <button type="button" className="btn-quick" onClick={onOpenNewClient}>Novo cliente</button>
        <div className="admin-user-pill">
          <span>{adminName}</span>
          <small>Administrador</small>
        </div>
      </div>
    </header>
  )
}
