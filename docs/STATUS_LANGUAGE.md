# PedeAqui — Linguagem de status operacional

> Origem: issue **[267]**. Esta camada é exclusivamente de apresentação e não altera state machines, transições, permissões ou regras de domínio.

## Regra principal

Status nunca pode ser comunicado somente por cor. A representação oficial combina **texto visível + símbolo + tom semântico**. O componente canônico é `StatusBadge`, em `src/components/ui/status.tsx`.

## Tons semânticos

- `neutral`: estado aguardando, encerrado sem sucesso/erro ou informação sem urgência.
- `info`: progresso normal ou mudança em andamento.
- `success`: estado concluído/saudável.
- `warning`: atenção necessária, ainda recuperável sem falha crítica.
- `danger`: falha, cancelamento, atraso crítico ou indisponibilidade.

Os tons usam os tokens de [259]; módulos não escolhem hexadecimais próprios.

## Pedidos

| Chave de apresentação | Texto | Símbolo | Tom |
|---|---|---|---|
| `order_new` | Novo | ● | info |
| `order_confirmed` | Confirmado | ✓ | info |
| `order_preparing` | Em preparo | … | warning |
| `order_ready` | Pronto | ✓ | success |
| `order_out_for_delivery` | Saiu para entrega | → | info |
| `order_completed` | Concluído | ✓ | success |
| `order_cancelled` | Cancelado | × | danger |
| `order_late` | Atrasado | ! | danger |

## Pagamentos

`payment_pending`, `payment_paid`, `payment_failed`, `payment_refunded` e `payment_partial_refund` apresentam respectivamente pagamento pendente, pago, falha, estorno e estorno parcial.

## Entregas

`delivery_waiting`, `delivery_assigned`, `delivery_picked_up`, `delivery_in_route`, `delivery_delivered`, `delivery_late` e `delivery_cancelled` cobrem a linguagem operacional da fila até a conclusão.

## Caixa

`cash_open`, `cash_closed` e `cash_attention` separam estado operacional do caixa de qualquer cálculo financeiro. Esta camada não decide se um fechamento está correto; apenas apresenta o estado fornecido pelo domínio.

## Estoque

`inventory_ok`, `inventory_low`, `inventory_critical` e `inventory_out` comunicam normal, baixo, crítico e sem estoque. Os limites continuam sendo calculados pelo domínio de estoque.

## Estados genéricos

Para módulos sem vocabulário especializado existem `generic_pending`, `generic_active`, `generic_in_progress`, `generic_attention`, `generic_success` e `generic_error`.

## Integração com status reais do backend

As chaves acima são **chaves de apresentação**, não novos enums de banco. Cada módulo deve traduzir seu status autoritativo existente para a chave visual correspondente. Não renomeie valores persistidos só para atender esta camada.

## Badge genérico

`Badge` continua existindo para rótulos genéricos que não representam estado operacional. Ele não deve ser usado para pedidos, pagamentos, entregas, caixa ou estoque; nesses casos use `StatusBadge` ou, para casos muito específicos, `SemanticStatus` com texto e símbolo explícitos.

## Acessibilidade

O símbolo é decorativo para leitor de tela (`aria-hidden`), porque o texto visível/`aria-label` já contém a informação. Em modo de cores forçadas, a borda continua perceptível. Nenhum significado depende exclusivamente do tom visual.
