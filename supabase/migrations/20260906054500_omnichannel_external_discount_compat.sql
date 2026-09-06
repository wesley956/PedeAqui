-- Omnichannel compatibility with the existing Growth discount ledger (#936/#937/#947).
-- Keep orders.discount_cents as the total discount already consumed by UI/finance/reporting,
-- while making the external-channel share explicit instead of misclassifying it as a
-- PedeAqui coupon/cashback/loyalty benefit.

alter table public.orders
  add column if not exists external_discount_cents bigint
  generated always as (
    case
      when channel in ('ifood','99food') then discount_cents
      else 0::bigint
    end
  ) stored;

alter table public.orders
  drop constraint if exists orders_growth_nonnegative,
  add constraint orders_growth_nonnegative check (
    coupon_discount_cents >= 0
    and cashback_discount_cents >= 0
    and loyalty_redeemed_points >= 0
    and loyalty_discount_cents >= 0
    and external_discount_cents >= 0
  ),
  drop constraint if exists orders_growth_discount_consistency,
  add constraint orders_growth_discount_consistency check (
    discount_cents = coupon_discount_cents
      + cashback_discount_cents
      + loyalty_discount_cents
      + external_discount_cents
  );

comment on column public.orders.external_discount_cents is
  'Derived share of the total order discount owned by an external sales channel. Native PedeAqui benefit ledgers remain unchanged.';