# Entregador — visão mobile

A rota `/entregador` continua baseada em `DeliveryOperationsService.loadDriverView()`. Essa leitura exige `delivery.view`, resolve o cadastro de entregador pelo `user_id` autenticado e filtra entregas pela unidade ativa e pelo `driver_id` correspondente.

A interface mostra somente entregas ativas atribuídas ao próprio entregador. Para cada entrega aparecem:

- número do pedido e cliente;
- estado atual;
- prazo gravado em `promised_by_at` quando existir;
- destino e referência;
- telefone necessário para contato;
- atalho para abrir o endereço no mapa;
- exatamente a próxima transição aplicável: confirmar retirada, iniciar rota ou confirmar entrega.

Dados financeiros, frete, total do pedido e detalhes administrativos não são apresentados nessa visão.

O realtime agora pode expor seu estado de conexão. Em falha ou timeout a UI informa que a atualização ao vivo não está disponível e mantém um botão explícito para atualizar a lista. Erros das actions continuam aparecendo no próprio formulário.

Ações principais têm no mínimo 56 px e 60 px em contexto touch/mobile. Nenhum RBAC, vínculo de entregador, isolamento de unidade ou RPC de transição foi alterado.
