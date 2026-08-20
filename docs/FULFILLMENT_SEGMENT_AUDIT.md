# Auditoria de fulfillment por segmento — [361]

## Conclusão
O domínio atual separa corretamente `order`, `payment`, `production` e `fulfillment`. Nesta entrega **nenhuma transição interna foi alterada**. A adaptação por segmento é somente de apresentação.

## Estados compartilhados preservados

### Produção
`pending_confirmation → queued → preparing → ready`, com caminhos existentes para `canceled` e `not_required`.

### Fulfillment
`pending`, `awaiting_assignment`, `assigned`, `picked_up`, `out_for_delivery`, `delivered`, `awaiting_pickup`, `picked_up_by_customer`, `served`, `canceled`, `not_required` continuam com as transições já definidas em `src/server/orders/state-machines.ts`.

## Vocabulário

| Estado interno | Restaurante | Revenda de gás | Comércio genérico |
|---|---|---|---|
| `queued` | Na fila | Aguardando separação | Na fila |
| `preparing` | Em preparo | Separando | Em andamento |
| `ready` | Pronto | Separado | Pronto |

As ações seguem a mesma regra: `start_production` pode aparecer como **Iniciar preparo**, **Iniciar separação** ou **Iniciar operação**, sem mudar a intenção enviada ao servidor.

## Limites
- Labels não concedem permissão.
- `business_type` não cria uma state machine paralela.
- Restaurante continua com o vocabulário atual.
- Gás reutiliza os mesmos serviços e estados; apenas a microcopy deixa de falar em cozinha/preparo onde não faz sentido.
- Qualquer futura mudança de transição exige uma issue de domínio própria e novos testes de state machine.
