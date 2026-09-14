# Authority Resolver

INT-04 is read-only and shadow-only. It interprets canonical ownership facts; it
does not query `external_orders`, call a provider, enqueue commands or mutate an
order.

## Sources

Future loaders must use the existing canonical order/external-order and scoped
integration contracts. Required facts are provider, integration account,
`payment_owner`, `logistics_owner` and `sync_status`. Account resolution must
match organization, store and account, as already required by
`IntegrationProviderRegistry` and iFood lifecycle services.

## Ownership matrix

| Concern | Internal order | External/provider ownership |
|---|---|---|
| order lifecycle | canonical PedeAqui state machine | existing provider command; confirmation only after provider event |
| payment | PedeAqui payment service | provider event when provider-owned; local collection only for merchant/PedeAqui owner |
| PedeAqui Pix | allowed by later payment capability/service | forbidden for marketplace imports |
| logistics | canonical delivery service | no local assignment/advance for iFood/99Food/99Entrega ownership |

An iFood lifecycle decision names the already-supported commands `confirm`,
`start_preparation`, `mark_ready` or `request_cancellation`. `allowed=true` with
route `provider_command` means the command may be requested through the canonical
service; `confirmed=false` means it is not yet business truth.

99Food has no lifecycle command contract in the current repository, so lifecycle
mutation fails closed. No generic HTTP or invented provider command is allowed.

## Sync and health

`pending` remains pending. `retry` and `attention` are attention states, never
success. A disconnected or action-required account denies provider commands.
Safe order viewing can continue from the minimized canonical snapshot.

## Context binding

`bindAuthority` creates a typed authority-bound context only when organization,
store and active order agree. It retains the full structured snapshot under the
context authority field without making it a durable state machine.

Catalog and price are absent by design. Connecting iFood order authority does
not synchronize or overwrite PedeAqui catalog/pricing.

