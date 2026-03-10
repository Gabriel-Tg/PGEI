import React from 'react'

function statusLabel(status) {
  if (status === 'running') return 'Rodando'
  if (status === 'idle') return 'Parada'
  if (status === 'maintenance') return 'Manutencao'
  if (status === 'offline') return 'Offline'
  return status
}

export default function MachinesSection({ machines }) {
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
              <th>Maquina</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {machines.map((machine) => (
              <tr key={machine.id}>
                <td>{machine.companyName}</td>
                <td>{machine.code}</td>
                <td>
                  <span className={`badge machine-${machine.status}`}>{statusLabel(machine.status)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
