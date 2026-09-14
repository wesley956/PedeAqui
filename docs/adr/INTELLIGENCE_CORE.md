# ADR — PedeAqui Intelligence Core

- Status: proposed for approval in #1052 (INT-01)
- Date: 2026-09-14
- Baseline audited and revalidated: `67977c3cb990371bf7581d7f1db53ce04c35e9f8`
- Parent: #1051
- Execution contract: #1068
- Related contracts: #1045 and #1050

## Context

The current WhatsApp path already reuses `CartService`, `CheckoutService` and
`OrderService` for direct orders, and the webhook gives the direct-order
orchestrator precedence over the generic greeting. The same bounded context,
however, also reads customer, catalog, payment, delivery, Growth and order data
directly. That mixture makes parity and tenant-safety harder to prove as the bot
gains more intents.

The repository `main` was compared with the audited baseline before this ADR was
written. Both point to the same commit, so `baseline..main` is empty. All symbols
and paths in the accompanying inventories were nevertheless re-read from the
current source rather than inferred from the earlier audit.

## Decision

The mandatory flow is:

```text
IntelligenceContext -> Capability -> Authority -> Tool/Adapter
  -> canonical service -> audience-safe projection -> response/action
```

The Intelligence layer interprets intention; PedeAqui remains authoritative for
identity, availability, price, promotion, delivery, payment, Growth, order and
workflow state. No Intelligence component may own a parallel state machine,
commercial calculation, customer store, or external-provider authority model.

### Boundaries

1. Intent parsing may normalize language and prepare a proposal, but it may not
   decide domain truth.
2. Every tool declares audience, required identity/trust, capabilities,
   authority, side effect, confirmation and idempotency policies.
3. Reads cross a domain adapter and return an audience-specific projection.
4. Mutations use the canonical service/RPC and the domain's state machine.
5. Conversation storage and lifecycle RPCs remain canonical for the
   Conversations bounded context; direct access to another domain is migrated.
6. External orders retain provider identity plus `payment_owner`,
   `logistics_owner` and sync authority. iFood does not imply catalog or price
   synchronization.
7. Human mode is an absolute auto-reply guard. Handoff does not destroy a cart or
   order session.

## Rollout decision

Future runtime work is additive and off by default. Flags align to architectural
boundaries (`intelligence_core_enabled`, shadow, canonical catalog, payments,
delivery, Growth and unified router), not individual phrases. Until the shadow
and pilot gates, legacy produces the real response and the new path only records
PII-minimized comparisons.

This INT-01 change creates no runtime flag, migration, webhook subscription or
production configuration.

## Direct-access policy

- `permitido`: storage belongs to Conversations/Meta ingestion/observability and
  the query preserves tenant/store scope, or the access is an already-canonical
  internal RPC.
- `migrar para adapter`: the query reads or mutates another bounded context and
  can bypass its canonical service, projection, capability or authority rule.
- `remover`: the access duplicates a domain mutation or patches canonical output
  after the fact. Removal happens only after a replacement contract and parity
  tests exist.

Exceptions must be explicit in this ADR and in the executing issue. A service
being located under `conversations/` does not make its cross-domain table query
canonical.

## Protected invariants

The normative checklist is
`docs/intelligence/PROTECTED_REGRESSION_CHECKLIST.md`. Critical mismatches in
tenant, price, availability, payment, order status, delivery, Growth, authority,
confirmation or bot/human mode are release blockers and produce NO-GO.

The production diagnostic added to #1050 on 2026-09-14 is also normative. Every
persisted inbound must reach exactly one traceable terminal outcome: bot reply,
requested/confirmed handoff, assumed human service, durable retry/defer, or a
persisted observable error. `inbound -> nothing` is forbidden. A conversation in
`bot` owns the next action; `waiting_agent` must expose request time/reason,
notifications, wait duration, messages received while waiting, and the atomic
transition to an identified human. Conversation rows without messages must be
classified before they are counted as Inbox health or volume.

## Consequences

- INT-02 can add context/identity without changing domain truth.
- INT-03/04 can resolve capability and authority before adapters are exposed.
- INT-05..09 receive named canonical sources and known gaps.
- Existing direct accesses remain untouched in INT-01; the inventory provides
  the migration queue.
- Documentation drift is checked by a structural test, while behavioral parity
  remains mandatory in the later domain issues.

## Rollback

Revert the documentation/test commit. There is no database, runtime, deployment,
provider or tenant rollback for INT-01.
