# Opções finais do pedido

Issue lógica: **[302]**.

A interface exibe somente modalidades permitidas pelo cardápio público e formas de pagamento retornadas como habilitadas por `StorePaymentMethodService`. Dinheiro é a única forma que exibe campo de troco.

Antes da confirmação, a revisão resume recebimento e pagamento escolhidos e comunica três estados: pendente de revisão, ajustes necessários e pronto para confirmar. Esse resumo é apenas apresentação; `CheckoutService.review` continua revalidando operação da loja, carrinho, entrega, pagamento e troco antes de `createOrderFromCheckoutAction` poder criar o pedido.

Nenhum meio de pagamento, condição ou valor é criado pela UI. Se nenhum método estiver habilitado, o checkout informa indisponibilidade e não apresenta botão de salvar pagamento.
