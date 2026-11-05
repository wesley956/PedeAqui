# API externa de rota por endereço — preparação em homologação

## Estado atual verificado em main
- `DeliveryQuoteService.quote` consulta `store_delivery_settings` e `delivery_neighborhoods` apenas por `district/city/state`.
- `quote-calculator.ts` aceita `default` e `neighborhood`; não existe modo persistido `distance`.
- `CheckoutService.saveAddress` já recebe rua, número, bairro, cidade, UF e CEP, mas repassa só bairro/cidade/UF à cotação.
- `CheckoutService.useRecognizedAddress` e o fechamento/finalização também precisam respeitar qualquer nova cotação.
- Jack Cones: 121 destinos, `fee_mode=neighborhood`, origem Ampelio Gazzetta 2242, Bela Vista, Nova Odessa/SP; coordenadas de origem ainda nulas.

## Conteúdo desta PR
1. `distance-pricing.ts`: regra pura de R$4 até 1 km + R$1 por quilômetro adicional, arredondamento para cima.
2. `geoapify-distance-provider.ts`: adaptador server-side com geocodificação restrita ao Brasil, timeout e roteamento carro. Falhas explícitas, sem preço inventado.
3. Testes da fórmula e dos limites. Nenhuma alteração de banco, checkout, configuração de loja ou deploy.

## Bloqueadores antes de ativar — obrigatórios
- [ ] Confirmar coordenadas da porta da loja (não inferir do bairro), validando via mapa.
- [ ] Criar preferência de cotação por organização/loja **desligada por padrão**, com migração, RLS e auditoria; primeiro liberar apenas no Jack em homologação.
- [ ] Implementar cache **persistente** com hash da localização normalizada, TTL definido e retenção mínima de dados pessoais.
- [ ] Implementar limite **global e atômico** por loja/dia (não por processo Node) para créditos/API; rate limit por cliente e proteção contra abuso.
- [ ] Validar resultado de geocodificação por rua/número, cidade/UF e qualidade. Resultado ambiguo -> sem cotação automática.
- [ ] Incluir limites de raio, endereço não atendido e falha explícita, sem converter falha em frete R$0 ou taxa arbitrária.
- [ ] Na confirmação/finalização, revalidar cotação e mostrar mudanças ao cliente antes de cobrança; não confiar em taxas enviadas pelo navegador.
- [ ] Cobrir endereço salvo, múltiplos checkouts, carrinho, frete grátis, pedidos pagos por Pix, retries, cobrança impressa e isolamento multiempresa.
- [ ] Adicionar segredo `GEOAPIFY_API_KEY` **somente no servidor**, após providenciar chave e configurar cotas junto ao fornecedor.
- [ ] Homologar cenários de 1,0 km, 1,01 km, indisponibilidade API, CEP inválido e alteração de endereço. Executar CI e teste real com autorização antes de produção.

## Rollout e rollback
Produção **inalterada** até concluir os bloqueadores. Ativação futura só por loja com flag configurada. Rollback desliga a flag e retorna ao modo por bairro, sem apagar os 121 destinos. Nunca ativar globalmente.

## Provider
Geoapify: `GET /v1/geocode/search` e `GET /v1/routing?mode=drive&format=json`. Créditos, limites e política de retenção devem ser revistos antes de ativar. Não chamar a API durante renderização sem rate limit.
