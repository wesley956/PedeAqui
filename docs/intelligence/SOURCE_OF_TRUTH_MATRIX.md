# Intelligence source-of-truth matrix

Baseline: `67977c3cb990371bf7581d7f1db53ce04c35e9f8` (equal to `main` when INT-01 started).

“Projection” is what Intelligence may expose; it is not an alternative authority.

| Domain | Canonical read | Canonical mutation / decision | Safe projections | Existing evidence / tests |
|---|---|---|---|---|
| Store, hours, operation | store services/settings and store-hours contract | store/settings services with authorization | customer store status/hours; merchant operational view | `public-store-information`, `store-profile-settings`, `store-timezone-display`, `global-operational-health` |
| Customer identity | `CustomerRecognitionService`, `CustomerService`; future scoped identity adapter for WhatsApp contact | customer/address services; recognition token contract | customer self-context; role-filtered agent/merchant profile | `customer-recognition`, `customer`, `access-isolation-contracts`, `whatsapp-global-customer-context` |
| Address | `CustomerAddressService` and checkout recognized-address path | `CustomerAddressService`; `CheckoutService.saveAddress/useRecognizedAddress` | no address on weak phone-only identity | `customer-recognition`, `checkout`, `whatsapp-global-customer-context` |
| Public catalog/menu | `PublicMenuService`, `StoreMenuService`; catalog services for merchant management | product/category/modifier services | public availability/product details; merchant catalog view | `catalog`, `public-menu-readiness`, `public-menu-auth-isolation`, `modifier-quantity-contract` |
| Promotions | `PromotionService` plus public menu schedule/projection | `PromotionService` | active price/promotion for store timezone/audience | `promotion-price-guard`, `menu-schedule`, `pricing` |
| Pricing | pricing contracts called by menu/cart | `CartService` recalculation and pricing contracts | item/total snapshots from cart/order | `pricing`, `pricing-composed-box`, `checkout` |
| Cart | `CartService.getCart`, `PublicCartSummaryService` | `CartService`, `CartItemEditService` | customer cart summary | `cart-token`, `public-cart-edit`, `modifier-quantity-contract` |
| Checkout | `CheckoutService.load/review` | `CheckoutService.saveIdentity/saveFulfillment/saveSchedule/saveAddress/savePayment` | blockers/review safe for customer | `checkout`, `checkout-v1-v3-final-gate`, `public-checkout-readiness` |
| Order/workflow | `OrderService`, `OrderPresentationService`, `PublicOrderService` | `OrderService` plus canonical order RPC/state machines; `OrderQuickFinishService` | public order projection; manager row | `order-state-machines`, `order-manager`, `public-order-tracking-v2`, `whatsapp-direct-orders` |
| Production/KDS | `KitchenService`, order snapshot/production status | kitchen/order production transition | KDS/merchant production projection | `kitchen`, `kds-ui`, `production-resilience` |
| Delivery quote | `DeliveryQuoteService` / quote calculator through its service boundary | checkout fulfillment/address retains accepted quote inputs | fee, minimum, area/distance and ETA result | `delivery`, `manual-delivery-flow`, `public-checkout-v2` |
| Delivery operation/tracking | delivery operation, route tracking and external delivery policy services | delivery/driver mutation services plus order fulfillment state machine | customer tracking; driver/merchant scoped views | `delivery-operations`, `delivery-completion-consistency`, `omnichannel-external-delivery` |
| Payment methods | `StorePaymentMethodService` | payment configuration service | checkout-equivalent enabled methods, including custom/Ticket | `payments`, `checkout`, `cash-payment-module-boundary` |
| Payment/Pix status | `PaymentService`, order Pix/provider/reconciliation services | provider webhook/reconciliation and payment/order state machine | customer payment status/Pix readiness without secrets | `payments`, `order-pix-*`, `mercado-pago-*` |
| Growth | customer-benefits resolver and `GrowthService` | Growth services/RPCs and checkout application | available benefits only; never consume by mention | `growth`, `growth-bot-relationships-1022`, `growth-observability-1023` |
| Modules/entitlement/RBAC | module access/configuration/store state services and authorization context | module services and subscription contracts | capability decision with reason, not raw commercial rows | `modular-contract-regression-matrix`, `commercial-plan-module-entitlements`, `rbac-multitenant-stabilization` |
| Omnichannel/iFood | integration core canonical external order, presentation and provider repositories | intake/import/lifecycle/command services under provider authority | official snapshots for board/KDS/print/finance | `omnichannel-*`, `ifood-*` |
| Conversations | `ConversationService`, lifecycle/state history, settings service | conversation lifecycle/idempotency RPCs; outbound provider service | customer timeline; role-filtered agent Inbox; traceable inbound outcome | `conversations`, `conversations-sql`, `whatsapp-coexistence`, `conversation-auto-close-1018`; production diagnostic in #1050 |
| WhatsApp inbound/outbound | webhook validation/routing and provider contract | receive/create/claim/mark-result RPCs | normalized message event without provider secrets | `whatsapp-webhook-routing`, `whatsapp-live-readiness`, `order-whatsapp-notifications` |
| Handoff/Coexistence | conversation state and `WhatsAppCoexistenceService` | `conversation_transition_internal`, echo ingestion RPC | current mode/assignee/history by permission | `whatsapp-coexistence`, `human-attention-alert`, `conversations` |
| Printing | print config/routing/queue/presentation services | queue claim/ack/fail/retry contracts | configured copies and printable order snapshot | `printing-*`, `escpos`, `omnichannel-kitchen-print` |
| PDV | `PdvService` | `PdvService` | cashier-authorized sale view | `pdv`, `pdv-fast-path-ui`, `pdv-advanced-ui` |
| Dining/salon | dining services and catalog projection | `DiningService` / public dining contract | table/tab/guest appropriate projection | `dining`, `dining-flow-ui` |
| Gas | gas container service plus cart gas contract | gas service/cart/order official flow | applicable container/exchange choice | `gas-segment-362-366`, `cart` |
| Inventory | inventory and recipe services | same services | merchant inventory projection only | `inventory`, `inventory-historical-hardening` |
| Cash | `CashService` | `CashService` | role-filtered session/movement | `cash`, `cash-payment-module-boundary` |
| Fiscal | fiscal read/artifact services | fiscal service/worker/provider/webhook | authorized artifact/status | `fiscal`, `fiscal-panel-ui` |
| Purchases | supplier/purchase services | same services | authorized merchant view | `purchases`, `procurement-ui` |
| Operational health | `OperationalHealthService` and policy | domain repair action remains in owning service | merchant/platform audience-specific health | `global-operational-health`, `monitoring-contracts` |

## Known contract gaps frozen by INT-01

1. Growth does not yet model `whatsapp` as a real channel; the bot uses
   `digital_menu`. Resolution belongs to INT-09 and must be additive.
2. WhatsApp payment choices read only built-in rows and are not in full parity
   with `StorePaymentMethodService`, especially custom methods.
3. WhatsApp catalog/composition performs direct table reads instead of using a
   canonical consumer adapter.
4. WhatsApp order creation patches `orders.channel` after canonical creation.
5. Customer/address and recent-order lookups are tenant/store scoped today, but
   need an explicit identity/trust adapter before becoming Intelligence tools.
6. The #1050 production snapshot found 9 conversations ending with inbound and no
   later response (4 still in `bot`, 2/2 in `waiting_agent`) plus 14 conversation
   rows without messages. Counts are time-bound observations; the invariant is
   structural: every inbound needs one persisted outcome and empty rows need an
   audited lifecycle classification before KPI use.
