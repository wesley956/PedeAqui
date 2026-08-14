# [310] Baseline de performance — banco e backend

Data: 2026-08-14  
Projeto oficial: `zsbsczjhiujnhdznrzck`

## Princípio

O advisor foi usado como **sinal**, não como lista automática de mudanças. Índice novo ou remoção de índice exige cardinalidade/uso/plano que justifique o custo de escrita e armazenamento.

Referências do advisor:
- FK sem índice: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- índice não usado: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Medição real do banco oficial

A leitura de `pg_stat_user_tables` mostrou que as tabelas críticas ainda estão praticamente sem dados de produção. Contagem exata no momento da homologação:

| Tabela | Linhas |
|---|---:|
| `orders` | 0 |
| `order_items` | 0 |
| `order_item_modifiers` | 0 |
| `products` | 0 |
| `categories` | 0 |
| `carts` | 0 |
| `checkout_sessions` | 0 |
| `print_jobs` | 0 |
| `tables` | 1 |
| `tabs` | 1 |

Os tamanhos das relações críticas estão entre aproximadamente 8 kB e 296 kB. Nessa escala, adicionar índices só para satisfazer `unindexed_foreign_keys` não produziria evidência de ganho e aumentaria custo de escrita/manutenção.

`pg_stat_user_indexes` também mostra que vários índices de fluxo já existentes têm uso real nos testes/homologação, por exemplo:

- `orders_org_store_checkout_fk_idx`: 251 scans;
- `orders_public_access_idx`: 246 scans;
- `cart_items_cart_idx`: 12 scans;
- `checkout_sessions_org_store_cart_idx`: 22 scans;
- `products_store_availability_idx`: 32 scans;
- `modifier_groups_store_sort_idx`: 36 scans;
- `production_stations_store_idx`: 47 scans;
- `print_jobs_queue_idx`: 15 scans.

Ao mesmo tempo, o advisor marca alguns índices existentes como “unused”. Como o banco ainda não possui carga representativa, **nenhum índice foi removido** nesta issue com base nesse sinal.

## `pg_stat_statements`

A extensão está habilitada, mas o histórico atual é dominado por migrations, introspecção do painel e fixtures de homologação. Não existe volume de consultas de restaurante suficiente para uma comparação estatística honesta de p95/p99 de Orders/PDV/KDS/Menu/Checkout.

Conclusão: nesta etapa, otimização de DDL seria especulativa. A mudança segura e mensurável está no caminho do backend que é executado repetidamente.

## Mudança aplicada — acompanhamento público do pedido

`PublicOrderService.get` alimenta a tela pública de acompanhamento, que faz refresh enquanto o pedido está em andamento.

### Antes

Fases dependentes de I/O de banco:

1. localizar loja;
2. ler pedido/autenticar token público;
3. ler itens;
4. ler adicionais.

Além disso, a montagem fazia `items.map(... modifiers.filter(...))`, custo aproximado `O(itens × adicionais)`.

### Depois

Fases dependentes de I/O:

1. localizar loja;
2. **pedido + itens em paralelo**;
3. adicionais dos itens autorizados.

Resultado estrutural: **4 → 3 fases de round-trip no caminho de polling (−25%)**, sem aumentar o número total de queries e sem alterar contrato de autorização. Os adicionais passam a ser agrupados uma única vez em `Map`, resultando em montagem `O(itens + adicionais)`.

O token público continua sendo validado no filtro do pedido. A consulta de itens usa o mesmo `organization_id`, `store_id` e `order_id`; caso o token seja inválido, o resultado é descartado e nenhum item é retornado ao cliente.

## Revisão dos demais caminhos críticos

### Orders

- `OrderService.list` já limita 1–250 registros e seleciona somente colunas da lista.
- `OrderService.get` já evita N+1 de adicionais com agrupamento por `Map` e resolve nomes de impressora/estação em lotes.

### KDS

`KitchenService.snapshot` já:

- carrega estações e pedidos em paralelo;
- limita 1–250 pedidos;
- carrega todos os itens por `IN(orderIds)`;
- carrega adicionais e rotas de produção em paralelo;
- agrupa tudo em memória com mapas, sem consulta por pedido/item.

### PDV

`PdvService.load` já paraleliza categorias, produtos, vínculos, grupos, adicionais, formas de pagamento, autorização de clientes, growth e cupons. Clientes têm limite 150. Não foi introduzida paginação nova que pudesse prejudicar busca operacional.

### Menu / Checkout

- cardápio público usa RPCs agregadores (`get_public_menu`, `get_public_product`), evitando N+1 HTTP do frontend;
- checkout mantém revalidação server-side e os limites do carrinho. Uma otimização mais agressiva de repricing em lote exige dados representativos antes de alterar o contrato.

## Decisão sobre índices

**0 índices adicionados e 0 removidos nesta issue.** Com 0 pedidos/produtos/carrinhos e apenas 1 mesa/comanda, não existe baseline representativo para justificar DDL. O advisor permanece registrado como backlog de medição para quando houver carga real.

Nova avaliação de índices deve ocorrer quando existir volume representativo, usando no mínimo:

- cardinalidade por tenant/loja;
- `pg_stat_statements` por consulta de aplicação;
- plano `EXPLAIN (ANALYZE, BUFFERS)` em staging/fixture de escala;
- impacto de escrita do índice;
- comparação antes/depois.
