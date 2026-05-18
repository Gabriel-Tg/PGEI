# Diagnóstico Multiempresa (Supabase)

Data: 2026-03-10
Escopo auditado: estrutura inferida por uso real no frontend + SQLs existentes no repositório.

## Etapa 1: Diagnóstico

### 1) Visão geral do estado atual
- O sistema está orientado a máquina por um identificador textual machine_id (ex.: P1, P2, P3).
- Não há isolamento nativo por cliente no modelo atual.
- As tabelas operacionais usam machine_id e order_id, mas não client_id.
- Existe risco de mistura de dados entre empresas futuras (especialmente se duas empresas tiverem máquina P1).
- Há ambiguidade de nomenclatura de item: solicitação cita item (singular), mas o frontend usa items (plural).

### 2) Classificação arquitetural
- Tabelas mestres: clients (nova), machines (nova), items/item, tech_sheets.
- Tabelas transacionais: orders, production_scans, scrap_logs, machine_stops, injection_production_entries, low_efficiency_logs, estoque_purchases.
- Tabelas de configuração/controle: machine_priorities, shift_responsibles, tablet_status, tech_sheet_revisions, item_structures.

### 3) Riscos de mistura de dados
- orders e tabelas filhas sem client_id: risco alto de leitura cruzada no futuro.
- tablet_status usa onConflict por machine_id global: risco alto em multiempresa (P1 de clientes diferentes colidiria).
- item_structures e items sem client_id: risco alto de estrutura/produto compartilhados indevidamente.
- tech_sheets e revisões sem client_id: risco médio-alto de ficha cruzada entre empresas.

## Etapa 2: Modelagem nova

### Tabela clients
- id (uuid, pk)
- name
- slug (unique case-insensitive)
- subdomain (unique case-insensitive)
- active
- is_demo
- created_at
- updated_at

### Tabela machines
- id (uuid, pk)
- client_id (fk -> clients.id)
- machine_code (texto de compatibilidade com machine_id atual)
- machine_name
- route_slug
- sector
- active
- created_at
- updated_at
- unique (client_id, machine_code)
- unique (client_id, route_slug)

## Etapa 3: Migração segura (progressiva)

1. Criar clients e machines.
2. Garantir DEMO (seed idempotente).
3. Adicionar client_id nas tabelas existentes sem NOT NULL inicial.
4. Adicionar machine_id onde faltar (sem quebrar fluxo).
5. Backfill via orders (onde houver order_id) e fallback para DEMO.
6. Popular machines a partir de machine_id existentes + P1/P2/P3.
7. Adicionar FKs com NOT VALID e validar gradualmente.

## Etapa 4: Constraints finais

Aplicar somente após backfill validado:
- NOT NULL em client_id para todas operacionais/mestres relevantes.
- NOT NULL em machine_id para tabelas de máquina.
- NOT NULL em order_id nas tabelas onde a regra exige vínculo obrigatório (production_scans, scrap_logs).
- unique por tenant em estruturas críticas (items/item, item_structures, machine_priorities, shift_responsibles, tech_sheets).

## Etapa 5: Seed DEMO

Regras aplicadas:
- DEMO obrigatório com is_demo = true.
- slug/subdomain demo.
- idempotente (não duplica).
- atualiza registro existente para manter consistência.

## Etapa 6: Preparação para RLS

Estratégia recomendada:
1. Inserir client_id em JWT (claim app_metadata.client_id) e usar policy por client_id.
2. Ativar RLS em tabelas operacionais com using (client_id = auth.jwt()->>'client_id').
3. Para anon/tablet: migrar fluxo para RPC ou edge function que resolve client por subdomínio/rota e grava com service role.
4. Remover política aberta em tablet_status no momento da virada para produção multiempresa.

---

## Diagnóstico por tabela (solicitado)

### estoque_purchases
- Precisa client_id: sim.
- Precisa machine_id: não obrigatório.
- FK nova: client_id -> clients.id.
- Herdar vínculo: não.
- Índice novo: (client_id, item_code, purchase_date).
- Unique nova: (client_id, item_code, purchase_date) se cada compra for única por data/item.
- Ajuste de nome: não.
- Migração antiga: preencher client_id com DEMO.

### injection_production_entries
- Precisa client_id: sim.
- Precisa machine_id: sim.
- FK nova: client_id -> clients; (client_id,machine_id) -> machines.
- Herdar vínculo: order_id -> orders para backfill.
- Índice novo: (client_id,machine_id,created_at), (client_id,order_id).
- Unique nova: não recomendada agora.
- Ajuste de nome: não.
- Migração antiga: preencher client_id/machine_id via orders; fallback DEMO.

### item_structures
- Precisa client_id: sim.
- Precisa machine_id: não.
- FK nova: client_id -> clients.
- Herdar vínculo: não.
- Índice novo: (client_id,finished_item_code), (client_id,input_item_code).
- Unique nova: (client_id,finished_item_code,input_item_code).
- Ajuste de nome: manter.
- Migração antiga: preencher client_id DEMO.

### item (ou items)
- Precisa client_id: sim.
- Precisa machine_id: não.
- FK nova: client_id -> clients.
- Herdar vínculo: não.
- Índice novo: (client_id,code).
- Unique nova: (client_id,code).
- Ajuste de nome: manter nome atual por compatibilidade; se houver item e items, padronizar depois com view de compatibilidade.
- Migração antiga: preencher client_id DEMO.

### low_efficiency_logs
- Precisa client_id: sim.
- Precisa machine_id: sim.
- FK nova: client_id -> clients; (client_id,machine_id) -> machines.
- Herdar vínculo: opcional order_id -> orders (se existir).
- Índice novo: (client_id,machine_id,started_at), (client_id,order_id).
- Unique nova: não.
- Ajuste de nome: não.
- Migração antiga: backfill por orders; fallback DEMO.

### machine_priorities
- Precisa client_id: sim.
- Precisa machine_id: sim.
- FK nova: client_id -> clients; (client_id,machine_id) -> machines.
- Herdar vínculo: não.
- Índice novo: (client_id,machine_id).
- Unique nova: (client_id,machine_id).
- Ajuste de nome: não.
- Migração antiga: preencher client_id DEMO.

### machine_stops
- Precisa client_id: sim.
- Precisa machine_id: sim.
- FK nova: client_id -> clients; (client_id,machine_id) -> machines.
- Herdar vínculo: order_id opcional (quando houver).
- Índice novo: (client_id,machine_id,started_at), (client_id,order_id).
- Unique nova: não.
- Ajuste de nome: não.
- Migração antiga: backfill por orders; fallback DEMO.

### orders
- Precisa client_id: sim.
- Precisa machine_id: sim.
- FK nova: client_id -> clients; (client_id,machine_id) -> machines.
- Herdar vínculo: não.
- Índice novo: (client_id,machine_id,finalized,pos), (client_id,created_at).
- Unique nova: evitar por enquanto para não quebrar histórico de código O.P.
- Ajuste de nome: não.
- Migração antiga: preencher client_id DEMO.

### production_scans
- Precisa client_id: sim.
- Precisa machine_id: sim.
- FK nova: client_id -> clients; (client_id,machine_id) -> machines.
- Herdar vínculo: order_id -> orders para backfill.
- Índice novo: (client_id,machine_id,created_at), (client_id,order_id).
- Unique nova: opcional (client_id,order_id,scanned_box) para impedir caixa duplicada por tenant.
- Ajuste de nome: não.
- Migração antiga: backfill por orders; fallback DEMO.

### scrap_logs
- Precisa client_id: sim.
- Precisa machine_id: sim.
- FK nova: client_id -> clients; (client_id,machine_id) -> machines.
- Herdar vínculo: order_id -> orders para backfill.
- Índice novo: (client_id,machine_id,created_at), (client_id,order_id).
- Unique nova: não.
- Ajuste de nome: não.
- Migração antiga: backfill por orders; fallback DEMO.

### shift_responsibles
- Precisa client_id: sim.
- Precisa machine_id: sim.
- FK nova: client_id -> clients; (client_id,machine_id) -> machines.
- Herdar vínculo: não.
- Índice novo: (client_id,machine_id,created_at).
- Unique nova: (client_id,machine_id,shift,effective_date).
- Ajuste de nome: manter colunas operator/responsible legadas por compatibilidade.
- Migração antiga: preencher client_id DEMO.

### tablet_status
- Precisa client_id: sim.
- Precisa machine_id: sim.
- FK nova: client_id -> clients; (client_id,machine_id) -> machines.
- Herdar vínculo: não.
- Índice novo: (client_id,machine_id), (client_id,last_seen_at).
- Unique nova: (client_id,machine_id).
- Ajuste de nome: manter machine_id por compatibilidade imediata; migrar app depois para onConflict composto.
- Migração antiga: preencher client_id DEMO.

### tech_sheet_revisions
- Precisa client_id: sim.
- Precisa machine_id: opcional (recomendado para performance e RLS simplificada).
- FK nova: client_id -> clients.
- Herdar vínculo: sheet_id -> tech_sheets para backfill client_id/machine_id.
- Índice novo: (client_id,sheet_id,revision desc).
- Unique nova: opcional (sheet_id,revision).
- Ajuste de nome: não.
- Migração antiga: preencher via join com tech_sheets; fallback DEMO.

### tech_sheets
- Precisa client_id: sim.
- Precisa machine_id: sim (já utilizado no serviço).
- FK nova: client_id -> clients; (client_id,machine_id) -> machines.
- Herdar vínculo: não.
- Índice novo: (client_id,machine_id,item_code).
- Unique nova: (client_id,machine_id,item_code) se uma ficha por item/máquina.
- Ajuste de nome: não.
- Migração antiga: preencher client_id DEMO.

---

## Tabela-resumo final

| Tabela | Precisa client_id | Precisa machine_id | Ação recomendada |
|---|---|---|---|
| estoque_purchases | Sim | Não | Add client_id + FK + índice por item/data |
| injection_production_entries | Sim | Sim | Add client_id/machine_id + FKs + backfill via order |
| item_structures | Sim | Não | Add client_id + unique por finished/input |
| item ou items | Sim | Não | Add client_id + unique por code dentro do cliente |
| low_efficiency_logs | Sim | Sim | Add client_id/machine_id + backfill via order |
| machine_priorities | Sim | Sim | Add client_id + unique(client,machine) |
| machine_stops | Sim | Sim | Add client_id/machine_id + FKs |
| orders | Sim | Sim | Add client_id + FK para machines por cliente |
| production_scans | Sim | Sim | Add client_id/machine_id + NOT NULL final |
| scrap_logs | Sim | Sim | Add client_id/machine_id + NOT NULL final |
| shift_responsibles | Sim | Sim | Add client_id/machine_id + unique shift/dia |
| tablet_status | Sim | Sim | Add client_id + fase 2 para PK composta |
| tech_sheet_revisions | Sim | Opcional | Add client_id (e machine_id opcional) + backfill por sheet |
| tech_sheets | Sim | Sim | Add client_id + unique(client,machine,item) |
