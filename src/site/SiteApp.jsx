import React from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
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

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `site-nav-link ${isActive ? 'active' : ''}`}
      end={to === '/'}
    >
      {children}
    </NavLink>
  )
}

export default function SiteApp() {
  return (
    <div className="site-shell">
      <ScrollToTopOnRouteChange />
      <header className="site-nav-wrap">
        <nav className="site-nav" aria-label="Paginas do site">
          <NavItem to="/">Home</NavItem>
          <NavItem to="/implantacao">Implantação</NavItem>
          <NavItem to="/como-funciona">Como funciona</NavItem>
          <NavItem to="/contato">Contato</NavItem>
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
