import React from 'react'

export default function ComoFuncionaPage() {
  const flow = [
    'A ordem é criada e vinculada à máquina',
    'A equipe aponta início, parada e retomada em tempo real',
    'O painel consolida status e alertas operacionais',
    'Indicadores de eficiência orientam a ação da liderança',
  ]

  return (
    <main className="landing-page">
      <section className="landing-section site-page-hero landing-animate landing-delay-1">
        <p className="site-page-kicker">Como funciona</p>
        <h1>Fluxo digital do chão de fábrica ao painel gerencial</h1>
        <p>
          O ARGOS conecta os eventos da produção em uma trilha única, reduzindo retrabalho manual e
          aumentando a velocidade de resposta operacional.
        </p>
      </section>

      <section className="landing-section landing-animate landing-delay-2">
        <h2>Ciclo operacional</h2>
        <div className="site-flow-list">
          {flow.map((step, index) => (
            <article className="landing-card" key={step} style={{ '--card-delay': `${0.2 + index * 0.08}s` }}>
              <div className="site-flow-index">{index + 1}</div>
              <p>{step}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
