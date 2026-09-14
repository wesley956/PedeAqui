# Protected regression checklist

This is the frozen INT-01 gate derived from #1051/#1068. A later lot may add
coverage but may not silently remove an invariant. “Plan” means the named INT
issue must add parity/negative coverage before rollout.

| Protected area | Invariants | Current evidence | Required follow-up |
|---|---|---|---|
| Web order | cart/edit, modifiers/composition, official pricing/promotion, checkout, explicit completion | cart/checkout/pricing/public UX suites | INT-05/06 parity |
| WhatsApp order | direct orchestrator precedence, explicit confirmation, session survives questions/handoff, no duplicate order | `whatsapp-direct-orders`, contextual/composition/language suites | INT-10/11 certification |
| Workflow | standard/simplified/custom, delivery/pickup, quick finish and four canonical state domains | order manager/workflow/state-machine suites | INT-06 parity |
| Customer | browser recognition; scoped phone/contact; safe history/address; no weak-identity disclosure | customer recognition, access isolation, global context | INT-02 negative trust matrix |
| Catalog/promotion | paused/unavailable blocked; required modifiers not guessed; timezone schedules | catalog pause, modifiers, promotion and menu schedule | INT-05 bot == public menu/cart |
| Delivery | fee/minimum/free delivery/area/distance/ETA; assignment/tracking; external logistics authority | delivery and omnichannel external-delivery suites | INT-07 quote/status parity |
| Payments/Pix | cash/credit/debit/custom (Ticket), provider readiness, ledger/reconciliation, external owner | payment/Pix/Mercado Pago/external-payment suites | INT-08 checkout parity |
| Growth | cashback/points/coupons/campaigns, consent/opt-out, limits/expiry, entitlement; no consume-by-mention | Growth suites and #1045 lab | INT-09 real WhatsApp channel |
| Notifications | all nine checkpoints and simple/complete/custom presets; Meta window/idempotency | order WhatsApp notification and automation suites | INT-06/13 parity |
| Human/Coexistence | bot/waiting_agent/human/closed; bot silent in human; echo dedupe; auto-close; handoff preserves order; waiting_agent has owner, timing and atomic assumption | conversations/coexistence/auto-close/human alert; #1050 production diagnostic | INT-12 under #1050 |
| Inbound outcome | every persisted inbound reaches exactly one traceable reply, handoff, human assumption, durable retry/defer or persisted error; bot owns next action | #1050 production snapshot exposed current gaps | INT-10/12/14 must add outcome ledger/metrics without a parallel domain state machine |
| Conversation lifecycle/KPI | empty conversation rows are classified before Inbox volume/health counts; new waiting messages update activity | #1050 found 14 empty rows requiring investigation | INT-12/14 audit origin, expiry, unread/auto-close and metrics |
| Multi-tenant/RBAC/modules | org/store isolation, restaurant/gas/generic, module ON/OFF/dependencies/entitlement/permissions | access/RBAC/modular/commercial entitlement suites | INT-03 capability negatives |
| Omnichannel/iFood | external identity, payment/logistics owner, provider sync, no mandatory catalog/price sync, snapshot operation | omnichannel and iFood suites | INT-04 authority negatives |
| Production/KDS | production status and order snapshot; no parallel machine | kitchen/KDS/production and omnichannel kitchen-print | INT-06 regression |
| Printing | durable queue; strict agent ownership from claim through ACK/fail; lease recovery; local spool and `printed_unacked`; routing/style/copies (including two); setup test/retry/reprint; failure never mutates order | printing/ESC-POS/omnichannel print and PDV-to-kitchen suites | professional Windows agent must pass the #1051 acceptance matrix before #1066; preserve current production mechanism until controlled migration |
| Other domains | PDV, salon, gas, inventory, cash, fiscal, purchases, dashboard/finance remain service/RBAC bounded | corresponding domain suites | Merchant Intelligence stays read-only first |
| Health/observability | optional channel failure never blocks orders; no excessive PII/secrets | monitoring/operational health/WhatsApp readiness | INT-14 shadow metrics |

## Mandatory stop conditions

Any cross-tenant leak, price/payment/status mismatch, duplicate order, automatic
reply in human mode, lost cart/order on handoff, broken print/KDS, unauthorized
external-order mutation, incompatible migration, unclear authority or failing
critical regression is NO-GO. Record it and do not start a dependent issue.
Known paths producing `inbound -> nothing` are likewise NO-GO for Inbox/Coexistence
readiness even when provider error count is zero.

## Standard evidence per lot

- specific unit/contract/parity tests;
- related regression suites;
- lint and typecheck;
- migration history and DB drift when applicable;
- build/E2E/browser when runtime/UI is affected;
- branch, commits/PR, risks, rollback and GO/NO-GO in the issue.
