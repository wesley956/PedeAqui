# INT-02..INT-09 dependency map

All work depends on the INT-01 ADR, source matrix, inventory and protected gate.
No item below is started by this lot.

| Issue | Inputs from INT-01 | Must produce before dependants | Gate / blocked by |
|---|---|---|---|
| INT-02 Context/identity/trust | customer/contact/address inventory; audience rule | scoped `IntelligenceContext`, correlation, identity source/trust and safe projections | no additional disclosure vs legacy; cross-tenant negative tests |
| INT-03 Capability Snapshot | module/entitlement/RBAC/store/config sources | one snapshot combining business type, supported/enabled module, dependencies, entitlement, permission, provider health, store/mode/flag | no capability from UI/flag alone |
| INT-04 Authority Resolver | external order/owner/provider sources | order/payment/logistics authority decision before tools | no local mutation against external ownership |
| INT-05 Catalog/Menu/Promotion | canonical menu/catalog/promotion/pricing rows; direct-query queue | read-only adapter and customer projection | bot result equals public menu/cart; paused/modifier/price parity |
| INT-06 Order/Workflow/Production | order/state/KDS sources and post-create channel gap | order read adapter, official channel contract plan, workflow/notification projection | all flows/statuses/KDS/notifications unchanged |
| INT-07 Delivery | quote, operation, tracking and external policy sources | separate quote/status/tracking adapters | checkout quote parity and logistics authority |
| INT-08 Payment/Pix | payment service matrix and custom-method gap | canonical method/status/Pix projections | bot methods equal checkout; provider/owner respected |
| INT-09 Growth | Growth services/RPCs and channel gap | additive `whatsapp` channel policy plus benefits adapter | legacy coupons unchanged; entitlement/consent/parity green |

## Critical path

INT-02 precedes INT-03. INT-04 consumes the shared context and must precede any
adapter/action for externally owned state. INT-05..09 may proceed separately only
after the relevant context/capability/authority gates. They do not authorize the
unified router or transactional tools; those remain INT-10 and INT-11.

## Shared output contract for adapters

Each adapter must name its canonical service, audience, capability, identity and
trust requirements, authority rule, side-effect level, confirmation policy,
idempotency policy and safe projection. Storage rows are not adapter outputs.
