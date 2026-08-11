# Pagamentos — status [096]–[101]

Branch: `agent/payments-096-101`

## Escopo implementado

- [096] `payments` como ledger persistente por pedido;
- [097] `PaymentService` server-side;
- [098] dinheiro com valor recebido e troco calculado em centavos;
- [099] Pix manual com confirmação operacional e referência opcional;
- [100] cartão presencial (crédito/débito) sem armazenar PAN/CVV;
- [101] estrutura preparada para múltiplas linhas de pagamento por pedido.

Issues GitHub: #108–#113.

## Regra arquitetural

`orders.payment_status` continua sendo o resumo usado pela State Machine, mas deixa de ser a fonte operacional da confirmação. A fonte de verdade financeira é `payments`.

Fluxo:

`checkout/order` → intenção `payments.pending` → confirmação manual → `payments.paid` → soma paga → `orders.payment_status=paid` somente quando a soma paga cobre exatamente o total do pedido.

Pagamento parcial não marca o pedido como pago.

## Segurança

- RLS ativo em `payments`;
- `anon` sem acesso;
- `authenticated` apenas SELECT sujeito a `payments.view`;
- INSERT/UPDATE/DELETE somente `service_role`;
- RPCs `payment_create_intent_internal`, `payment_confirm_internal` e `payment_fail_internal` somente `service_role`;
- Owner/Manager receberam `payments.view` e `payments.manage`;
- Security Advisor: zero alertas após a migration.

## Integridade financeira

- valores inteiros em centavos;
- intenção deve ser positiva;
- soma de `pending + authorized + paid` não pode exceder o total do pedido;
- soma `paid` acima do total aborta a transação;
- chave de idempotência única por organização;
- pedido cancelado/rejeitado não aceita nova confirmação;
- confirmação repetida de pagamento já pago é idempotente;
- dinheiro valida valor recebido >= valor da linha;
- troco = recebido - valor, calculado no banco;
- Pix/cartão nunca recebem campo de dinheiro;
- cartão presencial guarda apenas método e referência textual opcional, nunca dados sensíveis.

## Criação automática

O trigger `orders_seed_payment_intent` cria a intenção inicial a partir de `payment_method_snapshot` e `total_cents` do pedido. Para dinheiro, `cash_change_for_cents` do checkout é preservado como valor esperado para troco, mas a operação pode informar o valor efetivamente recebido ao confirmar.

## Split preparado

O schema permite múltiplas linhas por pedido. `PaymentService.createIntent()` e `payment_create_intent_internal` aplicam o limite do total. A UI completa de split fica para a evolução do PDV, mas o domínio financeiro não precisará ser redesenhado.

## UI operacional

No detalhe `/pedidos/[id]`, usuários com `payments.view` veem:

- método/status/valor de cada linha;
- total pago e saldo restante;
- referência manual;
- valor recebido e troco em dinheiro;
- confirmação individual;
- marcação de tentativa como falha.

Usuários sem permissão financeira continuam acessando o pedido sem o painel do ledger.

## Validação

O banco oficial ainda não possui usuários/pedidos reais. Portanto o bloco é validado por schema, grants, advisors, testes puros e CI. O primeiro ambiente operacional deve executar o E2E real de dinheiro, Pix e cartão presencial.

## Próximo bloco

[102]–[110] — PDV.
