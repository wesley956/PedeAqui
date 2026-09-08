# Omnichannel support runbooks

Scope: iFood Orders, future iFood Shipping, 99Food and 99Entrega. These procedures preserve canonical order history and never instruct support to edit provider status directly.

## Severity and first response

- **P0** — cross-tenant exposure, duplicate financial side effect, duplicate order creation at scale, or corruption of canonical state. Disable the affected capability/store immediately, preserve evidence, and escalate engineering/security.
- **P1** — provider auth revoked, dead-letter, provider outage blocking sales, order divergence, or iFood Orders lag close to/exceeding operational SLA. Isolate the capability, diagnose, then use audited retry/reconcile only when safe.
- **P2** — recoverable rate limit/retry or auxiliary degradation with core ordering still operating.

Always record organization/store/provider/capability, correlation ID, timestamps and the action taken. Never copy access tokens, client secrets or raw customer payload into tickets.

## iFood polling stopped / no recent events

1. Open `/platform/integracoes` and locate `iFood · Pedidos` for the exact store/environment.
2. Check connection state, last health, last event received/processed, inbox lag and dead-letter.
3. If auth is `action_required`, follow the auth runbook below instead of retrying blindly.
4. If provider is unavailable/rate-limited, keep retries controlled; do not trigger duplicate manual polling loops.
5. If the capability must be isolated, disable **iFood Orders** for that store. Historical external orders remain intact.
6. When the provider signal normalizes, refresh health and verify the incident recovers automatically.

## iFood token/auth action required

1. Confirm the incident classification is `provider_auth` and the affected environment/store is correct.
2. Do not expose or copy the stored token.
3. Reconnect/complete iFood authorization from `Configurações → Integrações`.
4. Rebind the authoritative merchant if required.
5. Verify health becomes connected before enabling new operations.
6. Production capability activation remains blocked until the homologation/rollout approval exists.

## Pedido recebido no iFood mas não importado

1. Search the support queue by store/provider and external event/order identity.
2. If the inbox event is `retry` or `dead_letter`, use **Reprocessar evento**. The durable external event ID is reused and deduplication remains active.
3. If no durable event exists, investigate polling/auth/provider availability; do not create an internal order manually as a substitute.
4. Verify one canonical order is created and that reprocessing the same event does not create a second order.

## Comando aceito, mas estado do pedido divergiu

1. Confirm the outbox command and the last authoritative provider event.
2. If the command is `retry`/`dead_letter`, use **Retry seguro**; the persisted provider idempotency key must remain unchanged.
3. If `external_orders.sync_status` is `retry`/`attention`, use **Reconciliar estado conhecido** only when the last provider status has a safe lifecycle milestone.
4. Never use a free-form “force status”. Newer provider state must arrive through polling/event ingestion.
5. Verify reconciliation closes the divergence incident.

## Cancelamento pendente

1. Inspect the lifecycle outbox operation and last iFood cancellation event.
2. Do not emit a second cancellation with a different idempotency identity.
3. Retry only if the existing command is recoverable and the provider contract permits it.
4. Canonical cancellation is confirmed by authoritative provider event, not by HTTP acceptance alone.

## Provider 5xx / rate limit

1. Confirm classification: `provider_failure` or `provider_rate_limit`.
2. Preserve exponential retry/backoff and `Retry-After` semantics.
3. Do not mass-retry from the UI while automatic retry is active.
4. If impact becomes operationally unacceptable, disable only the affected capability/store; native PedeAqui remains available.
5. Recovery should resolve the deduplicated incident automatically.

## 99Food indisponível

1. Identify the exact 99Food capability affected (Orders/Menu/Logistics).
2. Disable only that capability if isolation is required.
3. Preserve native modules/workflow and all previously imported orders.
4. Use the same inbox/outbox/reconciliation rules when the adapter supports the operation.

## 99Entrega webhook sem atualização

1. Check capability health, last event received/processed and ingestion lag.
2. Check provider/auth failure classification before replay.
3. Reprocess only the durable event; never synthesize tracking status.
4. Keep own-delivery module independent from 99Entrega capability.

## Catálogo batch preso

The current PedeAqui product decision keeps iFood catalog/price synchronization disabled. `ifood_catalog` must remain OFF. If a future provider/menu capability is implemented, diagnose it independently from Orders and never allow it to overwrite PedeAqui prices without an explicit product decision and migration plan.

## Fila de impressão de pedido externo atrasada

1. Confirm the canonical order exists and provider lifecycle reconciliation completed.
2. Inspect Print Agent/printer health separately from provider health.
3. Treat printer/device errors as `local_device`, not provider failure.
4. Retry print through the existing idempotent print path; do not re-import the marketplace order.

## Rollback de capability por store

1. In `Configurações → Integrações`, disable only the affected capability.
2. Confirm the action is audit-logged with before/after, environment and actor.
3. Verify no new polling/commands are claimed for the disabled capability.
4. Verify existing `external_orders`, audit history and canonical orders remain unchanged.
5. Verify store workflow lanes/modules are unchanged.
6. Re-enable only after healthy connection and, in production, homologation/rollout approval.

## Recovery validation

After every P1 recovery:

- refresh `/platform/integracoes`;
- confirm inbox/outbox are no longer stuck;
- confirm divergence count returned to zero when applicable;
- confirm the deduplicated `platform_incidents` record moved to `resolved`;
- confirm no duplicate order, payment, print or delivery side effect was created;
- attach the sanitized correlation ID and timestamps to the support record.
