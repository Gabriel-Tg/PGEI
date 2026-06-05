import React from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Cpu,
  DollarSign,
  EyeOff,
  Gauge,
  LineChart,
  MonitorDot,
  Play,
  RadioTower,
  ShieldCheck,
  TrendingUp,
  Zap,
} from 'lucide-react'
import './LandingPage.css'

const whatsappMessage = encodeURIComponent('Olá! Quero agendar uma demonstração do ARGOS.')
const whatsappNumber = '5547984802413'
const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
}

const heroStats = [
  { icon: TrendingUp, label: 'Mais produtividade' },
  { icon: Clock3, label: 'Menos paradas' },
  { icon: Gauge, label: 'Melhores decisões' },
]

const problems = [
  {
    icon: EyeOff,
    title: 'Falta de visibilidade',
    description: 'Sem dados em tempo real, decisões são tomadas no escuro.',
  },
  {
    icon: Clock3,
    title: 'Paradas não identificadas',
    description: 'Você não sabe o real motivo das paradas e perde tempo e dinheiro.',
  },
  {
    icon: ClipboardList,
    title: 'Apontamentos manuais',
    description: 'Processos manuais geram erro, retrabalho e informações pouco confiáveis.',
  },
  {
    icon: LineChart,
    title: 'Baixa produtividade',
    description: 'Sem acompanhamento de indicadores, os resultados não melhoram.',
  },
  {
    icon: CheckCircle2,
    title: 'Como o ARGOS resolve',
    description: 'Dados reais, em tempo real, para decisões rápidas que geram resultados.',
    accent: true,
  },
]

const benefits = [
  {
    icon: BarChart3,
    title: 'Aumento de produtividade',
    description: 'Monitore o desempenho das máquinas e da equipe em tempo real.',
  },
  {
    icon: DollarSign,
    title: 'Redução de custos',
    description: 'Menos paradas, menos refugo e melhor aproveitamento dos recursos.',
  },
  {
    icon: Clock3,
    title: 'Decisões mais rápidas',
    description: 'Informações confiáveis para agir no momento certo e evitar perdas.',
  },
  {
    icon: MonitorDot,
    title: 'Gestão à vista',
    description: 'Painéis em tempo real para alinhamento da equipe e foco no que importa.',
  },
  {
    icon: ShieldCheck,
    title: 'Indústria 4.0',
    description: 'Conecte máquinas, pessoas e processos em uma única plataforma inteligente.',
  },
]

const companies = ['PlastTech', 'Moldart', 'InovaPolímeros', 'PrecisionMold', 'PolyBrasil']

function SectionMotion({ children, className = '', ...props }) {
  return (
    <motion.section
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={stagger}
      {...props}
    >
      {children}
    </motion.section>
  )
}

function MetricCard({ label, value, delta }) {
  return (
    <div className="mock-metric-card">
      <div className="mock-metric-label">{label}</div>
      <strong>{value}</strong>
      <span>{delta}</span>
    </div>
  )
}

function MiniBars({ compact = false }) {
  const bars = [42, 70, 56, 82, 45, 91, 64, 76, 58, 88, 48, 68]
  return (
    <div className={`mini-bars ${compact ? 'mini-bars-compact' : ''}`} aria-hidden="true">
      {bars.map((height, index) => (
        <span key={`${height}-${index}`} style={{ '--bar-height': `${height}%` }} />
      ))}
    </div>
  )
}

function MiniLine() {
  return (
    <svg className="mini-line" viewBox="0 0 260 100" role="img" aria-label="Curva de OEE ao longo do tempo">
      <defs>
        <linearGradient id="lineGlow" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#5b7cfa" />
        </linearGradient>
      </defs>
      <path d="M4 62 C26 20 46 82 66 48 S104 20 126 58 164 78 184 40 224 18 256 54" fill="none" stroke="url(#lineGlow)" strokeWidth="4" strokeLinecap="round" />
      <path d="M4 62 C26 20 46 82 66 48 S104 20 126 58 164 78 184 40 224 18 256 54 L256 100 L4 100 Z" fill="rgba(34, 211, 238, 0.08)" />
    </svg>
  )
}

function MachineTile({ id, status, detail, tone = 'green' }) {
  return (
    <div className={`machine-tile machine-${tone}`}>
      <div>
        <strong>{id}</strong>
        <span>{status}</span>
      </div>
      <small>{detail}</small>
    </div>
  )
}

function HeroDashboard() {
  return (
    <motion.div
      className="hero-dashboard-frame"
      initial={{ opacity: 0, x: 42, rotateY: -10 }}
      animate={{ opacity: 1, x: 0, rotateY: -7 }}
      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.18 }}
    >
      <div className="dashboard-topbar">
        <div>
          <img src="/Argos sem fundo.png" alt="ARGOS" />
          <span>Visão Geral</span>
        </div>
        <div className="dashboard-actions">
          <span>Todas as máquinas</span>
          <Bell size={13} />
          <Activity size={13} />
        </div>
      </div>

      <div className="dashboard-grid">
        <MetricCard label="OEE médio" value="78,5%" delta="+5,2% vs ontem" />
        <MetricCard label="Produção" value="12.458" delta="+8,7% vs ontem" />
        <MetricCard label="Máquinas ativas" value="8 / 11" delta="72,7% ativas" />
        <MetricCard label="Paradas (min)" value="245" delta="-12,3% vs ontem" />
      </div>

      <div className="dashboard-panel machines-panel">
        <div className="panel-heading">
          <span>Status das Máquinas</span>
          <small>ao vivo</small>
        </div>
        <div className="machine-grid">
          <MachineTile id="INJ-01" status="Produzindo" detail="OEE 82,4%" />
          <MachineTile id="INJ-02" status="Produzindo" detail="OEE 75,1%" />
          <MachineTile id="INJ-03" status="Parada" detail="Mat. frio 35 min" tone="red" />
          <MachineTile id="INJ-04" status="Produzindo" detail="OEE 84,7%" />
          <MachineTile id="INJ-05" status="Parada" detail="Ajuste 18 min" tone="red" />
          <MachineTile id="INJ-06" status="Produzindo" detail="OEE 77,2%" />
          <MachineTile id="INJ-07" status="Produzindo" detail="OEE 71,8%" />
          <MachineTile id="INJ-08" status="Standby" detail="Aguardando O.P." tone="yellow" />
        </div>
      </div>

      <div className="dashboard-bottom-grid">
        <div className="dashboard-panel">
          <div className="panel-heading">
            <span>Produção por Hora</span>
            <small>peças</small>
          </div>
          <MiniBars />
        </div>
        <div className="dashboard-panel">
          <div className="panel-heading">
            <span>OEE ao Longo do Tempo</span>
            <small>ver relatório</small>
          </div>
          <MiniLine />
        </div>
      </div>
    </motion.div>
  )
}

function OperationsDashboard() {
  return (
    <motion.div className="operations-screen" variants={fadeUp} whileHover={{ y: -4 }} transition={{ duration: 0.25 }}>
      <div className="screen-header">
        <strong>SALA DE PRODUÇÃO</strong>
        <img src="/Argos sem fundo.png" alt="ARGOS" />
        <span>10:24</span>
      </div>
      <div className="screen-metrics">
        <MetricCard label="Produção do dia" value="12.458" delta="Meta: 15.000" />
        <MetricCard label="OEE médio" value="78,5%" delta="Meta: 85%" />
        <div className="status-card">
          <span>Status das máquinas</span>
          <div className="donut" aria-hidden="true" />
          <div className="status-legend">
            <small><i className="legend-green" />8 produzindo</small>
            <small><i className="legend-red" />2 paradas</small>
            <small><i className="legend-yellow" />1 standby</small>
          </div>
        </div>
      </div>
      <div className="screen-bottom">
        <div className="chart-card">
          <span>Produção por hora</span>
          <MiniBars compact />
        </div>
        <div className="stops-card">
          <span>Top 5 paradas</span>
          {['Setup', 'Falta de material', 'Manutenção', 'Ajuste de processo', 'Espera de operador'].map((item, index) => (
            <div className="stop-row" key={item}>
              <small>{index + 1}</small>
              <strong>{item}</strong>
              <em>{45 - index * 7} min</em>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

export default function LandingPage() {
  return (
    <main className="argos-landing">
      <section className="argos-hero" id="solucoes">
        <div className="hero-aura" />
        <div className="argos-container hero-layout">
          <motion.div className="hero-copy" initial="hidden" animate="visible" variants={stagger}>
            <motion.p className="hero-badge" variants={fadeUp}>INDÚSTRIA 4.0 NA PRÁTICA</motion.p>
            <motion.h1 variants={fadeUp}>
              Transforme sua produção em <span>resultados reais</span>
            </motion.h1>
            <motion.p className="hero-text" variants={fadeUp}>
              O ARGOS coleta, processa e transforma os dados da sua fábrica em informações estratégicas para aumentar a produtividade, reduzir paradas e maximizar resultados.
            </motion.p>
            <motion.div className="hero-proof-row" variants={fadeUp}>
              {heroStats.map(({ icon: Icon, label }) => (
                <div className="hero-proof" key={label}>
                  <Icon size={24} />
                  <span>{label}</span>
                </div>
              ))}
            </motion.div>
            <motion.div className="hero-actions" variants={fadeUp}>
              <motion.a className="primary-cta" href={whatsappUrl} target="_blank" rel="noreferrer" whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                Agendar Demonstração <ArrowRight size={17} />
              </motion.a>
              <motion.a className="secondary-cta" href="#recursos" whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                Conhecer o Sistema <Play size={15} fill="currentColor" />
              </motion.a>
            </motion.div>
            <motion.div className="hero-trust" variants={fadeUp}>
              <ShieldCheck size={16} />
              <span>Solução confiável, segura e desenvolvida para a indústria</span>
            </motion.div>
          </motion.div>
          <HeroDashboard />
        </div>
      </section>

      <SectionMotion className="problem-section" id="beneficios">
        <div className="argos-container">
          <motion.h2 variants={fadeUp}>Os desafios da sua produção, <span>solucionados pelo ARGOS</span></motion.h2>
          <motion.div className="problem-grid" variants={stagger}>
            {problems.map(({ icon: Icon, title, description, accent }) => (
              <motion.article className={`problem-card ${accent ? 'problem-card-accent' : ''}`} variants={fadeUp} whileHover={{ y: -6 }} key={title}>
                <Icon size={34} />
                <h3>{title}</h3>
                <p>{description}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </SectionMotion>

      <SectionMotion className="benefits-section" id="recursos">
        <div className="argos-container">
          <motion.h2 variants={fadeUp}>Resultados que impulsionam sua indústria</motion.h2>
          <motion.div className="benefits-grid" variants={stagger}>
            {benefits.map(({ icon: Icon, title, description }) => (
              <motion.article className="benefit-card" variants={fadeUp} whileHover={{ y: -7, borderColor: 'rgba(59, 130, 246, 0.55)' }} key={title}>
                <Icon size={36} />
                <h3>{title}</h3>
                <p>{description}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </SectionMotion>

      <SectionMotion className="industrial-section" id="como-funciona">
        <div className="factory-backdrop" />
        <div className="argos-container industrial-layout">
          <motion.div className="industrial-copy" variants={fadeUp}>
            <h2>Acompanhe sua fábrica em tempo real</h2>
            <p>Dados atualizados a cada segundo para você ter o controle total da sua produção na palma da mão ou na tela da fábrica.</p>
            <div className="feature-list">
              <span><MonitorDot size={17} /> Dashboards intuitivos</span>
              <span><Bell size={17} /> Alertas inteligentes</span>
              <span><ClipboardList size={17} /> Relatórios automáticos</span>
            </div>
            <motion.a className="outline-cta" href="#casos" whileHover={{ x: 3 }}>
              Ver todas as funcionalidades <ArrowRight size={16} />
            </motion.a>
          </motion.div>
          <OperationsDashboard />
        </div>
      </SectionMotion>

      <SectionMotion className="social-proof" id="casos">
      </SectionMotion>

      <SectionMotion className="final-cta-section" id="contato">
        <div className="argos-container final-cta-card">
          <motion.div variants={fadeUp}>
            <h2>Pronto para transformar sua produção?</h2>
            <p>Agende uma demonstração gratuita e descubra como o ARGOS pode gerar resultados reais para sua fábrica.</p>
          </motion.div>
          <motion.a className="primary-cta" href={whatsappUrl} target="_blank" rel="noreferrer" variants={fadeUp} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
            Agendar Demonstração <ArrowRight size={17} />
          </motion.a>
        </div>
      </SectionMotion>

      <footer className="argos-footer" id="sobre">
        <div className="argos-container footer-grid">
          <div className="footer-brand">
            <img src="/Argos sem fundo.png" alt="ARGOS" />
            <p>Solução completa para monitoramento de máquinas, gestão da produção e aumento da produtividade na indústria.</p>
          </div>
          <div>
            <h3>Soluções</h3>
            <a href="#solucoes">Monitoramento de Máquinas</a>
            <a href="#recursos">Gestão da Produção</a>
            <a href="#beneficios">OEE e Indicadores</a>
            <a href="#como-funciona">Relatórios e Análises</a>
          </div>
          <div>
            <h3>Empresa</h3>
            <a href="#sobre">Sobre o ARGOS</a>
            <a href="#casos">Cases de Sucesso</a>
            <a href="#contato">Contato</a>
            <a href="#">Política de Privacidade</a>
          </div>
          <div>
            <h3>Suporte</h3>
            <a href="#">Central de Ajuda</a>
            <a href="#">Documentação</a>
            <a href="#contato">Fale com o Suporte</a>
            <a href="#">Treinamentos</a>
          </div>
          <div>
            <h3>Contato</h3>
            <span>WhatsApp: (47) 99210-1234</span>
            <span>E-mail: contato@argos.ind.br</span>
            <span>Localização: Santa Catarina, Brasil</span>
            <div className="footer-socials">
              <i>in</i>
              <i>ig</i>
              <i>yt</i>
            </div>
          </div>
        </div>
        <div className="footer-bottom">© 2026 ARGOS Monitoramento Industrial. Todos os direitos reservados.</div>
      </footer>
    </main>
  )
}
