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

## Estado atual — 11/08/2026

### Consolidado em `main`

O `main` está consolidado oficialmente até **[163]**.

- Pagamentos #096–#101 — PR #114.
- PDV #102–#110 — PR #124.
- Clientes/Dashboard #111–#115 — PR #130.
- Qualidade/Hardening #116–#126 — PR #142.
- Salão #127–#139 — PR #156.
- CRM e Crescimento #140–#151 — PR #169.
- Conversas / WhatsApp / IA #152–#163 — PR #182, merge `0c07a698287a3339be27217893c7f1b02017a0b2`.

Todo o núcleo #001–#163 está no `main`. As migrations correspondentes permanecem aplicadas no Supabase oficial.

### Milestone 16 — Conversas / WhatsApp / IA #152–#163

Status: **concluído e mesclado em `main`**.

- issues #170–#181;
- Inbox `/conversas`, contacts/messages/conversations e State Machine;
- adapter/webhook WhatsApp e outbound humano;
- `automation_sessions` e allowlist de ferramentas de IA;
- migrations 44–46;
- Security Advisor 0;
- E2E interno/DB e CI final verdes.

Pendência operacional externa: homologar tráfego real contra um número/conta da Meta quando as credenciais forem configuradas. Isso não reabre o milestone de domínio.

Detalhes: `CONVERSATIONS_STATUS.md`.

### Milestone 17 — Caixa #164–#174

Status: **em implementação/validação no draft PR #194**, branch `agent/cash-register-164-174`.

Issues oficiais: #183–#193.

Implementado no bloco:

- `cash_registers`, `cash_sessions`, `cash_movements`;
- ledger de movimentos imutável;
- abertura/fechamento idempotentes;
- suprimento e sangria;
- saldo esperado e diferença contado × esperado;
- integração automática com pagamentos em dinheiro;
- estorno por movimento compensatório;
- `/caixa` responsivo e navegação desktop/mobile;
- PDV orienta abertura antes de venda cash;
- painel de pagamentos permite refund auditado;
- migrations 47–51 aplicadas em equivalentes oficiais;
- E2E real com rollback e zero resíduos;
- Security Advisor 0.

Detalhes e evidências: `CASH_STATUS.md`.

### Próxima expansão após Caixa

A sequência acordada segue para **Entregas operacionais / Entregadores**. O módulo existente #033–#035 cobre endereço, configuração e taxa de entrega; o próximo bloco deve cobrir `drivers`, `deliveries`, atribuição, despacho, status e painel operacional sem duplicar as regras atuais de checkout/endereço.
