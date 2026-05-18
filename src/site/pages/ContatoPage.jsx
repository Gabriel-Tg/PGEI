import React from 'react'

export default function ContatoPage() {
  const whatsappMessage = encodeURIComponent('Olá! Quero agendar uma demonstração guiada do ARGOS.')
  const whatsappUrl = `https://wa.me/5547984802413?text=${whatsappMessage}`

  return (
    <main className="landing-page site-fullpage">
      <section className="landing-section-band landing-band-hero landing-band-tech-strong">
        <div className="landing-container landing-section site-page-hero landing-animate landing-delay-1">
          <p className="site-page-kicker">Contato</p>
          <h1>Fale com o time ARGOS e veja o sistema na prática</h1>
          <p>
            Atendimento comercial para diagnóstico inicial e demonstração guiada focada no seu fluxo
            de produção.
          </p>
        </div>
      </section>

      <section className="landing-section-band landing-band-white landing-band-tech-light">
        <div className="landing-container landing-section landing-animate landing-delay-2">
          <h2>Canais de atendimento</h2>
          <div className="landing-grid">
            <article className="landing-card" style={{ '--card-delay': '0.22s' }}>
              <h3>WhatsApp</h3>
              <p>(47) 98480-2413</p>
              <a className="landing-cta" href={whatsappUrl} target="_blank" rel="noreferrer">
                Quero uma demonstração
              </a>
            </article>
            <article className="landing-card" style={{ '--card-delay': '0.3s' }}>
              <h3>Atendimento comercial</h3>
              <p>Conversa objetiva para entender cenário, prioridades e viabilidade de implantação.</p>
            </article>
            <article className="landing-card" style={{ '--card-delay': '0.38s' }}>
              <h3>Demonstração guiada</h3>
              <p>Apresentação prática com foco em resultados para gestão industrial.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section-band landing-band-cta landing-band-tech-strong">
        <div className="landing-container landing-section landing-final-cta landing-animate landing-delay-3">
          <h2>Atendimento rápido para sua operação</h2>
          <p>
            Envie uma mensagem e receba uma proposta de demonstração alinhada ao seu cenário
            industrial.
          </p>
          <a className="landing-cta" href={whatsappUrl} target="_blank" rel="noreferrer">
            Falar no WhatsApp
          </a>
        </div>
      </section>
    </main>
  )
}
