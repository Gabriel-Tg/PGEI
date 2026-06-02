import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import LandingPage from './LandingPage'
import ImplantacaoPage from './pages/ImplantacaoPage'
import ComoFuncionaPage from './pages/ComoFuncionaPage'
import ContatoPage from './pages/ContatoPage'

function ScrollToTopOnRouteChange() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return null
}

export default function SiteApp() {
  const whatsappMessage = encodeURIComponent('Olá! Quero agendar uma demonstração do ARGOS.')
  const whatsappNumber = '5547984802413'
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`

  return (
    <div className="site-shell">
      <ScrollToTopOnRouteChange />
      <header className="site-nav-wrap">
        <nav className="site-nav" aria-label="Navegação principal">
          <a className="site-brand" href="/" aria-label="ARGOS">
            <img src="/Argos sem fundo.png" alt="ARGOS Monitoramento Industrial" />
          </a>
          <div className="site-menu">
            <a className="site-nav-link" href="/#solucoes">Soluções</a>
            <a className="site-nav-link" href="/#recursos">Recursos</a>
            <a className="site-nav-link" href="/#beneficios">Benefícios</a>
            <a className="site-nav-link" href="/#como-funciona">Como Funciona</a>
            <a className="site-nav-link" href="/#casos">Casos</a>
            <a className="site-nav-link" href="/#sobre">Sobre</a>
            <a className="site-nav-link" href="/#contato">Contato</a>
          </div>
          <a className="site-nav-cta" href={whatsappUrl} target="_blank" rel="noreferrer">
            Agendar Demonstração
            <span aria-hidden="true">→</span>
          </a>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/implantacao" element={<ImplantacaoPage />} />
        <Route path="/como-funciona" element={<ComoFuncionaPage />} />
        <Route path="/contato" element={<ContatoPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
