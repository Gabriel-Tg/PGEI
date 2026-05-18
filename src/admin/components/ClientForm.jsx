import React, { useState } from 'react'

const INITIAL_FORM = {
  companyName: '',
  owner: '',
  phone: '',
  email: '',
  plan: 'Starter',
  machines: 1,
  subdomain: '',
}

export default function ClientForm({ onCreateClient }) {
  const [form, setForm] = useState(INITIAL_FORM)

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    onCreateClient(form)
    setForm(INITIAL_FORM)
  }

  return (
    <section className="admin-section-card">
      <div className="admin-section-head">
        <h3>Cadastro de cliente</h3>
        <span>Dados iniciais para onboarding</span>
      </div>

      <form className="admin-form-grid" onSubmit={handleSubmit}>
        <label>
          Nome da empresa
          <input name="companyName" value={form.companyName} onChange={handleChange} required />
        </label>

        <label>
          Responsavel
          <input name="owner" value={form.owner} onChange={handleChange} required />
        </label>

        <label>
          Telefone
          <input name="phone" value={form.phone} onChange={handleChange} required />
        </label>

        <label>
          E-mail
          <input name="email" type="email" value={form.email} onChange={handleChange} required />
        </label>

        <label>
          Plano
          <select name="plan" value={form.plan} onChange={handleChange}>
            <option>Starter</option>
            <option>Pro</option>
            <option>Enterprise</option>
          </select>
        </label>

        <label>
          Quantidade de maquinas
          <input name="machines" type="number" min="1" value={form.machines} onChange={handleChange} required />
        </label>

        <label className="full-width">
          Subdominio desejado
          <input
            name="subdomain"
            placeholder="exemplo: cliente-a"
            value={form.subdomain}
            onChange={handleChange}
            required
          />
        </label>

        <div className="full-width admin-form-actions">
          <button type="submit" className="btn-primary">
            Salvar cliente
          </button>
        </div>
      </form>
    </section>
  )
}
