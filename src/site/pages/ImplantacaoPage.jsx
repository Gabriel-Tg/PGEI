import React from 'react'

export default function ImplantacaoPage() {
  return (
    <main className="landing-page site-fullpage">
      <section className="landing-section-band landing-band-hero landing-band-tech-strong">
        <div className="landing-container landing-section site-page-hero landing-animate landing-delay-1">
          <p className="site-page-kicker">Implantação</p>
          <h1>Implantação simples, rápida e sem parar sua produção</h1>
          <p>
            O ARGOS entra em operação com um plano direto: diagnóstico, configuração e go-live
            assistido para sua equipe ganhar tração com segurança.
          </p>
        </div>
      </section>

      <section className="landing-section-band landing-band-implantation landing-band-tech">
        <div className="landing-container landing-section landing-animate landing-delay-2">
          <h2>Etapas da implantação</h2>
          <p className="landing-section-lead">
            Processo conduzido com acompanhamento próximo e foco em resultado rápido no chão de
            fábrica.
          </p>
          <div className="landing-steps-grid site-implant-grid">
            <article className="site-implant-step" style={{ '--step-delay': '0.2s' }}>
              <div className="site-implant-copy">
                <h3>1. Diagnóstico da produção</h3>
                <p>Mapeamento de máquinas, fluxo de ordens, paradas e indicadores prioritários.</p>
              </div>
              <div className="site-implant-media">
                <img src="/Diagnostico.png" alt="Etapa de diagnóstico da produção no ARGOS" loading="lazy" />
              </div>
            </article>
            <article className="site-implant-step" style={{ '--step-delay': '0.3s' }}>
              <div className="site-implant-copy">
                <h3>2. Configuração do sistema</h3>
                <p>Parametrização de regras, telas e acessos para aderir ao seu processo real.</p>
              </div>
              <div className="site-implant-media site-implant-media-featured">
                <img src="/tela%20Lista.png" alt="Tela de lista do sistema ARGOS" loading="lazy" />
              </div>
            </article>
            <article className="site-implant-step" style={{ '--step-delay': '0.4s' }}>
              <div className="site-implant-copy">
                <h3>3. Go-live assistido</h3>
                <p>Entrada em produção monitorada com suporte para ajustes e consolidação da rotina.</p>
              </div>
              <div className="site-implant-media">
                <img src="/Go-live.png" alt="Etapa de go-live assistido do ARGOS" loading="lazy" />
              </div>
            </article>
          </div>
          <p className="landing-highlight-note">
            A implantação é planejada para acontecer sem interromper a produção da fábrica.
          </p>
        </div>
      </section>
    </main>
  )
}
