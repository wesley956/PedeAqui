# Status — [033] a [035]

Branch: `agent/delivery-033-035`

## Escopo

- [033] Endereços de clientes — GitHub #36
- [034] Configuração básica de entrega — GitHub #37
- [035] Taxa por bairro — GitHub #38

## Banco real

Aplicado ao Supabase oficial `zsbsczjhiujnhdznrzck`:

- `customer_addresses`;
- `store_delivery_settings`;
- `delivery_neighborhoods`;
- permissões `delivery.view` e `delivery.manage`;
- backfill das permissões para funções `owner` e `manager` existentes;
- integridade composta cliente ↔ organização;
- índice parcial garantindo no máximo um endereço principal ativo por cliente;
- trigger para trocar o endereço principal atomicamente;
- índices de cotação e FKs de maior crescimento;
- resumo público de entrega incorporado à RPC `get_public_menu`.

## Endereços

Endereços pertencem ao cliente/organização, não à loja. Isso permite que o mesmo cliente use seus endereços em diferentes unidades da mesma empresa sem duplicação.

Campos atuais:

- identificação;
- destinatário/telefone opcionais;
- CEP;
- rua/número/complemento;
- bairro/cidade/UF;
- referência;
- latitude/longitude preparadas para geocodificação futura;
- endereço principal;
- soft delete e auditoria.

## Entrega

Configuração por unidade:

- ativar/desativar entrega;
- taxa padrão ou taxa por bairro;
- frete grátis acima de um valor;
- prazo mínimo/máximo;
- distância máxima preparada para evolução por raio;
- opção de exigir bairro explicitamente atendido.

## Bairro e cotação

Cada bairro possui:

- nome/cidade/UF normalizados para chave estável;
- taxa em centavos;
- pedido mínimo opcional;
- minutos adicionais ao prazo padrão;
- status ativo/pausado;
- soft delete.

`DeliveryService.quoteByNeighborhood()` já está preparado para o checkout e retorna:

- bairro não atendido;
- entrega desativada;
- pedido mínimo não atingido;
- taxa final, inclusive frete grátis;
- ETA final com adicional do bairro.

## Cardápio público

A RPC pública continua sem liberar SELECT anônimo nas tabelas internas. Ela agora inclui apenas um resumo seguro:

- entrega ativa;
- taxa inicial;
- prazo estimado;
- regra de frete grátis.

A lista completa de bairros permanece protegida no backend nesta fase.

## Segurança e performance

Após as migrations deste bloco, o **Supabase Security Advisor retornou zero alertas**.

O Performance Advisor permanece apenas com avisos informativos de FKs/índices e índices ainda não utilizados em um banco novo. Os FKs novos com maior potencial de crescimento receberam índices de cobertura; não foram criados índices indiscriminadamente para cada aviso.

## Próximo bloco

[036] Carrinhos → [040] validação de alterações de preço e `PricingService`.
