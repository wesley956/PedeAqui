# [317] E2E das jornadas por contexto

Data: 2026-08-14

## Estratégia

A suíte roda no CI com `npm run test:e2e` e não utiliza credenciais ou dados do Supabase oficial. Os fixtures são inteiramente em memória e usam IDs distintos de unidade, portanto a execução é reproduzível e deixa **zero resíduo no banco**.

Essa decisão é intencional: o CI usa placeholders de Supabase e não deve criar contas, pedidos ou clientes reais para obter um “E2E” artificial. A consistência/segurança do banco oficial é homologada separadamente em [318] por consultas somente leitura.

## Jornadas cobertas

### Cliente público

1. cardápio público carrega `MenuBrowser`;
2. produto adiciona pelo `addToCartAction`;
3. carrinho segue para checkout;
4. checkout cria o pedido pela action autoritativa;
5. acompanhamento usa `PublicOrderService`.

O teste também valida checkout completo tanto para **delivery** com cotação válida quanto para **pickup** sem endereço.

### Pedido delivery

Máquinas de estado percorrem a sequência válida:

`pending_confirmation → confirmed`  
`pending_confirmation → queued → preparing → ready`  
`pending → awaiting_assignment → assigned → picked_up → out_for_delivery → delivered`  
`confirmed → completed`

### Pedido retirada

`pending → awaiting_pickup → picked_up_by_customer`

### Operação

- Pedidos: `OrderService.list` → `OrderManagerBoard`;
- Salão: `DiningService.overview` → `TableOverview`;
- Produção: `KitchenService.snapshot` → `KitchenBoard`;
- Entregas: `DeliveryOperationsService.loadOperations` → `DeliveryBoard`.

### Contextos de usuário

A suíte confirma que gestão, caixa, salão, cozinha e entrega obtêm seus destinos operacionais a partir de permissões reais, sem misturar superfícies por contexto.

## Isolamento e limpeza

Os cenários usam fixtures `storeA` e `storeB` distintas apenas em memória. Não existe conexão de escrita com Supabase na suíte; portanto não há cleanup remoto, rollback fictício nem dado temporário persistido. Falha é reproduzível localmente com:

```bash
npm run test:e2e
```

## CI

O workflow possui uma etapa própria **E2E context journeys** depois dos testes unitários/integrados e antes do Print Agent/build. Isso torna a falha identificável sem misturar o resultado com o restante da suíte.
