# PDV — funções avançadas

O caminho principal do PDV continua sendo selecionar produtos → conferir carrinho → escolher pagamento → finalizar.

Cliente e benefícios (cupom, cashback e pontos) agora ficam em um segundo nível nativo com `<details>`. O conteúdo não é desmontado ao fechar a área, portanto os estados React permanecem preservados durante a venda.

Nenhuma capacidade foi removida. Busca/cadastro manual de cliente, seleção de cliente existente, cupons, cashback, fidelidade, pagamento dividido, dinheiro/troco e referência de pagamento continuam disponíveis e usam exatamente a mesma montagem de payload e `createPdvSaleAction`.

O painel secundário é acessível por teclado, recebe foco visível e adota 48 px em dispositivos touch. Pagamento e finalização permanecem fora dele por serem parte do fluxo obrigatório da venda.
