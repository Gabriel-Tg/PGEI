import React from 'react'

function statusLabel(active) {
  return active ? 'Ativa' : 'Inativa'
}

function apontamentoLabel(tipo) {
  const value = String(tipo || 'manual')
  if (value === 'bipagem') return 'Bipagem'
  if (value === 'sensor') return 'Sensor'
  return 'Manual'
}

export default function MachinesSection({ machines, onEditMachine, onDeleteMachine, onChangeApontamentoType }) {
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
              <th>Apontamento</th>
              <th>Troca Rápida</th>
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
                  <span className={`badge apontamento ${String(machine.apontamento_tipo || 'manual')}`}>
                    {apontamentoLabel(machine.apontamento_tipo)}
                  </span>
                </td>
                <td>
                  <select
                    className="admin-quick-select"
                    value={String(machine.apontamento_tipo || 'manual')}
                    onChange={(event) => onChangeApontamentoType?.(machine, event.target.value)}
                  >
                    <option value="manual">Manual</option>
                    <option value="bipagem">Bipagem</option>
                    <option value="sensor">Sensor</option>
                  </select>
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
