import React from 'react'

export default function ComoFuncionaPage() {
  const flow = [
    {
      title: 'Ordem criada e priorizada',
      description: 'A ordem de produção é criada e organizada por máquina para execução sem ruído.',
      image: '/Nova%20Ordem.png',
      alt: 'Tela de nova ordem de produção no ARGOS',
    },
    {
      title: 'Apontamento no chão de fábrica',
      description: 'O operador aponta produção e paradas no sistema, com registro no momento do evento.',
      image: '/Parada%20de%20máquina.png',
      alt: 'Tela de apontamento de parada de máquina no ARGOS',
    },
    {
      title: 'Dados registrados automaticamente',
      description: 'O ARGOS salva o histórico de eventos para rastreabilidade e análise posterior.',
      image: '/Histórico.png',
      alt: 'Tela de histórico de produção no ARGOS',
    },
    {
      title: 'Painel com indicadores em tempo real',
      description: 'O painel consolida status, produtividade e ocorrências para leitura rápida da operação.',
      image: '/Indicadores.png',
      alt: 'Painel de indicadores de produção no ARGOS',
    },
    {
      title: 'Gestão decide com confiança',
      description: 'Liderança acompanha tudo ao vivo e age com base em dados confiáveis.',
      image: '/Gestão.png',
      alt: 'Tela de gestão de produção no ARGOS',
    },
  ]

  return (
    <main className="landing-page site-fullpage">
      <section className="landing-section-band landing-band-hero landing-band-tech-strong">
        <div className="landing-container landing-section site-page-hero landing-animate landing-delay-1">
          <p className="site-page-kicker">Como funciona</p>
          <h1>Fluxo simples para controlar a produção em tempo real</h1>
          <p>
            Em poucos passos, o ARGOS conecta operação e gestão para transformar eventos do chão de
            fábrica em informação clara para tomada de decisão.
          </p>
        </div>
      </section>

      <section className="landing-section-band landing-band-soft landing-band-tech">
        <div className="landing-container landing-section landing-animate landing-delay-2">
          <h2>Do apontamento à decisão</h2>
          <p className="landing-section-lead">
            Veja como o ARGOS conecta operação e gestão em um fluxo simples, visual e orientado por
            dados em tempo real.
          </p>
          <div className="site-flow-list site-flow-media-list">
            {flow.map((step, index) => (
              <article className="landing-card" key={step.title} style={{ '--card-delay': `${0.2 + index * 0.08}s` }}>
                <div className="site-flow-index">{index + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <div className="site-flow-media">
                  <img src={step.image} alt={step.alt} loading="lazy" />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section-band landing-band-white landing-band-tech-light">
        <div className="landing-container landing-section landing-animate landing-delay-3">
          <h2>Painel operacional centralizado</h2>
          <div className="site-painel-wrap">
            <div className="site-painel-copy">
              <h3>Visão única para operação e liderança</h3>
              <p>
                Em uma única tela, o ARGOS mostra ordens em andamento, paradas, ritmo de produção e
                indicadores essenciais para a tomada de decisão no turno.
              </p>
              <p>
                Resultado: menos suposição, mais ação rápida para reduzir perdas e aumentar
                eficiência.
              </p>
            </div>
            <div className="site-painel-media">
              <img src="/tela%20Lista.png" alt="Painel central do ARGOS com ordens de produção" loading="lazy" />
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
