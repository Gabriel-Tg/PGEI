import React from 'react'

export default function ClientsTable({ clients, onToggleStatus, onEdit }) {
  return (
    <section className="admin-section-card">
      <div className="admin-section-head">
        <h3>Gestao de clientes</h3>
        <span>{clients.length} empresas cadastradas</span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Status</th>
              <th>Plano</th>
              <th>Maquinas</th>
              <th>Ultimo acesso</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id}>
                <td>
                  <strong>{client.companyName}</strong>
                  <small>{client.email}</small>
                </td>
                <td>
                  <span className={`badge ${client.status}`}>{client.status === 'active' ? 'Ativa' : 'Inativa'}</span>
                </td>
                <td>{client.plan}</td>
                <td>{client.machines}</td>
                <td>{client.lastAccess}</td>
                <td>
                  <div className="admin-action-row">
                    <button type="button" className="btn-secondary" onClick={() => onEdit(client.id)}>
                      Editar
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => onToggleStatus(client.id)}>
                      {client.status === 'active' ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
