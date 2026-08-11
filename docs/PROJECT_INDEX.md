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

O `main` está consolidado oficialmente até **[139]**. A cadeia que estava empilhada foi mesclada sequencialmente preservando ancestralidade:

- Pagamentos #096–#101 — PR #114.
- PDV #102–#110 — PR #124.
- Clientes/Dashboard #111–#115 — PR #130.
- Qualidade/Hardening #116–#126 — PR #142.
- Salão #127–#139 — PR #156, merge final `90e0807aa08560f48012bee22631adee7d1396ff`.

Todo o núcleo #001–#139 está, portanto, no `main`. As migrations correspondentes permanecem aplicadas no Supabase oficial.

### Milestone 15 — CRM e Crescimento #140–#151

Implementação atual:

- branch `agent/crm-growth-140-151`;
- draft PR #169, base `main`;
- issues oficiais #157–#168;
- permissões `growth.view`, `growth.manage`, `growth.campaigns`;
- cupons e elegibilidade;
- ledgers de cashback e pontos;
- resgate/acúmulo idempotentes e transações compensatórias;
- integração autoritativa com checkout e PDV;
- pedido total zero sem payment row monetária;
- revalidação automática de benefícios após repricing do carrinho;
- segmentos dinâmicos;
- campaigns + recipients congelados;
- automation rules/runs;
- `order.completed` concede recompensas e executa automações idempotentes;
- `/crescimento` para operação administrativa;
- checkout público e PDV com cupom/cashback/pontos;
- navegação desktop/mobile inclui Crescimento.

Migrations Growth aplicadas no Supabase oficial:

- `growth_core_140_151` — 38.
- `growth_operations_140_151` — 39.
- `growth_pdv_140_151` — 40.
- `growth_campaigns_automations_140_151` — 41.
- `growth_cart_refresh_140_151` — 42.
- `growth_private_execution_grants_140_151` — 43.

E2Es PostgreSQL com rollback já validaram:

- checkout com cupom + cashback + pontos + geração posterior de recompensas;
- rejeição com devolução dos benefícios;
- pedido 100% coberto por cupom e sem payment row;
- PDV com benefícios, idempotency retry, cupom anônimo e venda total zero;
- segmento dinâmico;
- snapshot de campanha;
- automações `order.completed` de cashback/pontos/campanha;
- rotinas de aniversário/inatividade idempotentes por data.

A auditoria de grants detectou e corrigiu uma cadeia de privilege necessária para RPCs `SECURITY INVOKER`: `service_role` recebeu USAGE no schema `private` e EXECUTE apenas nos helpers Growth indispensáveis; `anon`/`authenticated` continuam sem EXECUTE nesses helpers.

Detalhes, regras e evidências: `CRM_GROWTH_STATUS.md`.

### Próxima expansão macro

Após concluir e mesclar #169, o blueprint segue para **Conversas / WhatsApp / IA**, reutilizando campaigns/recipients e mantendo provedores externos desacoplados do domínio de pedidos.
