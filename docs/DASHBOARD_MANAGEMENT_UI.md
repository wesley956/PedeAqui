# Dashboard de gestão — fontes e leitura dos indicadores

A rota `/dashboard` é uma visão gerencial da **unidade ativa**. Ela não estima números quando a fonte não responde: uma falha de leitura abre o estado de erro e exige nova tentativa.

## Indicadores principais

| Indicador | Fonte autoritativa | Regra exibida |
| --- | --- | --- |
| Vendas hoje | `dashboard_snapshot_internal.sales_cents` | Soma de pedidos `completed` no dia local da unidade |
| Pedidos concluídos | `dashboard_snapshot_internal.sales_count` | Quantidade de pedidos `completed` no mesmo dia local |
| Ticket médio | `dashboard_snapshot_internal.average_ticket_cents` | Receita concluída / pedidos concluídos, conforme snapshot |
| Pedidos abertos | `dashboard_snapshot_internal.open_orders` | Pedidos ainda pendentes/confirmados conforme RPC canônica |
| Comparação com ontem | `previous_sales_cents` e `previous_sales_count` | Somente vendas e quantidade recebem comparação porque a RPC já fornece o período anterior equivalente |
| Cancelamentos | `order_state_history` | Transições do domínio `order` para `canceled` ou `rejected`, recortadas pelo `local_date` e `timezone` do snapshot |
| Entregas atrasadas | `deliveries.promised_by_at` + estado do pedido | `promised_by_at < generated_at`, ainda não entregue, pedido `confirmed` e fulfillment ainda aberto |
| Caixas abertos | `cash_sessions` | Sessões da unidade com `status = open` |
| Estoque crítico | `inventory_item_stores` + `inventory_balances` | Saldo atual menor ou igual a `minimum_quantity`, mesma definição usada em `/estoque` |
| Vendas por hora | `dashboard_snapshot_internal.hourly` | Pedidos concluídos agrupados pela hora local |
| Produtos mais vendidos | `dashboard_snapshot_internal.top_products` | Ranking dos itens de pedidos concluídos do dia |

## Período e fuso

O snapshot canônico resolve o `timezone`, `local_date` e `generated_at` da unidade. As consultas suplementares usam esses valores para não misturar UTC com o dia operacional mostrado na tela.

Cancelamentos buscam uma janela limitada de 48 horas e depois são classificados no dia local do snapshot. Entregas atrasadas usam o instante `generated_at` do mesmo snapshot como referência, evitando relógios diferentes dentro da mesma renderização.

## Comparações

Somente vendas e quantidade de pedidos exibem comparação percentual com o dia anterior porque a fonte canônica já entrega `previous_sales_cents` e `previous_sales_count` para um período equivalente. Não são inventadas comparações anteriores de cancelamento, atraso, caixa ou estoque.

## Reconciliação com os módulos-fonte

- **Pedidos:** cancelamento vem da trilha `order_state_history`, a mesma trilha usada no detalhe do pedido.
- **Entregas:** atraso segue a regra operacional da tela de Entregas: prazo efetivamente gravado em `promised_by_at`, nunca uma estimativa criada no dashboard.
- **Caixa:** o indicador conta sessões realmente abertas; o ledger e os saldos continuam pertencendo ao módulo Caixa.
- **Estoque:** crítico usa exatamente `balance.quantity <= minimum_quantity`, sem criar um novo limiar gerencial.

A seção `Atenção operacional` leva o gestor de volta a `/pedidos`, `/entregas`, `/caixa` e `/estoque` para investigar e agir na fonte.

## Estados de interface

Sem vendas concluídas, gráfico e ranking usam estados vazios claros. Se qualquer leitura necessária ao snapshot gerencial falhar, a rota mostra `Não foi possível carregar o dashboard` e não substitui o dado ausente por zero estimado ou valor fictício.

Nenhuma regra de pedido, entrega, caixa, estoque, RLS ou permissão foi alterada nesta etapa.
