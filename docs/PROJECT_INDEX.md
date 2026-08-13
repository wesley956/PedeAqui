# PedeAqui — Índice Mestre do Projeto

Este diretório é a fonte oficial de decisões, arquitetura, escopo e backlog do produto **PedeAqui**. O repositório técnico continua se chamando `cruz`.

## Objetivo do produto

Construir um SaaS multiempresa/multiunidade para restaurantes e operações de alimentação, centralizando cardápio digital, pedidos, PDV, produção/KDS, impressão, salão, delivery, pagamentos, caixa, clientes/CRM, fidelidade, estoque, compras, financeiro, fiscal, relatórios, marketing, integrações e escala SaaS.

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
- `PLANS_SCALE_STATUS.md` — #239–#253

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

Após a conclusão e merge do PR #279, o `main` fica consolidado oficialmente até **[253]**, encerrando os macroblocos previstos no blueprint principal.

Marcos recentes:

- Conversas / WhatsApp / IA #152–#163 — PR #182
- Caixa #164–#174 — PR #194
- Entregas operacionais/Entregadores #175–#185 — PR #206
- Estoque e Fichas Técnicas #186–#198 — PR #220
- Compras e Fornecedores #199–#210 — PR #233, merge `cdb79c63ad61e7f24cba2d628ff5aaf7065043d6`
- Financeiro / DRE #211–#224 — PR #248, merge `feffa6792838798b45769e8a5fa006a76bc5060d`
- Fiscal e Integrações #225–#238 — PR #263, merge `d0afa1de71012cbd95d72b78a670bafb29e996ab`
- Planos, Escala e White-label #239–#253 — PR #279

Todo o núcleo técnico **#001–#253** fica no `main` com as migrations correspondentes aplicadas no Supabase oficial.

### Milestone 22 — Fiscal e Integrações #225–#238

Status: **concluído e mesclado** no PR #263.

Issues oficiais: #249–#262.

Entregue:

- perfis fiscais por unidade e classificação fiscal versionada;
- documento/itens/histórico fiscal separados de `orders`;
- State Machine fiscal própria;
- fila persistente de emissão/cancelamento com lease/retry;
- interface `FiscalProvider` e registry explícito de adapters;
- webhook fiscal inbound seguro e proteção contra replay;
- bucket privado de XML/DANFE e URLs assinadas;
- registry genérico de integrações e webhooks outbound duráveis;
- `/fiscal` e saúde/reconciliação;
- segurança server-only/RLS validada;
- E2E PostgreSQL com rollback e zero resíduos.

Detalhes: `FISCAL_INTEGRATIONS_STATUS.md`.

### Milestone 23 — Planos, Escala e White-label #239–#253

Status: **implementado no PR #279 e preparado para consolidação final**.

Issues oficiais: #264–#278.

Entregue:

- catálogo de planos/features e matriz de entitlements;
- assinatura por organização com lifecycle e histórico imutável;
- limites periódicos atômicos/idempotentes e quotas concorrentes reais;
- provider/registry de billing desacoplado e webhook assinado;
- console SaaS `/platform` com Super Admin explícito;
- branding/white-label aplicado ao shell real;
- domínios personalizados com verificação DNS TXT;
- grupos/franquias com isolamento de organização;
- central de compras multiunidade sem estoque global fictício;
- BI multiunidade sobre Pedidos/Financeiro existentes;
- catálogo/marketplace de integrações aprovadas;
- painel `/escala`;
- 14/14 tabelas novas com RLS, 0 grants de browser e 0 EXECUTE de RPCs internas por browser;
- E2E final de assinatura/quotas/isolamento/BI/marketplace com rollback e zero resíduos.

Detalhes: `PLANS_SCALE_STATUS.md`.

## Homologações externas que não alteram a conclusão do blueprint

O núcleo do produto está implementado, mas alguns pontos dependem de ambiente/fornecedor físico externo e continuam como homologações de produção:

- provider fiscal/SEFAZ real, certificado e regras específicas por estabelecimento/UF/regime;
- provider de cobrança real para checkout/portal/webhooks de assinatura;
- provisionamento de TLS/edge para domínios customizados após a verificação DNS;
- teste físico final de impressão ESC/POS/hardware;
- prova de concorrência PostgreSQL com duas conexões físicas independentes, quando houver `DATABASE_URL` apropriada.

Esses itens não exigem reescrever o domínio: os adapters, filas e contratos já estão preparados para recebê-los.

## Regra de consulta

Antes de criar um novo módulo, responder:

1. Que entidade existente ele utiliza?
2. Que eventos ele consome?
3. Que eventos ele produz?
4. Quais permissões precisa?
5. Quais dados pertencem à organização e à unidade?
6. Quais ações precisam de auditoria?
