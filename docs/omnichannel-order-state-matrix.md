# Omnichannel order state matrix

Related: #934, #935, #936, #937, #950.

This document freezes the provider-neutral boundary. Provider-specific tables for iFood and 99Food may add **mapping rows**, but they may not add new PedeAqui order/payment/production/fulfillment statuses merely for convenience.

## Dimensions are independent

| Dimension | Examples | Authority |
| --- | --- | --- |
| Sales channel | `pedeaqui`, `ifood`, `99food` | where the order originated |
| Payment owner | `pedeaqui`, `provider`, `merchant` | who is responsible for payment settlement |
| Logistics owner | `pedeaqui`, `merchant`, `ifood`, `99food`, `99entrega` | who fulfills delivery |
| External sync | `pending`, `synced`, `retry`, `attention` | integration/reconciliation only |
| Workflow lanes | store workflow configuration | explicit store configuration only |

Changing one dimension does not implicitly mutate another.

## Canonical state domains preserved

### Order
`pending_confirmation → confirmed → completed`

Alternative terminal transitions remain `rejected` and `canceled` according to the existing state machine.

### Payment
`pending | authorized | paid | failed | partially_refunded | refunded`

A provider payment/refund changes the payment domain through an application intent. It does not reopen production.

### Production
`pending_confirmation | queued | preparing | ready | canceled | not_required`

### Fulfillment
`pending | awaiting_assignment | assigned | picked_up | out_for_delivery | delivered | awaiting_pickup | picked_up_by_customer | served | canceled | not_required`

## Provider event → canonical intent matrix

Provider-specific adapters must map their official events into these rows. Unknown events are observed/reconciled and never copied into an internal enum.

| External semantic event | Canonical intent / action | Internal precondition | Outbound action | If unknown/divergent |
| --- | --- | --- | --- | --- |
| New order available | create canonical order snapshot | event durable + unique external relation | none until policy decides | quarantine/attention; no partial order |
| Order accepted/confirmed | `accept_order` | internal order pending confirmation | provider confirm when PedeAqui initiated it | reconcile; do not double-confirm |
| Start preparation | `start_production` | confirmed + production transition valid | provider preparation command when required | attention if provider/internal disagree |
| Ready | `mark_ready` | production transition valid | provider ready command when supported | reconcile; no new lane |
| Dispatch | `dispatch` | delivery + fulfillment transition valid | provider dispatch/logistics command when applicable | reconcile logistics separately |
| Delivered/picked up/served | fulfillment completion intent | valid fulfillment path | normally none or provider ack per contract | completion still respects payment invariant |
| Provider cancellation final | `cancel_order` | provider cancellation is authoritative under provider contract | none | preserve external reason/history |
| Cancellation requested | no terminal order mutation yet | request recorded externally | optional request command | external sync `pending/attention` |
| Cancellation failed | no cancel transition | prior request exists | none | external sync `attention`; order stays operational |
| Refund | payment/refund intent | existing payment relation | none/provider command if PedeAqui initiated | never reopen production |
| Address/order patch | permitted snapshot patch | order not beyond provider-defined cutoff | optional ack | audit diff; reject unsafe fields |
| Driver assignment/tracking | logistics snapshot update | delivery order | none | does not change sales channel |
| Unknown/new provider enum | no canonical transition | event remains durable | none | observed + reconciliation; batch continues |

## Creation gate

An external order can create an internal `orders.id` only after:

1. origin/merchant resolved server-side to organization + store;
2. event is durably persisted and deduplicated;
3. canonical snapshot validates;
4. money totals reconcile in integer cents;
5. required items/customer/fulfillment snapshots exist;
6. payment owner and logistics owner are explicit;
7. external relation can be written in the same durable transaction boundary as canonical creation.

External orders never reuse a native `source_cart_id`.

## Workflow invariant

The operational board is driven by the store workflow and existing state machines, not provider identity. An iFood/99Food badge or external sync indicator can be shown on an existing card, but adapters cannot add a marketplace lane.

Example store workflow:

`Novos → Em preparo → Prontos`

The same three lanes can contain PedeAqui, iFood and 99Food orders. Enabling/disabling Entregas, iFood Shipping or 99Entrega must not alter that lane set without an explicit workflow edit.

## Provider-specific mapping gate

Before an adapter is promoted from sandbox to pilot, its official contract must fill a provider-specific mapping table with:

- official event/status/code;
- canonical intent;
- internal preconditions;
- outbound command/no-op;
- terminal/non-terminal semantics;
- retry/ack behavior;
- reconciliation behavior;
- fixture/evidence identifier.

No mapping row may infer provider semantics from another provider. iFood and 99Food share infrastructure, not business enums or SLAs.
