# Documentação do Banco de Dados PGEI

## Visão geral

O PGEI opera em arquitetura multiempresa (multi-tenant) com isolamento total por `company_id`.
A tabela central é `companies`, que representa cada cliente/empresa SaaS.
Usuários autenticados são vinculados a empresas via `company_users` e recebem papéis de acesso.

## Tabelas principais

- `companies`
  - Tenant mestre do sistema.
  - Campos obrigatórios: `id`, `name`, `slug`, `subdomain`, `active`, `is_demo`, `created_at`.
  - Campos opcionais: `updated_at`.

- `company_users`
  - Mapeia usuários autenticados a empresas e papéis.
  - Campos obrigatórios: `company_id`, `user_id`, `email`, `role`, `active`, `created_at`.
  - Papéis: `admin`, `supervisor`, `operator`.

- `machines`
  - Cadastro de máquinas por empresa.
  - Campos obrigatórios: `company_id`, `machine_code`, `machine_id`, `active`, `created_at`.
  - Índices: `company_id, machine_code`, `company_id, route_slug`.

- `orders`
  - Ordens de produção.
  - Campos obrigatórios: `company_id`, `machine_id`, `code`, `status`, `finalized`, `created_at`.
  - Índices: `company_id, machine_id`, `company_id, status`, `company_id, pos`.

- `production_scans`
  - Registros de produção por caixa.
  - Campos obrigatórios: `company_id`, `order_id`, `machine_id`, `scanned_box`, `created_at`.

- `machine_stops`
  - Paradas de máquina registradas.
  - Campos obrigatórios: `company_id`, `order_id`, `machine_id`, `started_at`, `created_at`.

- `scrap_logs`
  - Registros de refugo.
  - Campos obrigatórios: `company_id`, `order_id`, `machine_id`, `qty`, `created_at`.

- `low_efficiency_logs`
  - Eventos de baixa eficiência.
  - Campos obrigatórios: `company_id`, `order_id`, `machine_id`, `started_at`, `created_at`.

- `production_logs`
  - View sintética de dados agregados de produção e parada.
  - Não possui dados operacionais próprios; é construída sobre `production_scans`, `machine_stops`, `scrap_logs` e `low_efficiency_logs`.

## Relações principais

- `companies.id` → `machines.company_id`
- `companies.id` → `orders.company_id`
- `companies.id` → `production_scans.company_id`
- `companies.id` → `machine_stops.company_id`
- `companies.id` → `scrap_logs.company_id`
- `companies.id` → `low_efficiency_logs.company_id`
- `companies.id` → `company_users.company_id`
- `orders.id` → `production_scans.order_id`
- `orders.id` → `machine_stops.order_id`
- `orders.id` → `scrap_logs.order_id`
- `orders.id` → `low_efficiency_logs.order_id`
- `companies.id` → `items.company_id`

## Diagrama ER (texto)

companies
  ├─ company_users
  ├─ machines
  ├─ orders
  │   ├─ production_scans
  │   ├─ machine_stops
  │   ├─ scrap_logs
  │   └─ low_efficiency_logs
  ├─ tablet_status
  ├─ machine_priorities
  ├─ items
  │   ├─ item_structures
  │   └─ estoque_purchases
  ├─ tech_sheets
      └─ tech_sheet_revisions

## Índices recomendados

- `ux_companies_slug` — busca por empresa via slug.
- `ux_companies_subdomain` — resolução de tenant pela URL.
- `ux_machines_company_code` — validação de máquina por empresa.
- `idx_orders_company_machine` — dashboard de fila por máquina.
- `idx_orders_company_status` — filtros rápidos por status.
- `idx_production_scans_company_order` — agregação de produção por ordem.
- `idx_machine_stops_company_machine` — análise de paradas por máquina.
- `ux_items_company_code` — catálogo de itens por empresa.

## Regras de negócio e RLS

- `admin` — acesso total dentro da própria empresa, incluindo gerenciamento de empresa, máquinas, ordens e usuários.
- `supervisor` — pode visualizar e gerenciar produção, ordens e eventos operacionais.
- `operator` — apenas registrar produção e eventos de chão de fábrica.

### Políticas supabase criadas

- `company_users_select` — usuário vê apenas seu próprio registro ou é plataforma admin.
- `orders_*` — somente `admin` e `supervisor` podem criar/editar ordens.
- `production_scans_*` — operadores podem inserir, supervisores podem alterar.
- `machine_stops_*`, `scrap_logs_*`, `low_efficiency_logs_*` — operadores podem registrar, supervisores podem ajustar.
- Todas as tabelas de operação exigem `company_id` e são protegidas por `can_access_company(company_id)`.

## Campos obrigatórios vs opcionais

### Obrigatórios

- `companies.name`
- `companies.slug`
- `companies.subdomain`
- `company_users.role`
- `machines.company_id`
- `machines.machine_code`
- `orders.company_id`
- `orders.machine_id`
- `orders.code`
- `production_scans.company_id`
- `production_scans.order_id`
- `production_scans.machine_id`
- `machine_stops.company_id`
- `machine_stops.order_id`
- `machine_stops.machine_id`
- `scrap_logs.company_id`
- `scrap_logs.order_id`
- `scrap_logs.machine_id`
- `low_efficiency_logs.company_id`
- `low_efficiency_logs.order_id`
- `low_efficiency_logs.machine_id`

### Opcionais

- `orders.customer`
- `orders.product`
- `orders.color`
- `orders.notes`
- `machines.machine_name`
- `machines.sector`
- `scrap_logs.note`
- `low_efficiency_logs.notes`
- `tablet_status.operator_name`
- `tech_sheets.description`

## Observações

- O script `supabase/schema.sql` também cria triggers para sincronizar `company_id` e `client_id` em tabelas legadas.
- O campo `client_id` é mantido como alias de compatibilidade para evitar quebra imediata do frontend existente.
- A abordagem de `company_users` atende ao requisito de controle de acesso por usuário e não altera diretamente a tabela de autenticação `auth.users`.
