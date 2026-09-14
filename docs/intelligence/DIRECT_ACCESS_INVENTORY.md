# Direct-access inventory — Conversations / WhatsApp

Scope: current `src/server/conversations/**`, WhatsApp webhook entrypoint and
conversation feature surface. Classification follows the ADR. No access was
changed by INT-01.

| Source | Direct tables/RPCs | Class | Reason / target |
|---|---|---|---|
| `webhook-routing.ts` | `store_conversation_settings` | permitido | Provider phone-number routing belongs to the channel boundary; keep strict store/org resolution. |
| `conversation-service.ts` | `conversations`, `contacts`, `messages`, `conversation_state_history`, `store_conversation_settings`; conversation/campaign RPCs | permitido | Canonical Conversations repository/service and internal lifecycle/idempotency operations. Customer enrichment beyond contact IDs must go through a customer projection later. |
| `coexistence-service.ts` | settings; `conversation_receive_echo_internal` | permitido | Canonical echo ingestion for #1050; preserve idempotency and human override. |
| `conversation-auto-close-worker.ts` | auto-close and outbound-result RPCs | permitido | Canonical lifecycle worker. |
| `human-attention-alert-service.ts` | `conversations` | permitido | Read-only conversation-owned aggregate, tenant/store scoped. |
| `settings-service.ts` | `store_conversation_settings` | permitido | Bounded-context configuration. |
| `meta-embedded-signup-service.ts` | signup sessions, conversation settings, registration-pin RPC | permitido | Provider onboarding storage; secrets must never enter Intelligence projections. |
| `order-notification-context-service.ts` | `order_notification_store_context_internal` | permitido | Canonical, scoped snapshot RPC for a cross-domain event. |
| `order-notification-worker.ts` | notification claim/finish/checkpoint RPCs; conversation outbound RPCs; `orders`, settings, stores, contexts, customers, messages | migrar para adapter | Queue/conversation RPCs stay; order/customer/store reads should use event snapshots or safe domain projections. Preserve Meta window and idempotency. |
| `greeting-service.ts` | conversation/settings/contact/message/session; store/menu settings/hours/payment/custom-payment/delivery/orders/notification/operational tables; lifecycle/session RPCs | migrar para adapter | Conversation/session accesses stay; store, hours, payment, delivery and order truth must move behind adapters. Do not change greeting precedence in this phase. |
| `whatsapp-direct-order-orchestrator.ts` | conversation/settings/contact/message/session; lifecycle/session RPCs | permitido | Orchestration metadata belongs to Conversations. Domain truth is delegated to `WhatsAppOrderService`; future router replaces sequencing only after parity. |
| `ai-tools.ts` | conversations, contacts, products, orders, customers, stores; Growth balance and transition RPCs | migrar para adapter | Conversation transition may stay; catalog/order/customer/store/Growth reads bypass canonical projections and capability/identity gates. |
| `whatsapp-customer-context.ts` | contacts, customer addresses, orders | migrar para adapter | Queries are scoped and use ownership checks, but identity strength and audience projection must be centralized in INT-02. |
| `whatsapp-learning-order-service.ts` | modifiers, contacts, customers, customer addresses | migrar para adapter | Language learning may remain local; catalog and identity/address truth move to their adapters. |
| `whatsapp-contextual-question-service.ts` | modifiers | migrar para adapter | Contextual language can interpret the question; canonical menu adapter supplies eligible options. |
| `whatsapp-order-service.ts` | products, modifier links/groups/modifiers, payment methods; final `orders` update | migrar para adapter / remover | Read catalog and payments through canonical adapters. Remove post-create channel patch once `OrderService.createFromCheckout` accepts the authoritative channel contract (INT-06/11); never replace it with another direct mutation. |
| `whatsapp-automation-capability-service.ts` | stores, store modules, subscriptions, delivery/operational settings; entitlement RPC | migrar para adapter | Existing resolver is useful input, but the unified Capability Snapshot must own module/dependency/entitlement/config/health decisions in INT-03. |
| `whatsapp-language-learning.ts` | `product_experience_events` | permitido | Observability/learning event owned by this concern; retain PII minimization and scoped lookup. It must not change price or catalog truth. |
| `app/api/webhooks/whatsapp/route.ts` | none directly | permitido | Thin validated entrypoint; preserve direct-order precedence and do not activate new event types without a consumer. |
| `features/conversations/**`, Inbox page | actions call conversation/settings services | permitido | UI/action surface must not become a domain authority; later Inbox work remains governed by #1050. |

## RPC ownership notes

Conversation RPCs for receive, create outbound, claim, mark result, delivery,
transition, read, auto-close and echo are preferred over equivalent direct
mutations. Order notification queue/checkpoint RPCs and Growth balance RPCs remain
canonical only for the narrowly declared operation. Their outputs still require
capability, identity and audience checks before Intelligence exposure.

## Search protocol for future changes

Every PR touching `src/server/conversations` or future `src/server/intelligence`
must review new `.from(...)` and `.rpc(...)` calls. A cross-domain direct mutation
is suspicious by default; a direct read requires an explicit classification here
or in the executing ADR/issue.
