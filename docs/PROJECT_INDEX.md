# PedeAqui — Índice Mestre do Projeto

Este diretório é a fonte oficial de decisões, arquitetura, escopo e backlog do produto **PedeAqui**. O repositório técnico continua se chamando `cruz`.

## Objetivo do produto

Construir um SaaS multiempresa/multiunidade para restaurantes e operações de alimentação, centralizando cardápio digital, pedidos, PDV, produção/KDS, impressão, salão, delivery, pagamentos, caixa, clientes/CRM, fidelidade, estoque, compras, financeiro, fiscal, relatórios, marketing e integrações.

## Princípio central

Os módulos compartilham entidades e regras de domínio. Exemplo: `order.completed` → estoque → financeiro → CRM → fidelidade → analytics/notificações.

## Identidade oficial

- Nome: **PedeAqui**
- Tagline: **Seu pedido começa aqui.**
- Paleta-base: laranja + grafite
- Especificação: `BRAND_IDENTITY.md`

## Documentos

- `BLUEPRINT_MASTER.md` — visão completa do produto.
- `IMPLEMENTATION_BACKLOG.md` — backlog técnico e sequência executável.
- `PRINTING_SYSTEM.md` — arquitetura de impressão.
- `ARCHITECTURE_DECISIONS.md` — decisões técnicas.
- `INFRASTRUCTURE.md` — backend oficial.
- `BRAND_IDENTITY.md` — identidade visual.
- `FOUNDATION_STATUS.md` — #001–#016.
- `CATALOG_STATUS.md` — #017–#024.
- `MENU_STATUS.md` — #025–#032.
- `DELIVERY_STATUS.md` — #033–#035.
- `CART_STATUS.md` — #036–#040.
- `CHECKOUT_STATUS.md` — #041–#046.
- `ORDER_ENGINE_STATUS.md` — #047–#057.
- `PRINTING_STATUS.md` — #058–#082.
- `ORDER_MANAGER_STATUS.md` — #083–#091.
- `KITCHEN_STATUS.md` — #092–#095.
- `PAYMENTS_STATUS.md` — #096–#101.
- `PDV_STATUS.md` — #102–#110.
- `CUSTOMERS_DASHBOARD_STATUS.md` — #111–#115.
- `QUALITY_HARDENING_STATUS.md` — #116–#126.
- `DINING_STATUS.md` — #127–#139.
- `CRM_GROWTH_STATUS.md` — #140–#151.
- `CONVERSATIONS_STATUS.md` — #152–#163.
- `CASH_STATUS.md` — #164–#174.
- `DELIVERY_OPERATIONS_STATUS.md` — #175–#185.
- `INVENTORY_RECIPES_STATUS.md` — #186–#198.
- `PURCHASES_SUPPLIERS_STATUS.md` — #199–#210.

## Ordem macro executável

1. Fundação
2. Catálogo
3. Cardápio público
4. Cliente e configuração de entrega
5. Carrinho e pricing
6. Checkout
7. Motor de pedidos
8. Central de impressão
9. Gestor de pedidos
10. Produção
11. Pagamentos
12. PDV
13. Clientes/dashboard
14. Qualidade e hardening
15. Salão
16. CRM/marketing
17. WhatsApp/IA
18. Caixa
19. Entregas operacionais/entregadores
20. Estoque e fichas técnicas
21. Compras/fornecedores
22. Financeiro/DRE
23. Fiscal e integrações
24. Planos, escala e white-label

## Regra de consulta

Antes de criar um novo módulo, responder:

1. Que entidade existente ele utiliza?
2. Que eventos ele consome?
3. Que eventos ele produz?
4. Quais permissões precisa?
5. Quais dados pertencem à organização e à unidade?
6. Quais ações precisam de auditoria?

## Estado atual — 12/08/2026

### Consolidado em `main`

O `main` está consolidado oficialmente até **[198]**.

- Pagamentos #096–#101 — PR #114.
- PDV #102–#110 — PR #124.
- Clientes/Dashboard #111–#115 — PR #130.
- Qualidade/Hardening #116–#126 — PR #142.
- Salão #127–#139 — PR #156.
- CRM e Crescimento #140–#151 — PR #169.
- Conversas / WhatsApp / IA #152–#163 — PR #182.
- Caixa #164–#174 — PR #194.
- Entregas operacionais/Entregadores #175–#185 — PR #206, merge `b866ce5c2972791dd7674dbad219a6f7f5411227`.
- Estoque e Fichas Técnicas #186–#198 — PR #220, merge `d93972cd8720c3594a0106d3ee66204b52acade7`.

Todo o núcleo #001–#198 está no `main`. As migrations correspondentes permanecem aplicadas no Supabase oficial.

### Milestone 18 — Entregas operacionais / Entregadores #175–#185

Status: **concluído e mesclado em `main`**.

Issues #195–#205 encerradas como `completed`.

Destaques:

- `drivers`, `deliveries`, `delivery_history`;
- `orders.fulfillment_status` preservado como fonte de verdade;
- disponibilidade/capacidade, atribuição e reatribuição atômicas/idempotentes;
- `/entregas` e `/entregador`;
- Realtime e SLA;
- `DeliveryQuoteService` centraliza a cotação autoritativa por endereço;
- endereço inserido/selecionado recalcula elegibilidade, taxa/frete grátis, mínimo e ETA no servidor;
- revisão final do checkout recalcula o frete novamente antes de criar o pedido;
- E2E PostgreSQL com rollback/zero resíduos;
- CI final #133 verde no head mesclado.

Detalhes: `DELIVERY_OPERATIONS_STATUS.md`.

### Milestone 19 — Estoque e Fichas Técnicas #186–#198

Status: **concluído e mesclado em `main`**.

Issues #207–#219 encerradas como `completed`.

Destaques:

- ledger imutável `inventory_movements` + projeção `inventory_balances`;
- quantidades exatas `numeric(18,6)`;
- entradas, perdas, ajustes, produção, transferências e contagem física;
- estoque mínimo e eventos de reposição;
- fichas técnicas imutáveis/versionadas para produtos e adicionais;
- proteção histórica por `effective_at` e `created_at` na confirmação;
- baixa automática/idempotente no `order.completed`;
- `/estoque` e `/estoque/fichas`;
- E2Es com rollback/zero resíduos;
- CI #138 verde contra `main` antes do merge.

Detalhes: `INVENTORY_RECIPES_STATUS.md`.

### Milestone 20 — Compras e Fornecedores #199–#210

Status: **implementado/validado no draft PR #233**, branch `agent/purchases-suppliers-199-210`, ainda não mesclado.

Issues oficiais: #221–#232.

Destaques atuais:

- fornecedor mestre por organização + condições por unidade;
- catálogo fornecedor↔insumo com unidade de compra e conversão exata;
- pedido de compra com número amigável e snapshots;
- ciclo `draft → sent → partially_received → received` e cancelamento controlado;
- recebimentos/correções imutáveis;
- integração transacional com Estoque/custo médio;
- idempotência com fingerprint SHA-256 e rejeição de payload divergente;
- sugestões de reposição sem compra automática;
- `/fornecedores` e `/compras`;
- 9/9 tabelas novas com RLS, browser sem privilégios diretos e sem EXECUTE das RPCs internas;
- FKs novas cobertas por índices;
- E2E endurecido: 10/10 checks, rollback/zero resíduos;
- CI #144 verde no head de código; usar o CI do head documental final como evidência definitiva.

Detalhes: `PURCHASES_SUPPLIERS_STATUS.md`.

### Próxima expansão após Compras

A sequência macro segue para **Financeiro/DRE [211+]**. Esse bloco deve consumir eventos já produzidos por vendas, pagamentos, caixa e compras sem transformar esses domínios em dependentes do ledger financeiro.
