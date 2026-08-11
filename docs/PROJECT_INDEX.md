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

## Ordem macro

1. Fundação
2. Catálogo
3. Cardápio público
4. Cliente e entrega
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
18. Estoque/compras/financeiro
19. Fiscal e integrações
20. Escala/white-label

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

O `main` está consolidado oficialmente até **[151]**:

- Pagamentos #096–#101 — PR #114.
- PDV #102–#110 — PR #124.
- Clientes/Dashboard #111–#115 — PR #130.
- Qualidade/Hardening #116–#126 — PR #142.
- Salão #127–#139 — PR #156.
- CRM e Crescimento #140–#151 — PR #169.

Todo o núcleo #001–#151 está no `main` e as migrations correspondentes permanecem aplicadas no Supabase oficial.

### Milestone 15 — CRM e Crescimento #140–#151

Status: **concluído e mesclado em `main`**.

- PR #169 mesclado;
- issues #157–#168 encerradas como `completed`;
- cupons, cashback, pontos, segmentos, campanhas, automações e painel `/crescimento` implementados;
- integração autoritativa com checkout/PDV;
- Security Advisor em 0 alertas;
- detalhes em `CRM_GROWTH_STATUS.md`.

### Milestone 16 — Conversas / WhatsApp / IA #152–#163

Status: **em implementação no draft PR #182**, branch `agent/conversations-whatsapp-ai-152-163`.

Issues oficiais: #170–#181.

Já implementado/validado no bloco:

- contatos omnichannel vinculáveis ao CRM;
- conversations/messages e State Machine `bot|waiting_agent|human|closed`;
- handoff e histórico/auditoria;
- Inbox `/conversas` com Realtime;
- configuração `/configuracoes/conversas`;
- adapter de WhatsApp desacoplado;
- webhook assinado/idempotente;
- resposta outbound humana idempotente;
- `automation_sessions`;
- allowlist de IA sem SQL arbitrário;
- migrations 44–46 aplicadas no Supabase;
- Security Advisor 0;
- E2E PostgreSQL com rollback e zero resíduos;
- CI #118 verde no head executável `9cff267347b508586549e9fe56bd8f474d5f6e14`.

Limite atual: a homologação real contra a infraestrutura externa do WhatsApp depende de um número/provider e credenciais reais conectados ao ambiente. Não considerar essa etapa externa validada até executar inbound/outbound real.

Detalhes: `CONVERSATIONS_STATUS.md`.

### Próxima expansão macro após o Milestone 16

O blueprint segue para **Gestão: estoque, fichas técnicas, compras, fornecedores, financeiro e DRE**, após concluir/homologar o Milestone 16.
