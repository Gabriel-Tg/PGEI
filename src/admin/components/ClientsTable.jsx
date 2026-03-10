import React from 'react'

function formatDate(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '-'
  }
}

export default function ClientsTable({ clients, onToggleStatus, onOpenAddMachine, onEditClient, onDeleteClient }) {
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
              <th>Subdominio</th>
              <th>Status</th>
              <th>Maquinas</th>
              <th>Criado em</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id}>
                <td>
                  <strong>{client.name}</strong>
                  <small>{client.slug}</small>
                </td>
                <td>{client.subdomain}.techargos.com.br</td>
                <td>
                  <span className={`badge ${client.active ? 'active' : 'inactive'}`}>{client.active ? 'Ativa' : 'Inativa'}</span>
                </td>
                <td>{client.machine_count || 0}</td>
                <td>{formatDate(client.created_at)}</td>
                <td>
                  <div className="admin-action-row">
                    <button type="button" className="btn-secondary" onClick={() => onOpenAddMachine(client)}>
                      Nova maquina
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => onEditClient(client)}>
                      Editar
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => onToggleStatus(client.id)}>
                      {client.active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => onDeleteClient(client.id)}>
                      Excluir
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
