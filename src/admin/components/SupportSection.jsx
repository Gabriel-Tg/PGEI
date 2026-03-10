import React from 'react'

export default function SupportSection({ shortcuts }) {
  return (
    <section className="admin-section-card">
      <div className="admin-section-head">
        <h3>Suporte e administracao</h3>
        <span>Atalhos internos e observacoes operacionais</span>
      </div>

      <div className="admin-support-grid">
        {shortcuts.map((shortcut) => (
          <article key={shortcut.id} className="admin-support-card">
            <h4>{shortcut.title}</h4>
            <p>{shortcut.description}</p>
            <button type="button" className="btn-secondary">Acessar</button>
          </article>
        ))}
      </div>

      <article className="admin-notes-card">
        <h4>Observacoes internas</h4>
        <ul>
          <li>Padronizar onboarding de novos clientes com checklist por plano.</li>
          <li>Conectar auditoria de acessos administrativos ao Supabase.</li>
          <li>Criar regras de bloqueio automatico por excesso de falhas de login.</li>
        </ul>
      </article>
    </section>
  )
}
