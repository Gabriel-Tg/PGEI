import React from 'react'

export default function ContatoPage() {
  const whatsappMessage = encodeURIComponent('Olá! Quero falar com o time comercial do ARGOS.')
  const whatsappUrl = `https://wa.me/5547984802413?text=${whatsappMessage}`

  return (
    <main className="landing-page">
      <section className="landing-section site-page-hero landing-animate landing-delay-1">
        <p className="site-page-kicker">Contato</p>
        <h1>Fale com o time ARGOS</h1>
        <p>
          Quer avaliar aplicação no seu processo? Entre em contato e agende uma demonstração com um
          especialista.
        </p>
      </section>

      <section className="landing-section landing-animate landing-delay-2">
        <h2>Canais de atendimento</h2>
        <div className="landing-grid">
          <article className="landing-card" style={{ '--card-delay': '0.22s' }}>
            <h3>WhatsApp</h3>
            <p>(47) 98480-2413</p>
            <a className="landing-cta" href={whatsappUrl} target="_blank" rel="noreferrer">
              Iniciar conversa
            </a>
          </article>
          <article className="landing-card" style={{ '--card-delay': '0.3s' }}>
            <h3>Atendimento comercial</h3>
            <p>Resposta rápida para dúvidas de implantação e viabilidade.</p>
          </article>
          <article className="landing-card" style={{ '--card-delay': '0.38s' }}>
            <h3>Demonstração guiada</h3>
            <p>Apresentação focada no seu fluxo real de produção e indicadores.</p>
          </article>
        </div>
      </section>
    </main>
  )
}
