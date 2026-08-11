# Produção / KDS — status [092]–[095]

Branch: `agent/kds-092-095`

## Escopo implementado

- [092] painel de produção em `/producao`;
- [093] filtro por `production_stations` existentes;
- [094] tempo decorrido de produção atualizado no cliente;
- [095] destaque visual de atenção e atraso.

Issues GitHub: #103–#106.

## Fonte de verdade

O KDS não cria uma tabela própria de pedidos nem um novo status.

Ele projeta:

- `orders`;
- `order_items`;
- `order_item_modifiers`;
- `production_stations`;
- `product_production_stations`.

O pedido continua usando os quatro estados independentes do motor existente. O KDS lê apenas pedidos `order_status=confirmed` cujo `production_status` ainda está em `pending_confirmation`, `queued`, `preparing` ou `ready`.

## Estações

Somente estações ativas com `kind=production` entram nos filtros do KDS.

Na visão **Todas**:

- todos os itens do pedido aparecem;
- o item mostra suas estações roteadas;
- produto sem roteamento permanece visível com o marcador `Sem estação`.

Ao selecionar uma estação, o painel mantém somente os itens cujo `product_id` está ligado à estação em `product_production_stations`. Um mesmo produto pode aparecer em mais de uma estação quando possui múltiplos vínculos.

## Tempo e atraso

O relógio usa timestamp autoritativo do servidor:

1. `confirmed_at`, quando presente;
2. `created_at`, como fallback.

O navegador apenas recalcula a apresentação a cada 15 segundos; não existe escrita periódica no banco.

Limiares iniciais do MVP:

- abaixo de 12 min: normal;
- 12–19 min: atenção;
- 20 min ou mais: atrasado.

Esses limiares são regra de apresentação em `kitchen-model.ts`, não um status persistido.

## Realtime

O KDS reutiliza `orders` na publication `supabase_realtime` e Postgres Changes filtrado por `store_id`. INSERT/UPDATE do pedido provocam `router.refresh()` e o snapshot server-side é reconstruído com autorização e escopo de organização/unidade.

## Segurança

- leitura do KDS exige `orders.view` via `authorize()`;
- consultas administrativas server-side sempre recebem `organization_id` + `store_id` explícitos;
- `service_role` não é exposta ao navegador;
- nenhuma nova tabela, RPC, grant ou policy foi necessária neste bloco.

## Limite arquitetural intencional

O `production_status` atual é global do pedido. Portanto este bloco **não adiciona um botão de “pronto” por estação**: em um pedido dividido entre chapa e fritura, uma estação não pode marcar o pedido inteiro como pronto enquanto a outra ainda trabalha.

O KDS atual é leitura/monitoramento por estação e direciona para o detalhe do pedido quando necessário. Uma futura evolução com conclusão independente por estação deve introduzir uma entidade explícita de progresso por `order + station`, com agregação transacional para o `production_status` global; não deve ser simulada apenas na UI.

## Validação esperada

CI deve cobrir lint, TypeScript, testes, Print Agent check e build. Testes do bloco validam filtro por estação, relógio e limiares de atraso.

## Próximo bloco

[096]–[101] — Pagamentos.
