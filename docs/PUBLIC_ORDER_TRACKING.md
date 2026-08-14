# Acompanhamento público do pedido

Issue lógica: **[303]**.

A timeline é derivada somente dos quatro estados já persistidos no pedido: `order_status`, `production_status`, `fulfillment_status` e `fulfillment_type`. A interface não cria status intermediários no banco.

Para entrega, a jornada visual usa recebido → confirmado → preparo → pronto → saiu para entrega → entregue. “Saiu para entrega” só é alcançado quando `fulfillment_status` é `out_for_delivery` ou `delivered`. Para retirada, as etapas exclusivas de entrega são removidas e a conclusão acontece em `picked_up_by_customer`. Se produção for explicitamente `not_required`, preparo e pronto também são removidos.

A página mostra número, última atualização, pagamento, produção, fulfillment, itens e resumo. Enquanto o pedido não é terminal, `PublicOrderRefresh` continua usando `router.refresh`, mas suspende polling em aba oculta e atualiza ao voltar/focar, evitando recargas desnecessárias.

Cancelamento ou rejeição continuam sendo comunicados pelo estado autoritativo e pelo motivo já salvo no pedido.
