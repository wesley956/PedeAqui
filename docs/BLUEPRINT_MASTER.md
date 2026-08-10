# Blueprint Mestre — Cruz

Versão 1.0 — fonte de produto e arquitetura.

## 1. Visão

Plataforma SaaS multiempresa/multiunidade para restaurantes, lanchonetes, hamburguerias, pizzarias, açaí, bares, cafeterias, marmitarias e delivery.

O núcleo cobre:

- cardápio digital;
- pedidos;
- WhatsApp/atendimento;
- PDV/balcão;
- salão, mesas e comandas;
- cozinha/KDS;
- impressão;
- entregas;
- pagamentos e caixa;
- clientes/CRM;
- cupons, cashback e fidelidade;
- estoque e fichas técnicas;
- compras e fornecedores;
- financeiro;
- fiscal;
- marketing;
- relatórios;
- integrações/API/webhooks.

## 2. Hierarquia

`Plataforma → Organização → Unidade/Loja → Usuários/Funcionários → Operação`

Toda informação de negócio deve estar isolada por `organization_id`; quando aplicável também por `store_id`.

## 3. Papéis

- Super Admin: plataforma, empresas, planos, saúde, logs e suporte.
- Proprietário: controle total da organização.
- Gerente: operação, equipe, estoque e relatórios operacionais.
- Caixa: abertura/fechamento, pagamentos, sangria e suprimento.
- Atendente: pedidos, clientes e PDV.
- Garçom: mesas, comandas e lançamentos.
- Cozinha: produção/KDS sem dados financeiros sensíveis.
- Entregador: entregas atribuídas e status.
- Financeiro: contas, receitas, despesas e DRE.

Permissões serão granulares (RBAC), por exemplo `orders.create`, `orders.cancel`, `cash.withdraw`, `inventory.adjust`.

## 4. Módulos e entidades principais

### Fundação
`organizations`, `stores`, `profiles`, `organization_members`, `roles`, `permissions`, `role_permissions`, `user_store_roles`, `invitations`, `audit_logs`.

### Catálogo
`categories`, `products`, `product_variants`, `modifier_groups`, `modifiers`, `product_modifier_groups`, `combos`.

### Clientes
`customers`, `customer_addresses`.

### Pedidos
`carts`, `cart_items`, `cart_item_modifiers`, `orders`, `order_items`, `order_item_modifiers`, `order_status_history`.

Canais previstos: `whatsapp`, `digital_menu`, `pdv`, `counter`, `waiter`, `table_qr`, `ifood`, `api`, `manual`.

Tipos: `delivery`, `pickup`, `counter`, `table`.

Estados mestre: `draft`, `pending_confirmation`, `confirmed`, `waiting_payment`, `paid`, `queued`, `preparing`, `ready`, `out_for_delivery`, `completed`, além de `cancelled`, `rejected`, `payment_failed`, `refunded`.

### Pagamentos e caixa
`payments`, `payment_transactions`, `cash_registers`, `cash_movements`.

Pagamento é entidade diferente de pedido e um pedido pode ter múltiplos pagamentos.

### Salão
`tables`, `tabs`, `tab_members`.

Mesas: `available`, `occupied`, `reserved`, `cleaning`, `disabled`.

### Produção
`production_stations`, `kitchen_tickets`.

Estações: cozinha, chapa, fritura, bar, sobremesas, expedição etc.

### Impressão
`printers`, `station_printers`, `product_production_stations`, `print_jobs`.

Detalhes em `PRINTING_SYSTEM.md`.

### Delivery
`drivers`, `deliveries`, `delivery_zones`.

Taxas inicialmente por bairro; arquitetura preparada para raio e polígono.

### CRM e crescimento
`coupons`, `cashback_accounts`, `cashback_transactions`, `loyalty_accounts`, `loyalty_transactions`, `campaigns`, `campaign_recipients`, `automation_rules`, `automation_runs`.

### Conversas/WhatsApp
`conversations`, `messages`, `contacts`, `automation_sessions`.

Estados: `bot`, `waiting_agent`, `human`, `closed`.

IA somente usa ferramentas autorizadas, nunca acesso arbitrário ao banco.

### Estoque
`inventory_items`, `inventory_movements`, `recipes`, `recipe_items`.

Movimentos: `purchase`, `sale`, `loss`, `adjustment`, `transfer`, `production`, `return`.

### Compras
`suppliers`, `purchases`, `purchase_items`.

Compra concluída atualiza estoque e financeiro via domínio/eventos.

### Financeiro
`financial_accounts`, `financial_categories`, `financial_transactions`.

Tipos: recebível, pagável, receita, despesa, transferência.

### Fiscal
`fiscal_profiles`, `fiscal_documents`, `fiscal_items`.

Fiscal permanece desacoplado do núcleo de pedidos.

### Integrações
`integrations`, `webhooks` com arquitetura por adaptadores: pagamento, WhatsApp, marketplace, fiscal, delivery etc.

## 5. Fluxo mestre do delivery

`Cliente → WhatsApp/Cardápio → Produtos → Carrinho → Endereço → Taxa → Cupom/Cashback → Pagamento → Pedido → Gestor → Cozinha/Impressão → Pronto → Entrega → Conclusão → Estoque → Financeiro → CRM → Fidelidade → Relatórios`.

## 6. Fluxo mestre do salão

`Cliente → Mesa → Comanda → Garçom/QR → Pedido → Cozinha/Impressão → Consumo → Conta → Divisão → Pagamento → Caixa → Fechamento → Estoque/Financeiro/CRM`.

## 7. Fluxo estoque/compras

`Fornecedor → Compra → Entrada → Estoque → Ficha técnica → Venda → Consumo → Estoque mínimo → Alerta → Nova compra`.

## 8. Fluxo cliente/CRM

`Primeiro contato → Cadastro → Pedido → Histórico → Segmentação → Cashback/Pontos → Campanhas → Recompra → Fidelização`.

## 9. Fluxo financeiro

Venda → pagamento → recebível → liquidação → conta.

Compra → despesa → pagamento.

Receitas − despesas → DRE → resultado.

## 10. Eventos de domínio

Base inicial:

- `organization.created`
- `store.created`
- `product.created`
- `product.updated`
- `customer.created`
- `order.created`
- `order.confirmed`
- `order.preparing`
- `order.ready`
- `order.out_for_delivery`
- `order.completed`
- `order.cancelled`
- `payment.created`
- `payment.approved`
- `payment.refunded`
- `print.job_created`
- `print.completed`
- `print.failed`
- `printer.online`
- `printer.offline`

Exemplo: `order.completed` pode ser consumido por estoque, CRM, fidelidade, financeiro, analytics e notificações sem acoplar esses módulos ao endpoint de pedido.

## 11. Serviços de domínio previstos

`OrganizationService`, `StoreService`, `CatalogService`, `ProductService`, `ModifierService`, `CustomerService`, `CartService`, `PricingService`, `CheckoutService`, `OrderService`, `OrderStateMachine`, `PaymentService`, `PrintService`, `PrintQueueService`, `PrintRoutingService`, `PrintTemplateService`, `PrinterHealthService`, `DashboardService`, `AuditService`, `EventService`.

## 12. Segurança

Obrigatório:

- autenticação;
- RBAC server-side;
- isolamento multi-tenant no banco e aplicação;
- rate limiting;
- idempotência em checkout/pedidos/pagamentos/impressão;
- auditoria;
- armazenamento seguro de secrets;
- backups;
- proteção de webhooks;
- validação server-side;
- LGPD e retenção/anonimização quando aplicável.

## 13. UX

Princípios:

1. Operacional: poucos cliques.
2. Contextual: cada perfil vê somente o necessário.
3. Mobile-first real: não reduzir desktop mecanicamente.
4. Tempo real em pedidos, produção, mesas, caixa, entrega e conversas.
5. Estados claros de loading, erro, retry e sucesso.

## 14. Planos e feature flags

Estrutura preparada para `plans`, `features`, `plan_features`, `organization_subscriptions`.

Possível evolução:

- Essencial: cardápio, pedidos, PDV, clientes, caixa.
- Profissional: WhatsApp, salão, KDS, entregas, CRM, fidelidade.
- Gestão: estoque, compras, financeiro, fiscal, relatórios avançados.

## 15. Roadmap

### Fase 0 — Fundação
Auth, organizações, unidades, usuários, permissões, design system, banco, auditoria, eventos, observabilidade e segurança.

### Fase 1 — MVP comercial
Categorias, produtos, adicionais, cardápio digital, cliente/endereço, carrinho, pricing, checkout, pedidos, Kanban, impressão, produção simples, pagamentos, PDV e dashboard.

### Fase 2 — Operação
KDS avançado, caixa, entregas, taxas avançadas e impressão profissional expandida.

### Fase 3 — Salão
Mesas, comandas, garçom, QR e divisão de conta.

### Fase 4 — Crescimento
CRM, cashback, pontos, cupons, segmentação, campanhas e automações.

### Fase 5 — WhatsApp/IA
Inbox, bot, atendimento humano e IA com ferramentas autorizadas.

### Fase 6 — Gestão
Estoque, fichas técnicas, compras, fornecedores, financeiro e DRE.

### Fase 7 — Fiscal/integrações
Fiscal, gateways, marketplaces, logística e API pública.

### Fase 8 — Escala
Franquias, multiunidade avançada, central de compras, white-label, marketplace de integrações e BI.

## 16. Regra de ouro

O objetivo não é reproduzir telas de concorrentes. O produto deve possuir identidade própria e manter domínio integrado. Cada novo módulo deve se conectar por entidades e eventos, evitando duplicação de regras.
