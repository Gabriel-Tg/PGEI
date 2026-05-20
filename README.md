# PGEI

**PGEI** é uma plataforma web SaaS para apontamento de produção em tempo real em indústrias.
Ela centraliza ordens, paradas, refugo e desempenho de máquinas, criando visibilidade contínua para o chão de fábrica e gestão.

## Visão geral

O PGEI foi projetado para indústrias pequenas e médias que ainda dependem de papel, planilhas ou apontamento manual para documentar produção.
A solução oferece um painel multiempresa com controle de acesso por papéis, rastreabilidade por empresa e isolamento total de dados.

## Problema que resolve

- Elimina controles manuais dispersos em planilhas ou formulários.
- Reduz inconsistências entre operadores e gestão.
- Proporciona visibilidade em tempo real das máquinas e das ordens de produção.
- Torna o registro de paradas, refugo e baixa eficiência confiável.
- Permite decisões operacionais mais rápidas com dados auditáveis.

## Público-alvo

- Indústrias de pequeno e médio porte
- Fábricas com linhas de produção repetitiva
- Operações que precisam de controle de ordens, paradas e produção em tempo real
- Equipes com diferentes níveis de acesso: administrador, supervisor e operador

## Arquitetura

- Frontend: React + Vite
- Backend: Supabase (PostgreSQL, Auth, Realtime, RLS)
- Modelo multiempresa com `companies` e `company_users`
- Controle de acesso baseado em papéis:
  - `admin`
  - `supervisor`
  - `operator`
- Isolamento total de dados por `company_id`

## Tecnologias utilizadas

- React
- Vite
- Supabase
  - PostgreSQL
  - Auth
  - Realtime
  - Row Level Security
- @dnd-kit
- PapaParse
- Luxon

## Principais funcionalidades

- Multiempresa com tenant isolation
- Painel de produção por máquina
- Lista de ordens com reordenação e edição
- Cadastro de ordens de produção
- Registro de paradas, baixa eficiência e retomada
- Rastreamento de produção e refugo
- Tela estilo TV para monitoramento contínuo
- Autenticação com papéis e permissões
- Realtime para dashboards e notificações

## Como rodar localmente

1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/PGEI.git
   cd PGEI
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Crie o arquivo `.env` a partir de `.env.example`.

4. Inicie o ambiente de desenvolvimento:
   ```bash
   npm run dev
   ```

5. Para gerar a build de produção:
   ```bash
   npm run build
   ```

## Configuração do Supabase

O PGEI usa Supabase para autenticação, persistência e acesso em tempo real.

### Variáveis necessárias

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Exemplo de `.env.example`

```env
VITE_SUPABASE_URL=https://xxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Script SQL

Use o arquivo `supabase/schema.sql` para criar o esquema completo do sistema. Este é o arquivo de esquema oficial do projeto e centraliza todas as tabelas, políticas RLS e triggers necessárias.

- `companies`
- `company_users`
- `machines`
- `orders`
- `production_scans`
- `machine_stops`
- `scrap_logs`
- `low_efficiency_logs`
- `tablet_status`
- `machine_priorities`
- `items` e demais tabelas operacionais
- controle de papéis e policies RLS

## Multiempresa

O sistema adota uma arquitetura multiempresa com:

- `companies` como tenant principal
- `company_users` para associar usuários a empresas e funções
- `company_id` em todas as tabelas operacionais
- isolamento total de dados entre tenants
- políticas RLS para bloquear acesso entre empresas

## Estrutura do projeto

- `src/App.jsx` — resolução de tenant e roteamento principal
- `src/demo/DemoApp.jsx` — app principal do cliente/tenant
- `src/abas/` — telas do produto (Painel, Lista, NovaOrdem, Rastreio, Gestao, PainelTV)
- `src/hooks/` — lógica de autenticação e ordens
- `src/lib/` — integrações e constantes Supabase
- `src/components/` — componentes compartilhados
- `src/admin/` — painel administrativo e gestão de clientes/maquinas
- `supabase/schema.sql` — esquema completo de banco e políticas de segurança
- `DATABASE.md` — documentação do banco de dados

## Como aplicar o script SQL

1. Abra o Supabase SQL Editor.
2. Cole o conteúdo de `supabase/schema.sql`.
3. Execute o script.
4. Valide as tabelas e políticas no painel do Supabase.

## Roadmap futuro

- Painel de indicadores de OEE e eficiência em tempo real
- Exportação de relatórios em PDF/CSV
- Integração com scanners de código de barras
- Controle de refugo por lote e rastreabilidade completa
- Dashboards personalizados por cliente
- Automação de alertas e workflow de parada

## Diferenciais competitivos

- Modelo multiempresa pronto para SaaS
- Isolamento total de dados com RLS
- Controle de acesso por papéis industriais
- Interface de chão de fábrica e telão TV
- Centralização de ordens, paradas e refugo
- Suporte fullstack React + Supabase em tempo real

## Licença e contato

- Licença: MIT
- Contato: [seu-email@empresa.com](mailto:seu-email@empresa.com)
