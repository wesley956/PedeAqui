# Status — [047] a [057]

Branch: `agent/orders-047-057`

## Escopo implementado

- [047] `orders`
- [048] `order_items`
- [049] snapshots de adicionais
- [050] número amigável por unidade
- [051] state machines separadas
- [052] histórico de estados
- [053] `OrderService`
- [054] checkout → pedido
- [055] cancelamento
- [056] eventos de pedido
- [057] realtime interno

## Regra arquitetural V1.1

O PedeAqui não possui um mega-status de pedido.

Estados independentes:

- `order_status`: `pending_confirmation`, `confirmed`, `rejected`, `canceled`, `completed`
- `payment_status`: `pending`, `authorized`, `paid`, `failed`, `partially_refunded`, `refunded`
- `production_status`: `pending_confirmation`, `queued`, `preparing`, `ready`, `canceled`, `not_required`
- `fulfillment_status`: ciclo próprio de entrega/retirada/serviço.

Um pedido novo inicia em:

- order: `pending_confirmation`
- payment: `pending`
- production: `pending_confirmation`
- fulfillment: `pending`

Produção não entra em `queued` antes da confirmação do pedido.

## Criação transacional

`create_order_from_checkout_internal` converte um checkout revisado em pedido dentro de uma única transação:

1. bloqueia o carrinho;
2. detecta pedido já criado para o mesmo carrinho;
3. valida checkout e itens;
4. cria ou reaproveita cliente por telefone normalizado;
5. incrementa `order_sequences` atomicamente;
6. cria `orders`;
7. copia itens e adicionais como snapshots;
8. cria quatro entradas iniciais de histórico;
9. grava `order.created` no outbox `domain_events`;
10. converte o carrinho para `converted`.

Não é usado `max()+1` para o número amigável.

## Idempotência e acompanhamento público

- `source_cart_id` e `checkout_session_id` são únicos em `orders`.
- retry usando o mesmo carrinho retorna o pedido existente.
- o acesso público ao pedido possui token próprio, derivado deterministicamente do segredo aleatório do carrinho e armazenado somente como SHA-256 no banco.
- após criação, o cookie de carrinho é encerrado e um cookie HttpOnly exclusivo do pedido é emitido.
- isso permite iniciar outro carrinho na mesma loja sem perder o acompanhamento de pedidos anteriores.

## Snapshots

Pedido, item e adicional preservam nomes, valores, endereço, pagamento, troco e taxa existentes no instante da compra. Alterar o catálogo posteriormente não reescreve o histórico do pedido.

## Transições e cancelamento

A função `order_transition_internal` é a última barreira transacional de estado.

Regras importantes:

- produção só entra na fila após `order_status=confirmed`;
- retirada/saída operacional depende de pedido confirmado e, quando aplicável, produção pronta;
- conclusão exige fulfillment concluído e pagamento `paid`;
- pedido já entregue/retirado/servido não pode ser cancelado;
- cancelar ou rejeitar o pedido cancela produção e fulfillment na mesma transação;
- pagamento permanece independente: se já estava pago, refund deve ser explícito.

Toda transição gera histórico append-only e evento de domínio.

## Realtime

`orders` e `order_state_history` fazem parte da publication `supabase_realtime`.

A tela interna `/pedidos` usa sessão autenticada + RLS e atualiza com Postgres Changes filtrado pela unidade. O cliente público não recebe `SELECT` anônimo em `orders`; a página `/m/[slug]/pedido/[id]` atualiza por refresh server-side usando o cookie HttpOnly do pedido.

## UI

- checkout revisado → `Confirmar pedido`;
- `/m/[slug]/pedido/[id]` — acompanhamento público;
- `/pedidos` — lista operacional básica em realtime;
- `/pedidos/[id]` — detalhe, estados, ações e histórico.

O Kanban completo continua reservado para [083].

## Segurança

- RLS ativo em `orders`, `order_items`, `order_item_modifiers`, `order_state_history` e `order_sequences`;
- `anon` sem leitura direta de pedidos;
- `authenticated` possui somente SELECT sujeito a `orders.view` + RLS;
- RPCs de criação e transição são executáveis somente por `service_role`;
- Security Advisor deve permanecer sem alertas após as migrations deste bloco.

## Performance

Foram criados índices para consultas operacionais e todas as FKs novas do motor de pedidos. Avisos `unused_index` são esperados enquanto o banco não possui tráfego operacional.
