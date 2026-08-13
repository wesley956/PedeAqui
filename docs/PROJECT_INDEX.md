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

O `main` está consolidado oficialmente até **[174]**.

- Pagamentos #096–#101 — PR #114.
- PDV #102–#110 — PR #124.
- Clientes/Dashboard #111–#115 — PR #130.
- Qualidade/Hardening #116–#126 — PR #142.
- Salão #127–#139 — PR #156.
- CRM e Crescimento #140–#151 — PR #169.
- Conversas / WhatsApp / IA #152–#163 — PR #182.
- Caixa #164–#174 — PR #194, merge `07fe3ea43ff7361258e73fcefc6eed1460f6f98e`.

Todo o núcleo #001–#174 está no `main`. As migrations correspondentes permanecem aplicadas no Supabase oficial.

### Milestone 17 — Caixa #164–#174

Status: **concluído e mesclado em `main`**.

- issues #183–#193 encerradas como completed;
- caixas configuráveis, sessões/turnos e ledger imutável;
- abertura/fechamento idempotentes;
- suprimento, sangria, saldo esperado e conferência;
- pagamentos e estornos em dinheiro integrados ao caixa;
- `/caixa` responsivo;
- Security Advisor 0;
- E2E PostgreSQL com rollback e zero resíduos;
- CI final #126 verde.

Detalhes: `CASH_STATUS.md`.

### Milestone 18 — Entregas operacionais / Entregadores #175–#185

Status: **implementado/validado no draft PR #206**, branch `agent/delivery-operations-175-185`, ainda não mesclado.

Issues oficiais: #195–#205.

Implementado no bloco:

- `drivers`, `deliveries`, `delivery_history`;
- `orders.fulfillment_status` preservado como fonte de verdade;
- disponibilidade e capacidade por entregador;
- atribuição e reatribuição atômicas/idempotentes;
- histórico logístico imutável;
- retirada → em rota → entregue reutilizando o State Machine existente;
- `/entregas` para operação/expedição;
- `/entregador` mobile-first e restrito ao usuário vinculado;
- Realtime e SLA;
- `DeliveryQuoteService` centraliza a cotação autoritativa por endereço;
- ao inserir/selecionar endereço, o servidor recalcula elegibilidade, pedido mínimo, taxa/frete grátis e ETA;
- a revisão final do checkout recalcula novamente antes da criação do pedido;
- hardening de triggers do bootstrap para evitar colisão de grants de owner/manager;
- migrations 52–55 aplicadas em equivalentes oficiais;
- 3/3 tabelas novas com RLS e browser sem privilégios de mutação/RPC interna;
- Security Advisor 0;
- E2E PostgreSQL de capacidade, atribuição, retry, reatribuição e entrega com rollback/zero resíduos;
- teste de bootstrap owner/manager: catálogo 44/44 permissões sem colisão;
- CI #130 verde no head executável anterior à consolidação documental; usar o CI do head final do PR como evidência definitiva.

Detalhes: `DELIVERY_OPERATIONS_STATUS.md`.

### Próxima expansão após Entregas

A sequência acordada segue para **Estoque e Fichas Técnicas**. Esse bloco deve consumir catálogo/pedidos concluídos, controlar matérias-primas e baixas de estoque sem fazer do frontend autoridade de quantidade ou custo. Depois seguem Compras/Fornecedores e Financeiro/DRE.
