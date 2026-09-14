# IntelligenceContext, identity and disclosure

INT-02 introduces a shadow-only contract. It has no production consumer and does
not change bot, checkout, Inbox or merchant-panel behavior.

## Boundary

`IntelligenceContext` carries request/correlation and scoped references. It does
not carry durable price, balance, payment, delivery or order-status truth. Those
values must be obtained later from the canonical capability/authority/adapter
chain defined by INT-01.

Organization and store are mandatory. A customer/contact/order/cart reference is
only meaningful inside that scope. Phone numbers are attributes, never global
identity keys.

## Identity sources

| Source | Evidence | Trust | Customer disclosure |
|---|---|---:|---|
| anonymous | no verified evidence | none/weak | none |
| browser recognition | valid post-order token resolved by `CustomerRecognitionService` in organization/store | verified | linked customer only |
| WhatsApp contact | existing `contacts.customer_id` resolved by organization/store/contact | weak or verified | only when linked; phone lookup alone is insufficient |
| authenticated user | active membership/store scope and existing RBAC | privileged | merchant/agent projection still requires permission |
| manual authorized link | an existing authorized operation confirms actor, scope and customer | privileged | linked customer only |
| system | trusted internal execution | privileged | system projection only |

The resolver exposes separate entry points so browser recognition cannot silently
become WhatsApp recognition. Its ports must adapt existing services/contracts;
they do not authorize direct table access in future consumers.

## Audiences and disclosure

`allowedDisclosure` is fail-closed:

- `customer`: address/history require verified identity and exact customer id;
- `agent` and `merchant`: privileged authenticated actor plus explicit RBAC;
- `system`: privileged system actor only;
- internal identifiers require a separate debug permission and are never exposed
  to the customer projection.

Projection also rejects a record whose customer id differs from the context.
This is the final guard, not a replacement for canonical service scoping.

## Conversation diagnostic

Conversation id/mode are references, not a parallel state machine. This context
is designed to accompany future interpretation of lateral questions,
corrections, interruptions and resumptions without making the current wizard step
the exclusive router. INT-02 does not change the current pipeline or handoff.

