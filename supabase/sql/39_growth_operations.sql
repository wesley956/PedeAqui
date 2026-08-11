-- PedeAqui — bloco [140]–[151]
-- Operações atômicas de benefícios, integração com checkout e consumidor de order.completed.

alter table public.carts
  add column if not exists coupon_id uuid,
  add column if not exists coupon_code_snapshot text,
  add column if not exists coupon_discount_cents bigint not null default 0,
  add column if not exists cashback_redeem_requested_cents bigint not null default 0,
  add column if not exists cashback_discount_cents bigint not null default 0,
  add column if not exists loyalty_redeem_requested_points bigint not null default 0,
  add column if not exists loyalty_discount_cents bigint not null default 0;

alter table public.carts
  drop constraint if exists carts_growth_nonnegative,
  add constraint carts_growth_nonnegative check (
    coupon_discount_cents >= 0
    and cashback_redeem_requested_cents >= 0
    and cashback_discount_cents >= 0
    and loyalty_redeem_requested_points >= 0
    and loyalty_discount_cents >= 0
  ),
  drop constraint if exists carts_growth_discount_consistency,
  add constraint carts_growth_discount_consistency check (
    discount_cents = coupon_discount_cents + cashback_discount_cents + loyalty_discount_cents
  ),
  drop constraint if exists carts_coupon_same_store_fk,
  add constraint carts_coupon_same_store_fk
    foreign key (organization_id, store_id, coupon_id)
    references public.coupons (organization_id, store_id, id) on delete set null (coupon_id);

alter table public.orders
  add column if not exists coupon_id uuid,
  add column if not exists coupon_code_snapshot text,
  add column if not exists coupon_discount_cents bigint not null default 0,
  add column if not exists cashback_discount_cents bigint not null default 0,
  add column if not exists loyalty_redeemed_points bigint not null default 0,
  add column if not exists loyalty_discount_cents bigint not null default 0;

alter table public.orders
  drop constraint if exists orders_growth_nonnegative,
  add constraint orders_growth_nonnegative check (
    coupon_discount_cents >= 0
    and cashback_discount_cents >= 0
    and loyalty_redeemed_points >= 0
    and loyalty_discount_cents >= 0
  ),
  drop constraint if exists orders_growth_discount_consistency,
  add constraint orders_growth_discount_consistency check (
    discount_cents = coupon_discount_cents + cashback_discount_cents + loyalty_discount_cents
  ),
  drop constraint if exists orders_coupon_same_store_fk,
  add constraint orders_coupon_same_store_fk
    foreign key (organization_id, store_id, coupon_id)
    references public.coupons (organization_id, store_id, id) on delete set null (coupon_id);

create index if not exists carts_coupon_idx on public.carts (organization_id, store_id, coupon_id) where coupon_id is not null;
create index if not exists orders_coupon_idx on public.orders (organization_id, store_id, coupon_id) where coupon_id is not null;

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  coupon_id uuid not null,
  customer_id uuid not null,
  order_id uuid not null,
  status text not null default 'reserved' check (status in ('reserved','consumed','released')),
  discount_cents bigint not null check (discount_cents > 0),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  constraint coupon_redemptions_coupon_same_store_fk
    foreign key (organization_id, store_id, coupon_id)
    references public.coupons (organization_id, store_id, id) on delete restrict,
  constraint coupon_redemptions_customer_same_org_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict,
  constraint coupon_redemptions_order_same_store_fk
    foreign key (organization_id, store_id, order_id)
    references public.orders (organization_id, store_id, id) on delete cascade,
  constraint coupon_redemptions_order_unique unique (order_id),
  constraint coupon_redemptions_status_times check (
    (status <> 'consumed' or consumed_at is not null)
    and (status <> 'released' or released_at is not null)
  )
);

create index if not exists coupon_redemptions_coupon_status_idx
  on public.coupon_redemptions (organization_id, store_id, coupon_id, status, created_at);
create index if not exists coupon_redemptions_customer_idx
  on public.coupon_redemptions (organization_id, customer_id, coupon_id, status, created_at);

alter table public.coupon_redemptions enable row level security;
revoke all on table public.coupon_redemptions from anon, authenticated;
grant select on table public.coupon_redemptions to authenticated;
grant select, insert, update on table public.coupon_redemptions to service_role;

create policy coupon_redemptions_view on public.coupon_redemptions
for select to authenticated
using (private.has_permission(organization_id, store_id, 'growth.view'));

create or replace function private.post_cashback_transaction(
  p_organization_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_order_id uuid,
  p_transaction_type text,
  p_amount_cents bigint,
  p_idempotency_key text,
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null
) returns public.cashback_transactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account public.cashback_accounts%rowtype;
  v_existing public.cashback_transactions%rowtype;
  v_transaction public.cashback_transactions%rowtype;
  v_balance bigint;
begin
  if p_transaction_type not in ('earn','redeem','expire','adjustment','reversal') then
    raise exception 'invalid cashback transaction type';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 then raise exception 'invalid cashback amount'; end if;
  if p_transaction_type = 'earn' and p_amount_cents < 0 then raise exception 'earn must be positive'; end if;
  if p_transaction_type in ('redeem','expire') and p_amount_cents > 0 then raise exception 'debit must be negative'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) < 8 then raise exception 'invalid cashback idempotency key'; end if;

  select * into v_existing
  from public.cashback_transactions
  where organization_id = p_organization_id and idempotency_key = trim(p_idempotency_key);
  if v_existing.id is not null then return v_existing; end if;

  insert into public.cashback_accounts (organization_id, store_id, customer_id)
  values (p_organization_id, p_store_id, p_customer_id)
  on conflict (store_id, customer_id) do nothing;

  select * into v_account
  from public.cashback_accounts
  where organization_id = p_organization_id
    and store_id = p_store_id
    and customer_id = p_customer_id
  for update;
  if v_account.id is null then raise exception 'cashback account unavailable'; end if;

  select * into v_existing
  from public.cashback_transactions
  where organization_id = p_organization_id and idempotency_key = trim(p_idempotency_key);
  if v_existing.id is not null then return v_existing; end if;

  v_balance := v_account.balance_cents + p_amount_cents;
  if v_balance < 0 then raise exception 'insufficient cashback balance'; end if;

  update public.cashback_accounts set
    balance_cents = v_balance,
    lifetime_earned_cents = lifetime_earned_cents + case when p_transaction_type = 'earn' then p_amount_cents else 0 end,
    lifetime_redeemed_cents = lifetime_redeemed_cents + case when p_transaction_type = 'redeem' then -p_amount_cents else 0 end,
    version = version + 1,
    updated_at = now()
  where id = v_account.id;

  insert into public.cashback_transactions (
    organization_id, store_id, account_id, customer_id, order_id,
    transaction_type, amount_cents, balance_after_cents, idempotency_key,
    expires_at, metadata, actor_user_id
  ) values (
    p_organization_id, p_store_id, v_account.id, p_customer_id, p_order_id,
    p_transaction_type, p_amount_cents, v_balance, trim(p_idempotency_key),
    p_expires_at, coalesce(p_metadata,'{}'::jsonb), p_actor_user_id
  ) returning * into v_transaction;

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at, created_by
  ) values (
    p_organization_id, p_store_id, 'growth.cashback_' || p_transaction_type, 'cashback_transaction', v_transaction.id,
    jsonb_build_object('customer_id',p_customer_id,'order_id',p_order_id,'amount_cents',p_amount_cents,'balance_cents',v_balance),
    'pending',0,now(),p_actor_user_id
  );

  return v_transaction;
end;
$$;
revoke all on function private.post_cashback_transaction(uuid,uuid,uuid,uuid,text,bigint,text,timestamptz,jsonb,uuid) from public, anon, authenticated;

create or replace function private.post_loyalty_transaction(
  p_organization_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_order_id uuid,
  p_transaction_type text,
  p_points bigint,
  p_idempotency_key text,
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null
) returns public.loyalty_transactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account public.loyalty_accounts%rowtype;
  v_existing public.loyalty_transactions%rowtype;
  v_transaction public.loyalty_transactions%rowtype;
  v_balance bigint;
begin
  if p_transaction_type not in ('earn','redeem','expire','adjustment','reversal') then
    raise exception 'invalid loyalty transaction type';
  end if;
  if p_points is null or p_points = 0 then raise exception 'invalid loyalty points'; end if;
  if p_transaction_type = 'earn' and p_points < 0 then raise exception 'earn must be positive'; end if;
  if p_transaction_type in ('redeem','expire') and p_points > 0 then raise exception 'debit must be negative'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) < 8 then raise exception 'invalid loyalty idempotency key'; end if;

  select * into v_existing
  from public.loyalty_transactions
  where organization_id = p_organization_id and idempotency_key = trim(p_idempotency_key);
  if v_existing.id is not null then return v_existing; end if;

  insert into public.loyalty_accounts (organization_id, store_id, customer_id)
  values (p_organization_id, p_store_id, p_customer_id)
  on conflict (store_id, customer_id) do nothing;

  select * into v_account
  from public.loyalty_accounts
  where organization_id = p_organization_id
    and store_id = p_store_id
    and customer_id = p_customer_id
  for update;
  if v_account.id is null then raise exception 'loyalty account unavailable'; end if;

  select * into v_existing
  from public.loyalty_transactions
  where organization_id = p_organization_id and idempotency_key = trim(p_idempotency_key);
  if v_existing.id is not null then return v_existing; end if;

  v_balance := v_account.balance_points + p_points;
  if v_balance < 0 then raise exception 'insufficient loyalty balance'; end if;

  update public.loyalty_accounts set
    balance_points = v_balance,
    lifetime_earned_points = lifetime_earned_points + case when p_transaction_type = 'earn' then p_points else 0 end,
    lifetime_redeemed_points = lifetime_redeemed_points + case when p_transaction_type = 'redeem' then -p_points else 0 end,
    version = version + 1,
    updated_at = now()
  where id = v_account.id;

  insert into public.loyalty_transactions (
    organization_id, store_id, account_id, customer_id, order_id,
    transaction_type, points, balance_after_points, idempotency_key,
    expires_at, metadata, actor_user_id
  ) values (
    p_organization_id, p_store_id, v_account.id, p_customer_id, p_order_id,
    p_transaction_type, p_points, v_balance, trim(p_idempotency_key),
    p_expires_at, coalesce(p_metadata,'{}'::jsonb), p_actor_user_id
  ) returning * into v_transaction;

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at, created_by
  ) values (
    p_organization_id, p_store_id, 'growth.loyalty_' || p_transaction_type, 'loyalty_transaction', v_transaction.id,
    jsonb_build_object('customer_id',p_customer_id,'order_id',p_order_id,'points',p_points,'balance_points',v_balance),
    'pending',0,now(),p_actor_user_id
  );

  return v_transaction;
end;
$$;
revoke all on function private.post_loyalty_transaction(uuid,uuid,uuid,uuid,text,bigint,text,timestamptz,jsonb,uuid) from public, anon, authenticated;

create or replace function private.resolve_growth_benefits(
  p_organization_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_channel text,
  p_subtotal_cents bigint,
  p_coupon_id uuid default null,
  p_coupon_code text default null,
  p_cashback_requested_cents bigint default 0,
  p_loyalty_requested_points bigint default 0
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_coupon public.coupons%rowtype;
  v_settings public.store_growth_settings%rowtype;
  v_cashback public.cashback_accounts%rowtype;
  v_loyalty public.loyalty_accounts%rowtype;
  v_coupon_discount bigint := 0;
  v_cashback_discount bigint := 0;
  v_loyalty_discount bigint := 0;
  v_total_uses bigint := 0;
  v_customer_uses bigint := 0;
  v_remaining bigint;
begin
  if p_subtotal_cents is null or p_subtotal_cents < 0 then raise exception 'invalid growth subtotal'; end if;
  if p_cashback_requested_cents < 0 or p_loyalty_requested_points < 0 then raise exception 'invalid benefit request'; end if;

  select * into v_settings
  from public.store_growth_settings
  where organization_id = p_organization_id and store_id = p_store_id;

  if p_coupon_id is not null or nullif(trim(coalesce(p_coupon_code,'')),'') is not null then
    select * into v_coupon
    from public.coupons c
    where c.organization_id = p_organization_id
      and c.store_id = p_store_id
      and c.deleted_at is null
      and (
        (p_coupon_id is not null and c.id = p_coupon_id)
        or (p_coupon_id is null and lower(c.code) = lower(trim(p_coupon_code)))
      )
    for update;

    if v_coupon.id is null then raise exception 'coupon not found'; end if;
    if not v_coupon.active then raise exception 'coupon inactive'; end if;
    if v_coupon.valid_from > now() or (v_coupon.valid_until is not null and v_coupon.valid_until <= now()) then
      raise exception 'coupon outside validity window';
    end if;
    if not (p_channel = any(v_coupon.allowed_channels)) then raise exception 'coupon unavailable for channel'; end if;
    if p_subtotal_cents < v_coupon.minimum_order_cents then raise exception 'coupon minimum order not reached'; end if;

    select count(*)::bigint into v_total_uses
    from public.coupon_redemptions r
    where r.organization_id = p_organization_id
      and r.store_id = p_store_id
      and r.coupon_id = v_coupon.id
      and r.status in ('reserved','consumed');
    if v_coupon.usage_limit_total is not null and v_total_uses >= v_coupon.usage_limit_total then
      raise exception 'coupon usage limit reached';
    end if;

    if v_coupon.usage_limit_per_customer is not null then
      if p_customer_id is null then raise exception 'customer identification required for coupon'; end if;
      select count(*)::bigint into v_customer_uses
      from public.coupon_redemptions r
      where r.organization_id = p_organization_id
        and r.customer_id = p_customer_id
        and r.coupon_id = v_coupon.id
        and r.status in ('reserved','consumed');
      if v_customer_uses >= v_coupon.usage_limit_per_customer then
        raise exception 'customer coupon usage limit reached';
      end if;
    end if;

    if v_coupon.discount_type = 'fixed' then
      v_coupon_discount := least(v_coupon.fixed_discount_cents, p_subtotal_cents);
    else
      v_coupon_discount := floor(p_subtotal_cents::numeric * v_coupon.percentage_bps::numeric / 10000)::bigint;
      if v_coupon.max_discount_cents is not null then
        v_coupon_discount := least(v_coupon_discount, v_coupon.max_discount_cents);
      end if;
      v_coupon_discount := least(v_coupon_discount, p_subtotal_cents);
    end if;
  end if;

  v_remaining := greatest(0, p_subtotal_cents - v_coupon_discount);

  if p_cashback_requested_cents > 0 then
    if p_customer_id is null then raise exception 'customer identification required for cashback'; end if;
    if v_settings.store_id is null or not v_settings.cashback_enabled then raise exception 'cashback redemption disabled'; end if;
    select * into v_cashback
    from public.cashback_accounts
    where organization_id = p_organization_id and store_id = p_store_id and customer_id = p_customer_id
    for update;
    if v_cashback.id is null or v_cashback.balance_cents < p_cashback_requested_cents then
      raise exception 'insufficient cashback balance';
    end if;
    if p_cashback_requested_cents > v_remaining then raise exception 'cashback exceeds merchandise balance'; end if;
    v_cashback_discount := p_cashback_requested_cents;
  end if;

  v_remaining := greatest(0, v_remaining - v_cashback_discount);

  if p_loyalty_requested_points > 0 then
    if p_customer_id is null then raise exception 'customer identification required for loyalty'; end if;
    if v_settings.store_id is null or not v_settings.loyalty_enabled then raise exception 'loyalty redemption disabled'; end if;
    select * into v_loyalty
    from public.loyalty_accounts
    where organization_id = p_organization_id and store_id = p_store_id and customer_id = p_customer_id
    for update;
    if v_loyalty.id is null or v_loyalty.balance_points < p_loyalty_requested_points then
      raise exception 'insufficient loyalty balance';
    end if;
    v_loyalty_discount := p_loyalty_requested_points * v_settings.loyalty_redeem_cents_per_point::bigint;
    if v_loyalty_discount > v_remaining then raise exception 'loyalty redemption exceeds merchandise balance'; end if;
  end if;

  return jsonb_build_object(
    'coupon_id', v_coupon.id,
    'coupon_code', case when v_coupon.id is null then null else v_coupon.code end,
    'coupon_discount_cents', v_coupon_discount,
    'cashback_discount_cents', v_cashback_discount,
    'loyalty_redeemed_points', p_loyalty_requested_points,
    'loyalty_discount_cents', v_loyalty_discount,
    'discount_cents', v_coupon_discount + v_cashback_discount + v_loyalty_discount
  );
end;
$$;
revoke all on function private.resolve_growth_benefits(uuid,uuid,uuid,text,bigint,uuid,text,bigint,bigint) from public, anon, authenticated;

create or replace function public.growth_set_cart_benefits_internal(
  p_store_id uuid,
  p_token_hash text,
  p_coupon_code text default null,
  p_cashback_redeem_cents bigint default 0,
  p_loyalty_redeem_points bigint default 0
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cart public.carts%rowtype;
  v_growth jsonb;
  v_discount bigint;
  v_total bigint;
begin
  select * into v_cart
  from public.carts
  where store_id = p_store_id
    and token_hash = p_token_hash
    and status = 'active'
    and expires_at > now()
  for update;
  if v_cart.id is null then raise exception 'cart unavailable'; end if;

  v_growth := private.resolve_growth_benefits(
    v_cart.organization_id, v_cart.store_id, v_cart.customer_id, 'digital_menu', v_cart.subtotal_cents,
    null, nullif(trim(coalesce(p_coupon_code,'')),''),
    coalesce(p_cashback_redeem_cents,0), coalesce(p_loyalty_redeem_points,0)
  );
  v_discount := (v_growth->>'discount_cents')::bigint;
  v_total := greatest(0, v_cart.subtotal_cents - v_discount + v_cart.delivery_fee_cents);

  update public.carts set
    coupon_id = nullif(v_growth->>'coupon_id','')::uuid,
    coupon_code_snapshot = nullif(v_growth->>'coupon_code',''),
    coupon_discount_cents = (v_growth->>'coupon_discount_cents')::bigint,
    cashback_redeem_requested_cents = coalesce(p_cashback_redeem_cents,0),
    cashback_discount_cents = (v_growth->>'cashback_discount_cents')::bigint,
    loyalty_redeem_requested_points = coalesce(p_loyalty_redeem_points,0),
    loyalty_discount_cents = (v_growth->>'loyalty_discount_cents')::bigint,
    discount_cents = v_discount,
    total_cents = v_total,
    updated_at = now()
  where id = v_cart.id;

  return v_growth || jsonb_build_object(
    'cart_id',v_cart.id,
    'subtotal_cents',v_cart.subtotal_cents,
    'delivery_fee_cents',v_cart.delivery_fee_cents,
    'total_cents',v_total
  );
end;
$$;
revoke all on function public.growth_set_cart_benefits_internal(uuid,text,text,bigint,bigint) from public, anon, authenticated;
grant execute on function public.growth_set_cart_benefits_internal(uuid,text,text,bigint,bigint) to service_role;

create or replace function public.growth_clear_cart_benefits_internal(
  p_store_id uuid,
  p_token_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_cart public.carts%rowtype;
begin
  select * into v_cart from public.carts
  where store_id=p_store_id and token_hash=p_token_hash and status='active' and expires_at>now()
  for update;
  if v_cart.id is null then raise exception 'cart unavailable'; end if;

  update public.carts set
    coupon_id=null,
    coupon_code_snapshot=null,
    coupon_discount_cents=0,
    cashback_redeem_requested_cents=0,
    cashback_discount_cents=0,
    loyalty_redeem_requested_points=0,
    loyalty_discount_cents=0,
    discount_cents=0,
    total_cents=subtotal_cents + delivery_fee_cents,
    updated_at=now()
  where id=v_cart.id;

  return jsonb_build_object('cart_id',v_cart.id,'discount_cents',0,'total_cents',v_cart.subtotal_cents+v_cart.delivery_fee_cents);
end;
$$;
revoke all on function public.growth_clear_cart_benefits_internal(uuid,text) from public, anon, authenticated;
grant execute on function public.growth_clear_cart_benefits_internal(uuid,text) to service_role;

create or replace function private.apply_order_growth_after_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.coupon_id is not null and new.coupon_discount_cents > 0 then
    insert into public.coupon_redemptions (
      organization_id,store_id,coupon_id,customer_id,order_id,status,discount_cents
    ) values (
      new.organization_id,new.store_id,new.coupon_id,new.customer_id,new.id,'reserved',new.coupon_discount_cents
    ) on conflict (order_id) do nothing;
  end if;

  if new.cashback_discount_cents > 0 then
    perform private.post_cashback_transaction(
      new.organization_id,new.store_id,new.customer_id,new.id,'redeem',-new.cashback_discount_cents,
      'order:'||new.id::text||':cashback:redeem',null,jsonb_build_object('source','order_discount'),new.created_by
    );
  end if;

  if new.loyalty_redeemed_points > 0 then
    perform private.post_loyalty_transaction(
      new.organization_id,new.store_id,new.customer_id,new.id,'redeem',-new.loyalty_redeemed_points,
      'order:'||new.id::text||':loyalty:redeem',null,jsonb_build_object('discount_cents',new.loyalty_discount_cents),new.created_by
    );
  end if;
  return new;
end;
$$;
revoke all on function private.apply_order_growth_after_insert() from public, anon, authenticated;
drop trigger if exists orders_apply_growth_after_insert on public.orders;
create trigger orders_apply_growth_after_insert
after insert on public.orders
for each row execute function private.apply_order_growth_after_insert();

create or replace function private.on_order_growth_status_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.order_status is not distinct from new.order_status then return new; end if;

  if new.order_status = 'confirmed' then
    update public.coupon_redemptions set status='consumed',consumed_at=coalesce(consumed_at,now())
    where order_id=new.id and status='reserved';
  elsif new.order_status in ('canceled','rejected') then
    update public.coupon_redemptions set status='released',released_at=coalesce(released_at,now())
    where order_id=new.id and status in ('reserved','consumed');

    if new.customer_id is not null and new.cashback_discount_cents > 0 then
      perform private.post_cashback_transaction(
        new.organization_id,new.store_id,new.customer_id,new.id,'reversal',new.cashback_discount_cents,
        'order:'||new.id::text||':cashback:redeem:reversal',null,
        jsonb_build_object('reason',new.order_status),new.canceled_by
      );
    end if;

    if new.customer_id is not null and new.loyalty_redeemed_points > 0 then
      perform private.post_loyalty_transaction(
        new.organization_id,new.store_id,new.customer_id,new.id,'reversal',new.loyalty_redeemed_points,
        'order:'||new.id::text||':loyalty:redeem:reversal',null,
        jsonb_build_object('reason',new.order_status),new.canceled_by
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.on_order_growth_status_change() from public, anon, authenticated;
drop trigger if exists orders_growth_status_change on public.orders;
create trigger orders_growth_status_change
after update of order_status on public.orders
for each row execute function private.on_order_growth_status_change();

create or replace function private.on_completed_order_growth()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settings public.store_growth_settings%rowtype;
  v_eligible bigint;
  v_cashback bigint;
  v_points bigint;
  v_expiry timestamptz;
begin
  if new.order_status <> 'completed' or old.order_status is not distinct from new.order_status or new.customer_id is null then
    return new;
  end if;

  select * into v_settings
  from public.store_growth_settings
  where organization_id=new.organization_id and store_id=new.store_id;
  if v_settings.store_id is null then return new; end if;

  v_eligible := greatest(0,new.subtotal_cents-new.discount_cents);

  if v_settings.cashback_enabled and v_settings.cashback_rate_bps > 0 and v_eligible >= v_settings.cashback_min_order_cents then
    v_cashback := floor(v_eligible::numeric*v_settings.cashback_rate_bps::numeric/10000)::bigint;
    if v_cashback > 0 then
      v_expiry := case when v_settings.cashback_expiry_days is null then null else now() + make_interval(days=>v_settings.cashback_expiry_days) end;
      perform private.post_cashback_transaction(
        new.organization_id,new.store_id,new.customer_id,new.id,'earn',v_cashback,
        'order:'||new.id::text||':cashback:earn',v_expiry,
        jsonb_build_object('eligible_spend_cents',v_eligible,'rate_bps',v_settings.cashback_rate_bps),new.created_by
      );
    end if;
  end if;

  if v_settings.loyalty_enabled and v_settings.loyalty_spend_cents_per_point > 0 then
    v_points := floor(v_eligible::numeric/v_settings.loyalty_spend_cents_per_point::numeric)::bigint;
    if v_points > 0 then
      perform private.post_loyalty_transaction(
        new.organization_id,new.store_id,new.customer_id,new.id,'earn',v_points,
        'order:'||new.id::text||':loyalty:earn',null,
        jsonb_build_object('eligible_spend_cents',v_eligible,'spend_cents_per_point',v_settings.loyalty_spend_cents_per_point),new.created_by
      );
    end if;
  end if;

  return new;
end;
$$;
revoke all on function private.on_completed_order_growth() from public, anon, authenticated;
drop trigger if exists orders_growth_after_completion on public.orders;
create trigger orders_growth_after_completion
after update of order_status on public.orders
for each row
when (new.order_status='completed' and old.order_status is distinct from 'completed')
execute function private.on_completed_order_growth();

-- Total zero por benefício não gera payment de R$0; o próprio pedido nasce liquidado.
create or replace function private.seed_order_payment_intent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare v_source text; v_suffix text;
begin
  if new.total_cents = 0 or new.channel in ('pdv','waiter','table_qr') or new.payment_method_snapshot is null then return new; end if;
  v_source := case when new.channel='digital_menu' then 'checkout' else 'system' end;
  v_suffix := case when new.channel='digital_menu' then 'checkout' else new.channel end;
  insert into public.payments (
    organization_id,store_id,order_id,method,status,amount_cents,cash_tendered_cents,idempotency_key,source,metadata
  ) values (
    new.organization_id,new.store_id,new.id,new.payment_method_snapshot,'pending',new.total_cents,
    case when new.payment_method_snapshot='cash' then new.cash_change_for_cents else null end,
    'order:'||new.id::text||':'||v_suffix||':payment:1',v_source,
    jsonb_build_object('seeded_from_order',true,'channel',new.channel)
  ) on conflict (organization_id,idempotency_key) do nothing;
  return new;
end;
$$;
revoke all on function private.seed_order_payment_intent() from public, anon, authenticated;

-- Conversão checkout -> pedido, agora com revalidação de benefícios sob lock.
create or replace function public.create_order_from_checkout_internal(
  p_store_id uuid,
  p_token_hash text,
  p_order_access_token_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cart public.carts%rowtype;
  v_checkout public.checkout_sessions%rowtype;
  v_existing public.orders%rowtype;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_item_id uuid;
  v_display_number bigint;
  v_cart_item public.cart_items%rowtype;
  v_growth jsonb;
  v_discount bigint;
  v_total bigint;
  v_payment_status text;
begin
  if p_order_access_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid order access token hash'; end if;

  select * into v_cart from public.carts where store_id=p_store_id and token_hash=p_token_hash for update;
  if v_cart.id is null then raise exception 'cart unavailable'; end if;

  select * into v_existing from public.orders where source_cart_id=v_cart.id;
  if v_existing.id is not null then
    return jsonb_build_object('order_id',v_existing.id,'display_number',v_existing.display_number,'created',false);
  end if;
  if v_cart.status<>'active' or v_cart.expires_at<=now() then raise exception 'cart unavailable'; end if;

  select * into v_checkout from public.checkout_sessions
  where organization_id=v_cart.organization_id and store_id=v_cart.store_id and cart_id=v_cart.id
  for update;
  if v_checkout.id is null or v_checkout.reviewed_at is null then raise exception 'checkout not reviewed'; end if;
  if v_cart.updated_at>v_checkout.reviewed_at then raise exception 'cart changed after review'; end if;
  if v_checkout.customer_name is null or v_checkout.customer_phone_normalized is null then raise exception 'checkout identity incomplete'; end if;
  if v_checkout.fulfillment_type is null then raise exception 'checkout fulfillment incomplete'; end if;
  if v_checkout.fulfillment_type='delivery' and v_checkout.delivery_quote_status<>'valid' then raise exception 'delivery not validated'; end if;
  if v_checkout.payment_method is null then raise exception 'checkout payment incomplete'; end if;
  if exists(select 1 from public.cart_items where cart_id=v_cart.id and validation_status<>'valid') then raise exception 'cart contains invalid items'; end if;
  if not exists(select 1 from public.cart_items where cart_id=v_cart.id) then raise exception 'cart is empty'; end if;

  v_customer_id:=v_checkout.customer_id;
  if v_customer_id is null then
    insert into public.customers(organization_id,name,phone,phone_normalized,email,created_at,updated_at)
    values(v_cart.organization_id,v_checkout.customer_name,v_checkout.customer_phone,v_checkout.customer_phone_normalized,v_checkout.customer_email,now(),now())
    on conflict(organization_id,phone_normalized) where phone_normalized is not null and deleted_at is null
    do update set phone=excluded.phone,email=coalesce(public.customers.email,excluded.email),updated_at=now()
    returning id into v_customer_id;
  end if;

  v_growth := private.resolve_growth_benefits(
    v_cart.organization_id,v_cart.store_id,v_customer_id,'digital_menu',v_cart.subtotal_cents,
    v_cart.coupon_id,v_cart.coupon_code_snapshot,v_cart.cashback_redeem_requested_cents,v_cart.loyalty_redeem_requested_points
  );
  v_discount := (v_growth->>'discount_cents')::bigint;
  v_total := greatest(0,v_cart.subtotal_cents-v_discount+v_cart.delivery_fee_cents);
  if v_discount <> v_cart.discount_cents or v_total <> v_cart.total_cents then
    raise exception 'benefits changed; review checkout again';
  end if;
  if v_checkout.payment_method='cash' and v_checkout.cash_change_for_cents is not null and v_checkout.cash_change_for_cents<v_total then
    raise exception 'invalid cash change';
  end if;

  update public.checkout_sessions set customer_id=v_customer_id,updated_at=now() where id=v_checkout.id;
  update public.carts set customer_id=v_customer_id where id=v_cart.id;

  insert into public.order_sequences(organization_id,store_id,last_number,updated_at)
  values(v_cart.organization_id,v_cart.store_id,1,now())
  on conflict(store_id) do update set last_number=public.order_sequences.last_number+1,updated_at=now()
  returning last_number into v_display_number;

  v_payment_status := case when v_total=0 then 'paid' else 'pending' end;

  insert into public.orders(
    organization_id,store_id,source_cart_id,checkout_session_id,public_access_token_hash,
    display_number,channel,fulfillment_type,order_status,payment_status,production_status,fulfillment_status,
    customer_id,customer_name_snapshot,customer_phone_snapshot,customer_email_snapshot,
    address_postal_code_snapshot,address_street_snapshot,address_number_snapshot,address_complement_snapshot,
    address_district_snapshot,address_city_snapshot,address_state_snapshot,address_reference_snapshot,
    subtotal_cents,discount_cents,delivery_fee_cents,total_cents,payment_method_snapshot,cash_change_for_cents,
    delivery_estimated_min_minutes,delivery_estimated_max_minutes,
    coupon_id,coupon_code_snapshot,coupon_discount_cents,cashback_discount_cents,loyalty_redeemed_points,loyalty_discount_cents
  ) values (
    v_cart.organization_id,v_cart.store_id,v_cart.id,v_checkout.id,p_order_access_token_hash,
    v_display_number,'digital_menu',v_checkout.fulfillment_type,'pending_confirmation',v_payment_status,'pending_confirmation','pending',
    v_customer_id,v_checkout.customer_name,v_checkout.customer_phone,v_checkout.customer_email,
    v_checkout.address_postal_code,v_checkout.address_street,v_checkout.address_number,v_checkout.address_complement,
    v_checkout.address_district,v_checkout.address_city,v_checkout.address_state,v_checkout.address_reference,
    v_cart.subtotal_cents,v_discount,v_cart.delivery_fee_cents,v_total,v_checkout.payment_method,
    case when v_total=0 then null else v_checkout.cash_change_for_cents end,
    v_checkout.delivery_estimated_min_minutes,v_checkout.delivery_estimated_max_minutes,
    nullif(v_growth->>'coupon_id','')::uuid,nullif(v_growth->>'coupon_code',''),
    (v_growth->>'coupon_discount_cents')::bigint,(v_growth->>'cashback_discount_cents')::bigint,
    (v_growth->>'loyalty_redeemed_points')::bigint,(v_growth->>'loyalty_discount_cents')::bigint
  ) returning id into v_order_id;

  for v_cart_item in select * from public.cart_items where cart_id=v_cart.id order by created_at,id loop
    insert into public.order_items(
      organization_id,store_id,order_id,product_id,product_name_snapshot,product_image_url_snapshot,
      quantity,note,unit_base_price_cents,unit_modifiers_price_cents,unit_total_price_cents,line_total_cents
    ) values (
      v_cart.organization_id,v_cart.store_id,v_order_id,v_cart_item.product_id,v_cart_item.product_name_snapshot,
      v_cart_item.product_image_url_snapshot,v_cart_item.quantity,v_cart_item.note,v_cart_item.unit_base_price_cents,
      v_cart_item.unit_modifiers_price_cents,v_cart_item.unit_total_price_cents,v_cart_item.line_total_cents
    ) returning id into v_order_item_id;

    insert into public.order_item_modifiers(
      organization_id,store_id,order_item_id,modifier_group_id,modifier_id,group_name_snapshot,modifier_name_snapshot,unit_price_cents
    ) select v_cart.organization_id,v_cart.store_id,v_order_item_id,m.modifier_group_id,m.modifier_id,
      m.group_name_snapshot,m.modifier_name_snapshot,m.unit_price_cents
    from public.cart_item_modifiers m where m.cart_item_id=v_cart_item.id order by m.created_at,m.id;
  end loop;

  insert into public.order_state_history(organization_id,store_id,order_id,state_domain,from_state,to_state,source)
  values
    (v_cart.organization_id,v_cart.store_id,v_order_id,'order',null,'pending_confirmation','checkout'),
    (v_cart.organization_id,v_cart.store_id,v_order_id,'payment',null,v_payment_status,'checkout'),
    (v_cart.organization_id,v_cart.store_id,v_order_id,'production',null,'pending_confirmation','checkout'),
    (v_cart.organization_id,v_cart.store_id,v_order_id,'fulfillment',null,'pending','checkout');

  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at)
  values(v_cart.organization_id,v_cart.store_id,'order.created','order',v_order_id,
    jsonb_build_object('display_number',v_display_number,'channel','digital_menu','fulfillment_type',v_checkout.fulfillment_type,
      'subtotal_cents',v_cart.subtotal_cents,'discount_cents',v_discount,'total_cents',v_total),
    'pending',0,now());

  update public.carts set status='converted',updated_at=now() where id=v_cart.id;
  return jsonb_build_object('order_id',v_order_id,'display_number',v_display_number,'created',true);
end;
$$;
revoke all on function public.create_order_from_checkout_internal(uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_order_from_checkout_internal(uuid,text,text) to service_role;
