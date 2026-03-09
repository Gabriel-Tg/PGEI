import React from 'react'
import './LandingPage.css'

export default function LandingPage() {
  const whatsappMessage = encodeURIComponent('Olá! Quero uma demonstração do sistema ARGOS.')
  const whatsappNumber = '5547984802413'
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`
  const heroTitle = 'Controle sua produção em tempo real e reduza perdas com decisões baseadas em dados'
  const heroWords = heroTitle.split(' ')
  const pains = [
    'Produção sem visibilidade em tempo real para a gestão',
    'Dependência de planilhas e anotações manuais no chão de fábrica',
    'Paradas de máquina sem registro padronizado e histórico confiável',
    'Informações chegando tarde para agir no turno certo',
    'Dificuldade para medir eficiência real por máquina e ordem',
  ]

  const practicalBenefits = [
    {
      title: 'Visibilidade em tempo real',
      description: 'Acompanhe o status da produção por máquina, ordem e turno com atualização imediata.',
    },
    {
      title: 'Controle da fila de produção',
      description: 'Organize prioridades de O.P. com clareza para operação, PCP e liderança.',
    },
    {
      title: 'Registro automático de eventos',
      description: 'Centralize início, parada, retomada e apontamentos em um único histórico digital.',
    },
    {
      title: 'Indicadores de eficiência',
      description: 'Visualize produtividade e performance para agir rápido nos desvios operacionais.',
    },
    {
      title: 'Histórico completo de produção',
      description: 'Consulte dados de ordens e ocorrências para análises, auditorias e melhoria contínua.',
    },
    {
      title: 'Decisão baseada em dados',
      description: 'Transforme dados do chão de fábrica em ações práticas para reduzir perdas.',
    },
  ]

  return (
    <main className="landing-page home-landing">
      <section className="landing-section-band landing-band-hero">
        <div className="landing-container landing-hero-panel">
          <div className="landing-hero">
            <p className="landing-kicker landing-animate landing-delay-1">ARGOS | CONTROLE INTELIGENTE DE PRODUÇÃO</p>
            <h1 className="landing-title" aria-label={heroTitle}>
              {heroWords.map((word, index) => (
                <span className="landing-title-word" key={`${word}-${index}`} style={{ '--word-delay': `${0.18 + index * 0.045}s` }}>
                  {word}
                </span>
              ))}
            </h1>
            <p className="landing-subtitle landing-animate landing-delay-2">
              O ARGOS digitaliza o chão de fábrica e conecta operação, liderança e gestão em uma
              plataforma única para monitoramento de produção industrial em tempo real.
            </p>
            <div className="landing-cta-row landing-animate landing-delay-3">
              <a className="landing-cta" href={whatsappUrl} target="_blank" rel="noreferrer">
                Quero uma demonstração
              </a>
              <a className="landing-cta landing-cta-secondary" href="/como-funciona">
                Ver como funciona
              </a>
            </div>
            <p className="landing-cta-note">Atendimento comercial direto via WhatsApp</p>
          </div>

          <div className="landing-hero-aside landing-animate landing-delay-3">
            <div className="landing-hero-tech" aria-hidden="true">
              <span className="landing-tech-line landing-tech-line-1" />
              <span className="landing-tech-line landing-tech-line-2" />
              <span className="landing-tech-line landing-tech-line-3" />
              <span className="landing-tech-dot landing-tech-dot-1" />
              <span className="landing-tech-dot landing-tech-dot-2" />
              <span className="landing-tech-dot landing-tech-dot-3" />
              <span className="landing-tech-dot landing-tech-dot-4" />
            </div>
            <img
              src="/Argos sem fundo.png"
              alt="ARGOS"
              className="landing-logo"
              onError={(e) => {
                e.currentTarget.src = '/ARGOS.png'
              }}
            />
            <p className="landing-aside-title">Visão central da sua operação</p>
            <p className="landing-aside-text">
              Da criação da O.P. ao acompanhamento de indicadores, o ARGOS entrega rastreabilidade e
              controle para decisões rápidas no turno.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-section-band landing-band-soft landing-band-tech">
        <div className="landing-container landing-section landing-animate landing-delay-4">
          <h2>Problemas comuns no chão de fábrica</h2>
          <div className="landing-grid landing-grid-pains">
            {pains.map((pain, index) => (
              <article className="landing-card" key={pain} style={{ '--card-delay': `${0.35 + index * 0.06}s` }}>
                <div className="landing-card-dot" aria-hidden="true" />
                <p>{pain}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section-band landing-band-white landing-band-tech-light">
        <div className="landing-container landing-section landing-animate landing-delay-4">
          <h2>A solução ARGOS para produção industrial</h2>
          <p className="landing-section-lead">
            O ARGOS coleta dados da produção, organiza ordens, monitora máquinas e transforma eventos
            operacionais em indicadores automáticos para gestão em tempo real.
          </p>
          <div className="landing-solution-points">
            <span>Coleta de dados da produção</span>
            <span>Acompanhamento em tempo real</span>
            <span>Organização de ordens de produção</span>
            <span>Monitoramento de máquinas</span>
            <span>Indicadores automáticos</span>
          </div>
        </div>
      </section>

      <section className="landing-section-band landing-band-white">
        <div className="landing-container landing-section landing-animate landing-delay-4">
          <h2>O que o ARGOS entrega na prática</h2>
          <div className="landing-grid">
            {practicalBenefits.map((item, index) => (
              <article className="landing-card" key={item.title} style={{ '--card-delay': `${0.4 + index * 0.07}s` }}>
                <div className="landing-card-dot" aria-hidden="true" />
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section-band landing-band-soft landing-band-tech">
        <div className="landing-container landing-section landing-animate landing-delay-5">
          <h2>Resultados esperados com o ARGOS</h2>
          <div className="landing-grid landing-grid-results">
            <article className="landing-card" style={{ '--card-delay': '0.52s' }}>
              <h3>Mais visibilidade operacional</h3>
              <p>Gestão e supervisão acompanham a produção sem depender de informações atrasadas.</p>
            </article>
            <article className="landing-card" style={{ '--card-delay': '0.6s' }}>
              <h3>Redução de perdas</h3>
              <p>Paradas e desvios ficam evidentes para atuação rápida antes de ampliar impacto.</p>
            </article>
            <article className="landing-card" style={{ '--card-delay': '0.68s' }}>
              <h3>Dados confiáveis em tempo real</h3>
              <p>Base sólida para reuniões de produção, decisões de priorização e melhoria contínua.</p>
            </article>
            <article className="landing-card" style={{ '--card-delay': '0.76s' }}>
              <h3>Eficiência industrial mais previsível</h3>
              <p>Acompanhamento constante de indicadores para sustentar ganhos de performance.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section-band landing-band-implantation">
        <div className="landing-container landing-section landing-animate landing-delay-5">
          <h2>Atendimento especializado</h2>
          <p className="landing-focus-copy">
            Atendimento focado no ramo de indústrias de plásticos, com implantação e demonstração
            guiada para operações de injeção e sopro.
          </p>
        </div>
      </section>

      <section className="landing-section-band landing-band-cta landing-band-tech-strong">
        <div className="landing-container landing-section landing-final-cta landing-animate landing-delay-5">
          <h2>Veja o ARGOS funcionando na prática</h2>
          <p>
            Agende uma demonstração rápida e veja como sua fábrica pode ganhar visibilidade total da
            produção, com dados confiáveis e ação no tempo certo.
          </p>
          <a className="landing-cta" href={whatsappUrl} target="_blank" rel="noreferrer">
            Quero ver o sistema
          </a>
        </div>
      </section>
    </main>
  )
}
