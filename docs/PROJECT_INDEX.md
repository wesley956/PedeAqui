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

- Fundação #001–#016, Catálogo #017–#024, Cardápio/Clientes #025–#032, Entrega #033–#035, Carrinho #036–#040, Checkout #041–#046, Pedidos #047–#057, Impressão #058–#082, Gestor #083–#091 e Produção #092–#095 estão consolidados no `main`.
- Pagamentos #096–#101: branch `agent/payments-096-101`, draft PR #114, CI #60 verde e migrations aplicadas; não mesclado.
- PDV #102–#110: branch `agent/pdv-102-110`, draft PR #124, CI #64 verde e migration aplicada; não mesclado.
- Clientes/Dashboard #111–#115: branch `agent/customers-dashboard-111-115`, draft PR #130, CI #65 verde e migration aplicada; não mesclado.
- Qualidade #116–#126: branch `agent/quality-hardening-116-126`, draft PR #142, CI #68 verde com 111/111 testes; migration aplicada; não mesclado.
- Salão #127–#139: branch `agent/dining-127-139`, draft PR #156, issues #143–#155; migrations 33–37 aplicadas; não mesclado.
- Salão usa o mesmo `orders`: cada rodada tem `tab_id`, `tab_round_number`, canal `waiter` ou `table_qr` e fulfillment `table`.
- Há somente uma comanda ativa por mesa; transferência é atômica; participantes podem receber itens para divisão da conta.
- Rodadas usam preço autoritativo, entram no mesmo fluxo de produção e impressão e têm idempotência.
- Pagamentos da comanda reutilizam `payments`, respeitam formas habilitadas e suportam conta geral ou participante.
- Fechamento exige conta quitada e produção pronta; pedidos são servidos/concluídos e a mesa entra em limpeza.
- `/salao` é o board operacional; `/salao/[tableId]` concentra a comanda; `/mesa/[code]` é o fluxo público de QR sem UUID interno.
- E2E PostgreSQL com rollback validou abertura repetida, transferência, participantes, rodada do garçom, rodada QR, 2 pedidos, 2 impressões, divisão, pagamentos e fechamento; rollback deixou zero fixtures.
- Validação de banco após Salão: advisor de segurança sem alertas, tabelas do módulo com RLS e operações internas restritas ao servidor.
- Próxima expansão macro: **CRM/marketing**.
