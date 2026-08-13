# PedeAqui — Índice Mestre do Projeto

Este diretório é a fonte oficial de decisões, arquitetura, escopo e backlog do produto **PedeAqui**. O repositório técnico continua se chamando `cruz`.

## Objetivo do produto

Construir um SaaS multiempresa/multiunidade para restaurantes e operações de alimentação, centralizando cardápio digital, pedidos, PDV, produção/KDS, impressão, salão, delivery, pagamentos, caixa, clientes/CRM, fidelidade, estoque, compras, financeiro, fiscal, relatórios, marketing e integrações.

## Princípio central

Os módulos compartilham entidades e eventos, mas cada domínio preserva sua própria fonte de verdade. Exemplo: `order.completed` pode alimentar estoque, financeiro, CRM e integrações sem transformar o pedido em ledger financeiro, saldo de estoque ou documento fiscal.

## Identidade oficial

- Nome: **PedeAqui**
- Tagline: **Seu pedido começa aqui.**
- Paleta-base: laranja + grafite
- Especificação: `BRAND_IDENTITY.md`

## Documentos de status

- `FOUNDATION_STATUS.md` — #001–#016
- `CATALOG_STATUS.md` — #017–#024
- `MENU_STATUS.md` — #025–#032
- `DELIVERY_STATUS.md` — #033–#035
- `CART_STATUS.md` — #036–#040
- `CHECKOUT_STATUS.md` — #041–#046
- `ORDER_ENGINE_STATUS.md` — #047–#057
- `PRINTING_STATUS.md` — #058–#082
- `ORDER_MANAGER_STATUS.md` — #083–#091
- `KITCHEN_STATUS.md` — #092–#095
- `PAYMENTS_STATUS.md` — #096–#101
- `PDV_STATUS.md` — #102–#110
- `CUSTOMERS_DASHBOARD_STATUS.md` — #111–#115
- `QUALITY_HARDENING_STATUS.md` — #116–#126
- `DINING_STATUS.md` — #127–#139
- `CRM_GROWTH_STATUS.md` — #140–#151
- `CONVERSATIONS_STATUS.md` — #152–#163
- `CASH_STATUS.md` — #164–#174
- `DELIVERY_OPERATIONS_STATUS.md` — #175–#185
- `INVENTORY_RECIPES_STATUS.md` — #186–#198
- `PURCHASES_SUPPLIERS_STATUS.md` — #199–#210
- `FINANCE_STATUS.md` — #211–#224
- `FISCAL_INTEGRATIONS_STATUS.md` — #225–#238

Documentos estruturais: `BLUEPRINT_MASTER.md`, `IMPLEMENTATION_BACKLOG.md`, `ARCHITECTURE_DECISIONS.md`, `INFRASTRUCTURE.md`, `PRINTING_SYSTEM.md` e `BRAND_IDENTITY.md`.

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

## Estado atual — 13/08/2026

### Consolidado em `main`

O `main` está consolidado oficialmente até **[224]**.

Marcos recentes:

- Conversas / WhatsApp / IA #152–#163 — PR #182
- Caixa #164–#174 — PR #194
- Entregas operacionais/Entregadores #175–#185 — PR #206
- Estoque e Fichas Técnicas #186–#198 — PR #220
- Compras e Fornecedores #199–#210 — PR #233, merge `cdb79c63ad61e7f24cba2d628ff5aaf7065043d6`
- Financeiro / DRE #211–#224 — PR #248, merge `feffa6792838798b45769e8a5fa006a76bc5060d`

Todo o núcleo técnico **#001–#224** está no `main`. As migrations correspondentes permanecem aplicadas no Supabase oficial.

### Milestone 22 — Fiscal e Integrações #225–#238

Status: **em implementação/validação no draft PR #263**, branch `agent/fiscal-integrations-225-238`, diretamente sobre `main [224]`. Não mesclar sem autorização explícita.

Issues oficiais: #249–#262.

Destaques já implementados:

- perfis fiscais por unidade e classificação fiscal versionada;
- documento/itens/histórico fiscal separados de `orders`;
- snapshots imutáveis e identificadores fiscais como texto;
- State Machine fiscal própria;
- fila persistente de emissão/cancelamento com lease/retry;
- interface `FiscalProvider` + registry explícito de adapters;
- configuração por referências a secrets, sem credencial em claro;
- webhook fiscal inbound verificado pelo provider e com replay protection;
- bucket privado de XML/DANFE com SHA-256 e URLs assinadas;
- registry genérico de integrações;
- webhooks outbound duráveis sobre `domain_events`, assinatura HMAC e egress allowlist;
- `/fiscal` e snapshot de saúde/reconciliação;
- 10/10 tabelas novas Fiscal/Integrações com RLS, zero grants diretos de browser e zero EXECUTE de RPCs internas por browser;
- E2E PostgreSQL do ciclo fiscal executado com rollback e zero resíduos.

Detalhes: `FISCAL_INTEGRATIONS_STATUS.md`.

### Próximo e último macrobloco do blueprint principal

Após um head Fiscal verde, a sequência passa para **Planos, Escala e White-label [239+]**. O bloco deve consolidar `plans`, `features`, `plan_features`, `organization_subscriptions`, entitlements/limites, ciclo de assinatura desacoplado de provider, branding/white-label, domínios personalizados e recursos avançados multiunidade/escala.

## Regra de consulta

Antes de criar um novo módulo, responder:

1. Que entidade existente ele utiliza?
2. Que eventos ele consome?
3. Que eventos ele produz?
4. Quais permissões precisa?
5. Quais dados pertencem à organização e à unidade?
6. Quais ações precisam de auditoria?
