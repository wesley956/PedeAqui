# API externa de rota por endereço — preparação em homologação

## Estado atual verificado em main
- `DeliveryQuoteService.quote` consulta `store_delivery_settings` e `delivery_neighborhoods` apenas por `district/city/state`.
- `quote-calculator.ts` aceita `default` e `neighborhood`; não existe modo persistido `distance`.
- `CheckoutService.saveAddress` já recebe rua, número, bairro, cidade, UF e CEP, mas repassa só bairro/cidade/UF à cotação.
- `CheckoutService.useRecognizedAddress` e o fechamento/finalização também precisam respeitar qualquer nova cotação.
- Jack Cones: 121 destinos, `fee_mode=neighborhood`, origem Ampelio Gazzetta 2242, Bela Vista, Nova Odessa/SP; coordenadas da entrada confirmadas em mapa: latitude -22.788276, longitude -47.298420.

## Piloto no checkout digital

Aplicar a migração de cache e orçamento somente ao banco isolado antes da homologação.
O checkout permanece por bairro enquanto GEOAPIFY_PILOT_STORE_ID estiver ausente.
No ambiente isolado, definir o UUID da loja de teste, as coordenadas em
GEOAPIFY_PILOT_ORIGIN_LATITUDE e GEOAPIFY_PILOT_ORIGIN_LONGITUDE e carregar
GEOAPIFY_API_KEY pelo arquivo de segredo do servidor. O UUID deve pertencer ao
cadastro da loja de teste no banco isolado.

A cotação mantém a cobertura por bairro, pedido mínimo, isenção e estimativa já
configurados. A distância substitui o preço base. A rota é armazenada por 24 horas
com uma chave HMAC que inclui loja, origem e endereço normalizado. O orçamento
global da instalação reserva até 200 tentativas por dia UTC, com até duas
requisições ao provedor por tentativa. O limite do projeto no provedor deve ser
configurado separadamente e compartilhamento da mesma chave entre instalações
precisa entrar no cálculo de consumo.

## Validação antes de liberar

- Rota de referência de 2.416 m com taxa de R$ 6,00 e confirmação pelo checkout.
- Endereço salvo, número divergente, zona não atendida e provedor indisponível.
- Mudança de endereço ou valor antes do pagamento e confirmação em duas abas.
- Limites de 1,0 km e 1,01 km, cache, esgotamento do orçamento e isolamento por loja.
- Checkout Pix e recuperação de pedido existente.
- Confirmar raio operacional do Jack e aplicar limite específico antes de liberar.
- Validar cotas do plano e proteção contra abuso antes de expor o piloto ao público.

## Rollout e rollback
Produção **inalterada** até concluir os bloqueadores. Ativação futura só por loja com flag configurada. Rollback desliga a flag e retorna ao modo por bairro, sem apagar os 121 destinos. Nunca ativar globalmente.

## Provider
Geoapify: `GET /v1/geocode/search` e `GET /v1/routing?mode=drive&format=json`. Créditos, limites e política de retenção devem ser revistos antes de ativar. Não chamar a API durante renderização sem rate limit.
