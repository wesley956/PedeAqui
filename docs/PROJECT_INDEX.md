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
- Clientes e Dashboard #111–#115: implementados de forma empilhada na branch `agent/customers-dashboard-111-115`, issues #125–#129; migration `customers_dashboard_111_115` aplicada no Supabase oficial.
- `/clientes` agora busca nome/telefone/e-mail, ordena por atividade/gasto/pedidos/nome e mostra métricas derivadas de pedidos concluídos.
- `/clientes/[id]` consolida dados, métricas, endereços e até 20 pedidos recentes; o histórico usa o cliente autenticado do Supabase para manter a RLS de `orders` como autoridade de visibilidade por unidade.
- `orders_customer_metrics_after_completion` atualiza contagem, total gasto, ticket médio e última compra na mesma transação em que o pedido entra em `completed`; a migration também executou backfill determinístico.
- `/dashboard` agora usa dados reais da unidade ativa: vendas/pedidos concluídos, ticket médio, pedidos abertos, clientes identificados, comparação com ontem, série de 24 horas e top 8 produtos.
- Dia e hora do Dashboard são calculados no PostgreSQL usando `stores.timezone`; o navegador não decide o período contábil operacional.
- `dashboard_snapshot_internal` é `SECURITY INVOKER`, revogada de `PUBLIC`/`anon`/`authenticated` e executável apenas pelo `service_role` depois de `dashboard.view` ser autorizado no servidor.
- Teste transacional com rollback confirmou cliente 1 pedido/R$ 10,00/ticket R$ 10,00, Dashboard com 1 venda/1 pedido aberto/1 cliente, agrupamento em 00h de São Paulo e top produto 2× X-Burger; zero resíduos após rollback.
- Security Advisor segue zerado após a migration.
- Banco oficial continua sem organização/usuário real; hardware de impressão e E2E visual autenticado dependem do primeiro ambiente operacional real.
- Próximo bloco lógico: #116–#126 — Qualidade e hardening.
