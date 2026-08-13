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
- `INVENTORY_RECIPES_STATUS.md` — #186–#198.
- `PURCHASES_SUPPLIERS_STATUS.md` — #199–#210.
- `FINANCE_DRE_STATUS.md` — #211–#224.

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

## Estado atual — 13/08/2026

### Consolidado em `main`

O `main` está consolidado oficialmente até **[198]**.

- Pagamentos #096–#101 — PR #114.
- PDV #102–#110 — PR #124.
- Clientes/Dashboard #111–#115 — PR #130.
- Qualidade/Hardening #116–#126 — PR #142.
- Salão #127–#139 — PR #156.
- CRM e Crescimento #140–#151 — PR #169.
- Conversas / WhatsApp / IA #152–#163 — PR #182.
- Caixa #164–#174 — PR #194.
- Entregas operacionais/Entregadores #175–#185 — PR #206, merge `b866ce5c2972791dd7674dbad219a6f7f5411227`.
- Estoque e Fichas Técnicas #186–#198 — PR #220, merge `d93972cd8720c3594a0106d3ee66204b52acade7`.

Todo o núcleo #001–#198 está no `main`. As migrations correspondentes permanecem aplicadas no Supabase oficial.

### Milestone 20 — Compras e Fornecedores #199–#210

Status: **implementado/validado no draft PR #233**, branch `agent/purchases-suppliers-199-210`, ainda não mesclado.

Issues oficiais: #221–#232.

Destaques:

- fornecedor mestre por organização + condições por unidade;
- catálogo fornecedor↔insumo com unidade de compra e conversão exata;
- pedido de compra com número amigável e snapshots;
- ciclo `draft → sent → partially_received → received` e cancelamento controlado;
- recebimentos/correções imutáveis;
- integração transacional com Estoque/custo médio;
- idempotência com fingerprint SHA-256 e rejeição de payload divergente;
- sugestões de reposição sem compra automática;
- `/fornecedores` e `/compras`;
- 9/9 tabelas novas com RLS, browser sem privilégios diretos e sem EXECUTE das RPCs internas;
- FKs novas cobertas por índices;
- E2E endurecido: 10/10 checks, rollback/zero resíduos;
- **CI final #149 verde** no head `b08c3d416ddc5869ed3ee51b694e17b8ec9dca70`.

Detalhes: `PURCHASES_SUPPLIERS_STATUS.md`.

### Milestone 21 — Financeiro / DRE #211–#224

Status: **implementado e em validação final no draft PR #248**, branch `agent/finance-211-224`, empilhado sobre o PR #233 e ainda não mesclado.

Issues oficiais: #234–#247.

Destaques:

- contas financeiras e projeções de saldo derivadas de ledger;
- categorias financeiras e grupos gerenciais de DRE;
- `financial_transactions` imutável;
- recebíveis e pagáveis derivados das fontes operacionais;
- competência separada de liquidação/caixa;
- liquidação parcial/final, estorno compensatório e transferências pareadas;
- venda concluída reconhece receita; pagamento realmente pago liquida recebível;
- consumo real do Estoque reconhece CPV pelo custo do movimento;
- recebimento de compra cria conta a pagar sem antecipar CPV;
- prazo do fornecedor é snapshot do pedido de compra;
- reembolso reduz conta, recebível e DRE;
- correção de compra já paga pode gerar crédito contra fornecedor;
- Caixa físico, Pagamentos, Compras e Estoque preservados como fontes de verdade dos próprios domínios;
- `/financeiro` com `finance.view`, `finance.manage`, `finance.settle` e `finance.reports` separados;
- vendas só podem ser liquidadas pelo domínio Pagamentos;
- liquidações automáticas de Pagamentos só podem ser estornadas no domínio de origem;
- tabelas financeiras com RLS e acesso server-only;
- E2Es PostgreSQL de núcleo, integração e hardening executados com rollback/zero resíduos.

Detalhes: `FINANCE_DRE_STATUS.md`.

### Pilha de PRs ainda não mesclada

`main [198] → #233 Compras/Fornecedores [199–210] → #248 Financeiro/DRE [211–224]`

Nenhum desses PRs deve ser mesclado sem autorização explícita atual do usuário. Antes de qualquer merge, revalidar head SHA, base, mergeabilidade e CI do head exato.

### Próxima expansão após Financeiro

A sequência macro segue para **Fiscal e integrações [225+]**, somente depois de consolidar e revalidar a pilha atual. O módulo fiscal deverá consumir fatos já consolidados, sem transformar Pedidos, Pagamentos, Compras ou Financeiro em dependentes de um provedor fiscal específico.
