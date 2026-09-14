# Canonical Catalog Adapter — INT-05

INT-05 adds a read-only/shadow adapter for commercial catalog reads used by the Intelligence Core. It does not create a second catalog, write products, mutate carts, create orders or synchronize marketplace catalog/prices.

## Canonical sources

- `PublicMenuService` is the source of the public/sellable menu and product details.
- `PromotionService` remains the source of scheduled promotion windows and timezone semantics.
- `PricingService` is used for read-only price/composition revalidation. This is the same pricing engine used by `CartService` before cart writes.
- `CartService` remains the canonical cart mutation/repricing owner. Its existing reprice paths can persist cart snapshots, so the Intelligence adapter intentionally does **not** call a mutating cart path just to answer a read-only question.

The adapter never queries `products`, `product_promotions`, modifier tables, stock tables or marketplace catalog tables directly.

## Read tools

`IntelligenceCatalogAdapter` exposes:

- `search(query)` — searches only products that the canonical public menu marks `available`; includes tolerant name matching for conversational input.
- `productDetails(productId)` — returns canonical public details, required modifier/composition rules, operational state and sellability.
- `promotions(now)` — combines the canonical public menu with active `PromotionService` schedules; sold-out products are filtered out.
- `revalidatePrice(input, now)` — revalidates the effective promotional base price, required modifiers/composition and gas-container option in memory through `PricingService`; no cart row or RPC is written.

## Scope and isolation

Every result is bound to the `IntelligenceContext.storeId` and `businessType`. A canonical menu/product for another store or business type fails closed with `CatalogScopeError`. The public menu RPC owns its own data-access policy; the Intelligence layer does not bypass it with admin table reads.

Store IDs are the canonical store boundary returned by the public-menu contracts. Organization scope remains carried by `IntelligenceContext` and by the existing canonical services; INT-05 does not expose organization IDs in public menu payloads.

## Sellability invariants

- `sold_out` products never appear in search/promotions.
- a sold-out product can be inspected for status but is returned with `sellable=false` and cannot be revalidated as an orderable item.
- store pause/closed schedule is respected by `PublicMenuService`; price revalidation fails closed when `operational.canOrder=false`.
- required modifier/composition groups are returned explicitly and are never guessed by the adapter.
- effective promotional price comes from the canonical public product and is priced by the same `PricingService` used by cart writes.
- raw stock is never treated as an alternate commercial availability rule.

## Business-type projection

The same canonical data is projected with business vocabulary only:

| Business type | Catalog | Item | Option |
| --- | --- | --- | --- |
| `restaurant` | cardápio | item | adicional |
| `gas` | catálogo | produto | opção de vasilhame |
| `generic_commerce` | catálogo | produto | opção |

Projection does not change product truth or pricing.

## Promotions and timezone

Promotion activity remains owned by `PromotionService`, including weekday, date window and overnight behavior. The adapter does not reimplement promotion calendar rules.

## Rollout

The adapter declares `intelligence_canonical_catalog` and remains in `shadow` mode for INT-05. Legacy WhatsApp ordering is not switched by this PR. A later rollout may compare legacy and canonical outputs under that flag before canary/global activation.

## Marketplace and printing boundaries

PedeAqui catalog/prices remain independent from iFood/other marketplace prices. INT-05 does not synchronize or overwrite marketplace catalog data and does not change external-order authority.

KDS, printing configuration, print-agent routing and order-print payloads are untouched by this adapter.
