# INT-13 — Cross-domain Certification Report

Certification version: `int-13-v1`

Baseline: `8e9b82e46c2c93bf2dfd97643efab4e821196d70`

Issue: #1064  
Parent: #1051  
Language Lab: #1045

## Coverage

- 720 deterministic scenarios preserved;
- 60 semantic seeds × 12 language variants;
- 15 families;
- 8 conversation phases;
- every scenario declares context, interpreter intent, router intent, tool, capability, authority, canonical service, projection, side effect, confirmation, idempotency and expected result;
- Unified Router selection measured for all 720 variants;
- mandatory parity registry covers catalog/price, payment methods, delivery quote, Growth, order status and workflow/notifications.

## Result on implementation head

- router intent mismatches: 0;
- router tool mismatches: 0;
- capability mismatches: 0;
- authority mismatches: 0;
- critical mismatches: 0;
- cross-tenant violations: 0;
- certification gate: `GO`.

The final PR SHA and CI/browser run links are recorded in #1064 after remote gates finish. This report must not be used as a substitute for CI, Browser Homologation or the future shadow-window evidence from INT-14.

## Corrections found by certification

The first run exposed two routing regressions before merge:

1. the polite prefix `me ajuda, ...` was interpreted as an unconditional human handoff;
2. greeting/context prefixes and a trailing `por favor` could hide a valid base intent;
3. `quero mudar o pedido` during an active order could be mistaken for tracking because of the isolated word `pedido`;
4. `quero fazer outro pedido` could be routed to tracking instead of a new order.

The fixes normalize only conversational wrappers and tighten active-session tracking interruption. They do not calculate price, mutate carts/orders or replace canonical domain services.

## Critical mismatch policy

Any mismatch in tenant, price, payment, delivery, Growth, status, authority or confirmation is `NO-GO`. Any routing mismatch in a scenario already classified as critical is also `NO-GO`.

## Protected runtime

This certification introduces no migration, no production flag activation and no new domain source of truth. The Unified Router remains shadow. Web checkout/order, WhatsApp order, Growth, Pix/custom payment, delivery/pickup, workflow, KDS, printing/copies, notifications, Inbox/handoff/Coexistence, iFood/external ownership, RBAC, entitlements and multi-tenant boundaries remain under their existing canonical services.

## Remaining program gates

- INT-14 must add production-safe observability/shadow divergence reporting;
- INT-15 remains blocked until the professional Windows-managed Print Agent gate is implemented and homologated;
- this report is a release certification artifact, not authorization for canary rollout by itself.
