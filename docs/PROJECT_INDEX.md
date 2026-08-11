# PedeAqui — Índice Mestre do Projeto

Este diretório é a fonte oficial de decisões, arquitetura, escopo e backlog do produto **PedeAqui**. O repositório técnico continua se chamando `cruz`.

## Objetivo do produto

Construir um SaaS multiempresa/multiunidade para restaurantes e operações de alimentação, centralizando cardápio digital, pedidos, PDV, produção/KDS, impressão, salão, delivery, pagamentos, caixa, clientes/CRM, fidelidade, estoque, compras, financeiro, fiscal, relatórios, marketing e integrações.

## Princípio central

O sistema não será um conjunto de telas isoladas. As entidades de domínio serão compartilhadas e os módulos conversarão por regras de negócio e eventos.

Exemplo:

`order.completed` → estoque → financeiro → CRM → fidelidade → analytics/notificações.

## Identidade oficial

- Nome: **PedeAqui**
- Tagline: **Seu pedido começa aqui.**
- Paleta-base: laranja + grafite
- Especificação: `BRAND_IDENTITY.md`

## Documentos

- `BLUEPRINT_MASTER.md` — visão completa do produto, módulos, entidades, fluxos e fases.
- `IMPLEMENTATION_BACKLOG.md` — backlog técnico Fase 0 + Fase 1 e sequência executável.
- `PRINTING_SYSTEM.md` — arquitetura profissional de impressão, filas, estações, roteamento e contingência.
- `ARCHITECTURE_DECISIONS.md` — decisões técnicas e regras que não podem ser quebradas sem ADR explícita.
- `INFRASTRUCTURE.md` — backend oficial e histórico de reset do Supabase.
- `BRAND_IDENTITY.md` — nome, cores, tagline e regras de identidade.
- `FOUNDATION_STATUS.md` — status #001–#016.
- `CATALOG_STATUS.md` — status #017–#024.
- `MENU_STATUS.md` — status #025–#032.
- `DELIVERY_STATUS.md` — status #033–#035.
- `CART_STATUS.md` — status #036–#040.
- `CHECKOUT_STATUS.md` — status #041–#046.
- `ORDER_ENGINE_STATUS.md` — status #047–#057.
- `PRINTING_STATUS.md` — status #058–#082.
- `ORDER_MANAGER_STATUS.md` — status #083–#091.
- `KITCHEN_STATUS.md` — status #092–#095.
- `PAYMENTS_STATUS.md` — status #096–#101.
- `PDV_STATUS.md` — status #102–#110.
- `CUSTOMERS_DASHBOARD_STATUS.md` — status #111–#115.
- `QUALITY_HARDENING_STATUS.md` — status #116–#126 e evidências de teste/hardening.

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

- Blueprint: definido.
- Identidade: PedeAqui, laranja + grafite.
- Fundação #001–#016: consolidada no `main`.
- Catálogo #017–#024: consolidado no `main`; schema aplicado no Supabase oficial.
- Cardápio/Clientes #025–#032: consolidado no `main`; migrations aplicadas.
- Endereços/Entrega #033–#035: consolidado no `main`; migrations aplicadas.
- Carrinho/Pricing #036–#040: consolidado no `main`; migrations aplicadas.
- Checkout #041–#046: consolidado no `main`; migrations aplicadas.
- Motor de Pedidos #047–#057: consolidado no `main`; migrations aplicadas.
- Central Profissional de Impressão #058–#082: consolidada no `main`; CI verde e migrations aplicadas.
- Gestor de Pedidos #083–#091: consolidado no `main` pelo PR #102; CI final run #52 verde.
- Produção/KDS #092–#095: consolidada no `main` pelo PR #107; CI final run #56 verde.
- Pagamentos #096–#101: implementado na branch `agent/payments-096-101`, draft PR #114, CI run #60 verde; migrations `payments_096_101` e `payment_paid_guard` aplicadas no Supabase oficial. Ainda não mesclado.
- PDV #102–#110: implementado de forma empilhada na branch `agent/pdv-102-110`, draft PR #124, CI final run #64 verde; migration `pdv_102_110` aplicada no Supabase oficial. Ainda não mesclado.
- Clientes e Dashboard #111–#115: implementados na branch `agent/customers-dashboard-111-115`, draft PR #130, CI run #65 verde; migration `customers_dashboard_111_115` aplicada. Ainda não mesclado.
- Qualidade e Hardening #116–#126: implementados na branch `agent/quality-hardening-116-126`, issues #131–#141; detalhes em `QUALITY_HARDENING_STATUS.md`.
- PricingService e as quatro State Machines possuem cobertura ampliada/matricial.
- Testes PostgreSQL com rollback validaram isolamento multiempresa, checkout duplicado, Cardápio → Cozinha, PDV → Cozinha e retry/fallback da impressão; todas as fixtures terminaram com zero resíduos.
- Concorrência está protegida por `FOR UPDATE`, uniques, sequência atômica, lock de idempotência e `FOR UPDATE SKIP LOCKED`; o conector atual não fornece segunda credencial SQL para teste simultâneo multi-sessão, e essa limitação está documentada sem alegar uma prova que não ocorreu.
- Migration `quality_hardening_116_126` removeu todos os privilégios diretos de tabelas públicas de `anon`; `bootstrap_organization`, `accept_invitation` e `has_permission` também deixaram de ser anon-executáveis.
- Anon mantém apenas as projeções públicas `get_public_menu` e `get_public_product`; todas as tabelas públicas permanecem com RLS.
- Security Advisor após hardening: 0 alertas.
- Next.js aplica CSP, anti-framing, nosniff, Referrer-Policy, Permissions-Policy e COOP.
- O detalhe de pedido indexa adicionais uma única vez em `Map`, evitando filtro O(itens × adicionais).
- Mobile autenticado mantém todos os módulos acessíveis após esconder a sidebar; PDV usa alvos de toque mínimos de 44px em telas pequenas.
- O backlog técnico Fase 0 + Fase 1 documentado em `IMPLEMENTATION_BACKLOG.md` termina no item #126. A próxima expansão macro é Salão; novo milestone deve receber numeração/escopo antes da implementação.
