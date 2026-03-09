import React from 'react'

export default function ImplantacaoPage() {
  return (
    <main className="landing-page">
      <section className="landing-section site-page-hero landing-animate landing-delay-1">
        <p className="site-page-kicker">Implantação</p>
        <h1>Instalação rápida e operação assistida</h1>
        <p>
          O processo de implantação do ARGOS foi desenhado para entrar em operação sem interromper
          o ritmo da fábrica, com fases objetivas e acompanhamento técnico.
        </p>
      </section>

      <section className="landing-section landing-animate landing-delay-2">
        <h2>Etapas da implantação</h2>
        <div className="landing-steps-grid site-implant-grid">
          <article className="site-implant-step" style={{ '--step-delay': '0.2s' }}>
            <div className="site-implant-copy">
              <h3>Diagnóstico</h3>
              <p>Mapeamento de máquinas, fluxo de ordens e indicadores que serão monitorados.</p>
            </div>
            <div className="site-implant-media site-implant-media-placeholder" role="img" aria-label="Espaco para fotos de maquinas na fase de diagnostico">
              <span>Adicionar fotos das máquinas</span>
            </div>
          </article>
          <article className="site-implant-step" style={{ '--step-delay': '0.3s' }}>
            <div className="site-implant-copy">
              <h3>Configuração</h3>
              <p>Parametrização de regras, telas e acessos por perfil para cada área da operação.</p>
            </div>
            <div className="site-implant-media site-implant-media-featured">
              <img src="/tela%20Lista.png" alt="Tela de lista do sistema ARGOS" loading="lazy" />
            </div>
          </article>
          <article className="site-implant-step" style={{ '--step-delay': '0.4s' }}>
            <div className="site-implant-copy">
              <h3>Go-live</h3>
              <p>Entrada monitorada com suporte para ajustes finos e consolidação da rotina digital.</p>
            </div>
            <div className="site-implant-media site-implant-media-placeholder" role="img" aria-label="Espaco para foto da fase go-live">
              <span>Adicionar foto da entrada em operação</span>
            </div>
          </article>
        </div>
      </section>
    </main>
  )
}
