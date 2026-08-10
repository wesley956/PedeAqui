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
- `FOUNDATION_STATUS.md` — status da implementação #001–#016 na branch/PR de fundação.
- `CATALOG_STATUS.md` — status do catálogo #017–#024 na branch/PR de catálogo.
- `MENU_STATUS.md` — status #025–#032 na branch/PR de cardápio e clientes.
- `DELIVERY_STATUS.md` — status #033–#035 na branch/PR de endereços e entrega.
- `CART_STATUS.md` — status #036–#040 na branch/PR de carrinho e pricing.
- `CHECKOUT_STATUS.md` — status #041–#046 na branch/PR de checkout.
- `ORDER_ENGINE_STATUS.md` — status #047–#057 na branch/PR do motor de pedidos.

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

## Estado atual — 10/08/2026

- Blueprint: definido.
- Identidade: PedeAqui, laranja + grafite.
- Impressão: subsistema estrutural e próximo bloco lógico.
- Fundação #001–#016: implementada no draft PR #17; schema aplicado no Supabase oficial.
- Catálogo #017–#024: implementado no draft PR #26; CI verde e schema aplicado no Supabase oficial.
- Cardápio/Clientes #025–#032: implementado no draft PR #35; CI verde e migrations aplicadas.
- Endereços/Entrega #033–#035: implementado no draft PR #39; CI verde e migrations aplicadas.
- Carrinho/Pricing #036–#040: implementado no draft PR #47; CI verde e migrations aplicadas.
- Checkout #041–#046: implementado no draft PR #54; CI verde e migrations aplicadas.
- Motor de Pedidos #047–#057: implementado no draft PR #66; CI verde no run #27 e migrations aplicadas no Supabase oficial.
- Pedidos usam quatro ciclos independentes: `order_status`, `payment_status`, `production_status` e `fulfillment_status`; produção inicia em `pending_confirmation` e só pode entrar na fila depois da confirmação.
- Checkout → pedido é transacional e idempotente por carrinho, com número amigável atômico por unidade, criação/reaproveitamento de cliente, snapshots de itens/adicionais/endereço/pagamento, histórico inicial e `order.created` no outbox.
- Cancelamento/recusa encerra produção e fulfillment na mesma transação; pagamento continua independente para permitir refund explícito.
- Acompanhamento público usa token dedicado por pedido em cookie HttpOnly; o cookie de carrinho é encerrado após a conversão para que um novo carrinho possa começar sem perder acesso ao pedido anterior.
- `/pedidos` e `/pedidos/[id]` possuem atualização interna em realtime sujeita a sessão autenticada, `orders.view` e RLS; o cliente público não recebe SELECT anônimo em `orders`.
- Supabase `zsbsczjhiujnhdznrzck`: dedicado ao PedeAqui; Security Advisor com zero alertas após as migrations do motor de pedidos.
- Arte original da logo PedeAqui localizada na File Library; binário ainda não exportável pelo conector atual. Tokens e identidade oficial registrados em `BRAND_IDENTITY.md`.
- Próximo bloco lógico: #058–#082 — Central Profissional de Impressão (impressoras, estações, roteamento, fila durável, retry, templates, reimpressão, fallback, Print Agent, heartbeat e ESC/POS).
