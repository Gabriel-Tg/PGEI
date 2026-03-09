import React from 'react'
import './LandingPage.css'

export default function LandingPage() {
  const whatsappMessage = encodeURIComponent('Olá! Quero uma demonstração do sistema ARGOS.')
  const whatsappNumber = '5547984802413'
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`
  const heroTitle = 'Conectividade industrial para uma produção orientada por dados'
  const heroWords = heroTitle.split(' ')
  const benefits = [
    {
      title: 'Integração',
      description: 'Conecta operação, liderança e dados de máquina em um único fluxo digital.',
    },
    {
      title: 'Tempo real',
      description: 'Mostra status, paradas e mudanças de O.P. no momento em que acontecem.',
    },
    {
      title: 'Desempenho',
      description: 'Traz visibilidade da eficiência por setor para atuar antes da perda aumentar.',
    },
    {
      title: 'Monitoramento',
      description: 'Acompanha a linha inteira e destaca gargalos operacionais automaticamente.',
    },
    {
      title: 'Rastreabilidade',
      description: 'Registra eventos e histórico de ordens para auditoria e tomada de decisão.',
    },
    {
      title: 'Resultado',
      description: 'Transforma dados de produção em ação prática para reduzir desperdícios.',
    },
  ]

  return (
    <main className="landing-page">
      <section className="landing-hero-panel">
        <div className="landing-hero">
          <p className="landing-kicker landing-animate landing-delay-1">SUA FÁBRICA ONLINE</p>
          <h1 className="landing-title" aria-label={heroTitle}>
            {heroWords.map((word, index) => (
              <span className="landing-title-word" key={`${word}-${index}`} style={{ '--word-delay': `${0.18 + index * 0.045}s` }}>
                {word}
              </span>
            ))}
          </h1>
          <p className="landing-subtitle landing-animate landing-delay-2">
            O ARGOS digitaliza o chão de fábrica, integra as ordens de produção e entrega visão
            operacional em tempo real para acelerar a resposta da sua equipe.
          </p>
          <div className="landing-cta-row landing-animate landing-delay-3">
            <a className="landing-cta" href={whatsappUrl} target="_blank" rel="noreferrer">
              Quero uma demonstração
            </a>
            <span className="landing-cta-note">Atendimento direto via WhatsApp</span>
          </div>
        </div>

        <div className="landing-hero-aside landing-animate landing-delay-3">
          <img
            src="/Argos sem fundo.png"
            alt="ARGOS"
            className="landing-logo"
            onError={(e) => {
              e.currentTarget.src = '/ARGOS.png'
            }}
          />
          <p className="landing-aside-title">Painel central de operação</p>
          <p className="landing-aside-text">
            Da abertura da O.P. ao apontamento final, tudo fica sincronizado em uma experiência
            única para a fábrica.
          </p>
        </div>
      </section>

      <section className="landing-section landing-intro landing-animate landing-delay-4">
        <h2>Dados em tempo real. Digitalização completa da sua produção.</h2>
        <p>
          O sistema organiza fila por máquina, registra paradas, consolida indicadores e melhora
          previsibilidade da operação sem depender de controles paralelos.
        </p>
      </section>

      <section className="landing-section landing-animate landing-delay-4">
        <h2>O que o ARGOS entrega na prática</h2>
        <div className="landing-grid">
          {benefits.map((item, index) => (
            <article className="landing-card" key={item.title} style={{ '--card-delay': `${0.4 + index * 0.07}s` }}>
              <div className="landing-card-dot" aria-hidden="true" />
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-steps landing-animate landing-delay-5">
        <h2>Implantação simples e rápida</h2>
        <div className="landing-steps-grid">
          <article style={{ '--step-delay': '0.52s' }}>
            <h3>1. Mapeamento</h3>
            <p>Entendimento da rotina atual para definir os pontos de captura de dados.</p>
          </article>
          <article style={{ '--step-delay': '0.62s' }}>
            <h3>2. Configuração</h3>
            <p>Parametrização do sistema e liberação das telas para operação assistida.</p>
          </article>
          <article style={{ '--step-delay': '0.72s' }}>
            <h3>3. Operação</h3>
            <p>Acompanhamento inicial com ajustes para garantir aderência da equipe.</p>
          </article>
        </div>
      </section>
    </main>
  )
}
