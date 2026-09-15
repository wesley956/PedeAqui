# INT-14 — Shadow observability and divergence reporting

## Runtime contract

The store flag `intelligence_shadow_mode` is opt-in and defaults to `false`.
When enabled, an inbound WhatsApp message is evaluated by the Unified
Intelligence Router before the legacy automation runs. The router remains
side-effect free. The customer receives only the legacy result.

After `InboundOutcomeService` establishes the canonical outcome, INT-14 writes
one best-effort observation for the inbound message. Failure to evaluate or
persist shadow telemetry never blocks ingestion, ordering, greeting, handoff or
the webhook response.

## Data and privacy

Observations contain technical organization/store/conversation/message IDs,
correlation IDs, bounded decision enums, result classes, latency, sanitized
error type/code and comparison states. They never contain the message body,
name, phone, complete address, payment data, Pix QR, provider payload, token or
credential.

The table has a 90-day expiry marker, store-scoped foreign keys, RLS for
`conversations.view`, and service-role-only writes. The internal recorder
revalidates conversation and message scope. A unique key per inbound message
prevents duplicate observations when Meta retries the webhook.

## Comparison semantics

Every required dimension is explicit: `match`, `mismatch` or `not_observed`.
INT-14 never labels an unexecuted domain as a match. The production runtime can
currently compare the selected handler boundary, handoff and final inbound
outcome. Price, availability, promotion, order status, payment, delivery and
Growth remain `not_observed` until the canonical projection is actually
executed in shadow. Cross-domain certification continues to prove those
contracts deterministically outside production.

Metrics derive from stored rows:

- intent/tool divergence;
- canonical mismatch and critical mismatch rate;
- fallback and handoff rate;
- next-core error rate;
- legacy/next latency;
- duplicate side-effect prevention;
- cross-tenant violations, which must remain zero.

## GO / NO-GO

GO for the next phase requires a documented observation window with zero
critical tenant, handler/tool, price, payment, delivery, status, Growth,
authority, confirmation or bot/human mismatch. `not_observed` is not evidence
of parity and must not be used to approve a capability.

Any critical mismatch, PII exposure, shadow side effect, webhook impact or
cross-tenant violation is NO-GO. The store flag must be disabled immediately
while the legacy path continues normally.

## Rollback

Set `intelligence_shadow_mode=false` for the affected store. This stops new
shadow evaluation and persistence without changing bot behavior. Code rollback
is a PR revert. The additive schema and historical observations remain intact
for audit; deletion follows retention policy rather than emergency rollback.

INT-15 remains additionally blocked by the professional Print Agent gate from
the official Intelligence RUNBOOK.
