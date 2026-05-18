import React from 'react'

export default function PlansSection({ plans, clients, onChangePlan }) {
  function countByPlan(planName) {
    return clients.filter((client) => client.plan === planName).length
  }

  return (
    <section className="admin-section-card">
      <div className="admin-section-head">
        <h3>Planos e distribuicao</h3>
        <span>Gestao comercial por faixa de contrato</span>
      </div>

      <div className="admin-plan-grid">
        {plans.map((plan) => (
          <article key={plan.id} className="admin-card">
            <p>{plan.name}</p>
            <strong>R$ {plan.monthlyPrice}</strong>
            <small>{countByPlan(plan.name)} clientes</small>
            <small>Ate {plan.maxMachines} maquinas</small>
          </article>
        ))}
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Plano atual</th>
              <th>Alterar plano</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id}>
                <td>{client.companyName}</td>
                <td>{client.plan}</td>
                <td>
                  <select value={client.plan} onChange={(event) => onChangePlan(client.id, event.target.value)}>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.name}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
