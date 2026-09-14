# Capability Snapshot

INT-03 adds a pure, shadow-only decision layer. It does not read tables, mutate
domain state, enable flags or govern a production consumer.

## Canonical inputs

The resolver consumes facts already decided by server-side contracts:

- module support, store enablement, dependencies, entitlement and module RBAC:
  `ModuleAccessService` / `resolveModuleAvailability`;
- user permissions: `PermissionSnapshotService` / `authorize`;
- commercial plan/limits: `EntitlementService`;
- provider/payment readiness and health: their existing configuration/health
  services;
- operational configuration: the owning checkout, delivery, conversation,
  payment or store service;
- conversation mode and tenant/store: `IntelligenceContext`.

Frontend visibility is never an input. Future loaders must adapt these canonical
services; they must not rebuild their decisions with direct table queries.

## Capability gates

| Capability | Structural module | Extra gate |
|---|---|---|
| `canAutoReply` | conversations | active store, bot mode, flag/provider/config |
| `canSearchCatalog` | catalog | safe read remains possible while temporarily closed |
| `canCreateOrder` | orders + catalog | active store, create permission |
| `canQuoteDelivery` | orders + catalog | active store and quote configuration |
| `canTrackDelivery` | deliveries | tracking/provider/config when applicable |
| `canShowGrowthBenefits` | growth | safe identity projection still applies |
| `canRedeemGrowthBenefits` | growth | manage permission, active store, later confirmation/tool policy |
| `canOfferPix` | orders | active store and payment-provider readiness |
| `canMutateOrder` | orders | edit permission, active store, **authority still required** |
| `canViewOperationalHealth` | dashboard | dashboard permission |

Delivery quoting intentionally does not require the managed deliveries module.
Neighborhoods, fees and estimates belong to checkout commercial configuration
and remain available when delivery fleet operations are disabled.

## Reasons

Every decision returns all applicable structured blockers: scope mismatch,
feature, store state, conversation mode, module support/store/dependency/plan/RBAC,
explicit permission, provider health and operational configuration. An allowed
decision contains only `allowed`.

`canMutateOrder.requiresAuthority=true` is a mandatory hand-off to INT-04. It is
not permission to mutate a local or external order by itself.

## Store and conversation behavior

- inactive store blocks all capabilities;
- temporarily closed blocks transactional capabilities that require an active
  store, while catalog and health reads can remain available;
- `human`, `waiting_agent`, `closed` and `none` always deny auto-reply;
- provider failure blocks only capabilities explicitly connected to that
  provider.

The snapshot preserves organization/store and a source revision for correlation.
It contains no price, payment, balance, delivery, Growth or order-status truth.

