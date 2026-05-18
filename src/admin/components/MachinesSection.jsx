import React from 'react'

function statusLabel(active) {
  return active ? 'Ativa' : 'Inativa'
}

export default function MachinesSection({ machines, onEditMachine, onDeleteMachine }) {
  return (
    <section className="admin-section-card">
      <div className="admin-section-head">
        <h3>Maquinas por empresa</h3>
        <span>{machines.length} maquinas registradas</span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Codigo</th>
              <th>Nome</th>
              <th>Rota</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {machines.map((machine) => (
              <tr key={machine.id}>
                <td>{machine.client_name || '-'}</td>
                <td>{machine.machine_code}</td>
                <td>{machine.machine_name || '-'}</td>
                <td>{machine.route_slug ? `/${machine.route_slug}` : '-'}</td>
                <td>
                  <span className={`badge ${machine.active ? 'active' : 'inactive'}`}>{statusLabel(machine.active)}</span>
                </td>
                <td>
                  <div className="admin-action-row">
                    <button type="button" className="btn-secondary" onClick={() => onEditMachine(machine)}>
                      Editar
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => onDeleteMachine(machine.id)}>
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
