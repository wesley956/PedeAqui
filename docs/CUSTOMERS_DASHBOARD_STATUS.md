# Clientes e Dashboard — status #111–#115

Branch: `agent/customers-dashboard-111-115`  
Base: `agent/pdv-102-110`

## Issues oficiais

- [111] `#125` — Lista de clientes.
- [112] `#126` — Perfil do cliente.
- [113] `#127` — Indicadores principais.
- [114] `#128` — Vendas por hora.
- [115] `#129` — Produtos mais vendidos.

## Decisões do bloco

### Clientes são organizacionais

O cadastro de clientes continua pertencendo à organização, não a uma unidade específica. Isso permite que o mesmo cliente compre por cardápio, PDV e múltiplas unidades sem gerar cadastros paralelos.

### Histórico operacional respeita RLS de pedidos

O perfil do cliente é autorizado por `customers.view`, mas o histórico de pedidos é consultado com o cliente autenticado do Supabase. A RLS de `orders` continua decidindo quais unidades podem aparecer. `service_role` não é usado para ampliar a visibilidade do histórico.

### Métricas do cliente são cache derivado

`orders_count`, `total_spent_cents`, `average_ticket_cents` e `last_order_at` passam a ser atualizados quando `order_status` entra em `completed`. O trigger roda na mesma transação da State Machine e só processa a primeira entrada em `completed`.

A migration executa backfill determinístico para alinhar clientes existentes ao histórico concluído.

### Dashboard usa pedido concluído como venda

Os indicadores de vendas usam `orders.order_status = 'completed'`. Isso mantém o Dashboard consistente com as jornadas críticas: o pedido só entra como venda consolidada após pagamento e fulfillment concluídos.

O valor exibido é receita bruta do pedido (`total_cents`). Refunds líquidos poderão ser tratados posteriormente no módulo financeiro sem reescrever a definição operacional deste Dashboard.

### Timezone da unidade é autoridade

O dia atual e o agrupamento por hora são calculados no PostgreSQL com `stores.timezone`. O navegador não decide em qual dia/hora a venda pertence.

## Backend

Migration: `supabase/sql/31_customers_dashboard.sql`  
Supabase oficial: `customers_dashboard_111_115` aplicada.

Inclui:

- índice parcial `orders_store_completed_idx`;
- trigger `orders_customer_metrics_after_completion`;
- função privada `private.apply_completed_order_customer_metrics()`;
- backfill de métricas de clientes;
- RPC `dashboard_snapshot_internal(store, now)`;
- RPC revogada de `PUBLIC`, `anon` e `authenticated`, disponível somente para `service_role`.

## CustomerService

- busca por nome, telefone normalizado e e-mail;
- ordenação por atividade, gasto, número de pedidos ou nome;
- limite operacional de 150 resultados;
- perfil consolidado com métricas, endereços e últimos 20 pedidos visíveis;
- pedidos do perfil são lidos com RLS do usuário autenticado.

## DashboardService

Autoriza `dashboard.view` na unidade ativa e chama a RPC interna com `service_role` somente após autorização.

Snapshot retornado:

- vendas concluídas do dia;
- receita bruta do dia;
- ticket médio;
- pedidos abertos;
- clientes identificados atendidos;
- vendas/pedidos do dia anterior;
- série completa de 24 horas;
- top 8 produtos por quantidade, com receita.

## UI

### `/clientes`

- cadastro manual preservado;
- busca por nome, telefone ou e-mail;
- ordenação operacional;
- pedidos, total gasto, ticket médio e última compra em cada linha;
- layout responsivo.

### `/clientes/[id]`

- métricas do relacionamento;
- dados cadastrais;
- endereços e definição do principal;
- histórico recente de pedidos respeitando RLS;
- atalho para o detalhe do pedido quando permitido.

### `/dashboard`

- cinco indicadores reais;
- comparação de vendas/pedidos com ontem;
- gráfico de vendas por hora sem dependência de biblioteca externa;
- ranking de produtos mais vendidos;
- timezone/data local explícitos;
- layout responsivo.

## Validação PostgreSQL

Teste transacional com rollback criou uma organização/unidade/cliente e dois pedidos temporários.

Resultado validado:

- pedido concluído: R$ 10,00;
- cliente: 1 pedido, total R$ 10,00, ticket R$ 10,00;
- Dashboard: 1 venda concluída, R$ 10,00, 1 cliente identificado e 1 pedido aberto;
- venda corretamente agrupada em 00h de `America/Sao_Paulo`;
- top produto: 2 unidades de `X-Burger Teste`, R$ 10,00;
- verificação pós-rollback: zero organização, loja, cliente ou pedidos de teste remanescentes.

Security Advisor após a migration: 0 alertas.

## Limitações conscientes

- Dashboard é o snapshot operacional do dia; períodos customizados pertencem a relatórios posteriores.
- Clientes não identificados não entram no indicador `Clientes atendidos`.
- Histórico do perfil mostra no máximo 20 pedidos e apenas unidades autorizadas por RLS.
- Receita do Dashboard é bruta; tratamento financeiro líquido de refunds será responsabilidade do financeiro/relatórios.
