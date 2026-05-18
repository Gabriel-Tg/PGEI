import React from 'react'

export default function Sidebar({ items, activeSection, onChangeSection }) {
  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-brand">
        <p className="admin-eyebrow">ARGOS</p>
        <h1>Painel Administrativo</h1>
        <span>painel.techargos.com.br</span>
      </div>

      <nav className="admin-nav" aria-label="Navegacao administrativa">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`admin-nav-item ${activeSection === item.key ? 'active' : ''}`}
            onClick={() => onChangeSection(item.key)}
          >
            <span className="admin-nav-title">{item.label}</span>
            <small>{item.description}</small>
          </button>
        ))}
      </nav>

      <div className="admin-sidebar-footer">
        <p>Preparado para integracao com Supabase e controle de permissao.</p>
      </div>
    </aside>
  )
}
