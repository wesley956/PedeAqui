# Centro de entregas — interface operacional

A rota `/entregas` organiza as entregas abertas em filas de decisão:

- **Atrasadas**: somente quando `deliveries.promised_by_at` existe e já passou;
- **Aguardando expedição**: `pending` ou `awaiting_assignment`;
- **Com entregador**: `assigned`;
- **Retiradas**: `picked_up`;
- **Em rota**: `out_for_delivery`;
- entregas concluídas ficam em uma seção secundária de recentes.

O prazo não é inventado pela interface. A contagem e o estado de atraso usam exclusivamente `promised_by_at`, já gravado pelo fluxo de entrega. Quando esse valor não existe, a UI informa `Sem prazo calculado`. A estimativa min/max do pedido é mostrada separadamente e não é usada para criar um SLA artificial.

Cada card mantém endereço, referência, telefone, frete gravado, entregador atual e a próxima ação permitida pelo fluxo existente. As ações continuam passando por `DeliveryOperationForm` e pelos RPCs/autorizações atuais.

Cadastro e manutenção de entregadores ficam em `/configuracoes/entregadores`, protegidos por `delivery.manage`. A fila operacional continua protegida por `delivery.assign`; a visão do entregador continua separada.

`DeliveryRealtime` permanece ativo e o agrupamento de atraso é reavaliado no cliente a cada 30 segundos, mesmo sem uma nova alteração de banco.
