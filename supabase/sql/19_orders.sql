-- PedeAqui — bloco [047]–[057]
-- Motor de pedidos com estados separados, snapshots, histórico, outbox e realtime interno.

create table if not exists public.order_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid primary key,
  last_number bigint not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now(),
  constraint order_sequences_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete cascade
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  source_cart_id uuid not null,
  checkout_session_id uuid not null,
  public_access_token_hash text not null check (public_access_token_hash ~ '^[0-9a-f]{64}$'),
  display_number bigint not null check (display_number > 0),
  channel text not null default 'digital_menu'
    check (channel in ('digital_menu','pdv','counter','waiter','table_qr','whatsapp','api','manual','ifood')),
  fulfillment_type text not null check (fulfillment_type in ('delivery','pickup','counter','table')),

  order_status text not null default 'pending_confirmation'
    check (order_status in ('pending_confirmation','confirmed','rejected','canceled','completed')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending','authorized','paid','failed','partially_refunded','refunded')),
  production_status text not null default 'pending_confirmation'
    check (production_status in ('pending_confirmation','queued','preparing','ready','canceled','not_required')),
  fulfillment_status text not null default 'pending'
    check (fulfillment_status in ('pending','awaiting_assignment','assigned','picked_up','out_for_delivery','delivered','awaiting_pickup','picked_up_by_customer','served','canceled','not_required')),

  customer_id uuid,
  customer_name_snapshot text not null check (char_length(trim(customer_name_snapshot)) between 2 and 120),
  customer_phone_snapshot text not null,
  customer_email_snapshot text,

  address_postal_code_snapshot text,
  address_street_snapshot text,
  address_number_snapshot text,
  address_complement_snapshot text,
  address_district_snapshot text,
  address_city_snapshot text,
  address_state_snapshot text check (address_state_snapshot is null or address_state_snapshot ~ '^[A-Z]{2}$'),
  address_reference_snapshot text,

  subtotal_cents bigint not null check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  delivery_fee_cents bigint not null default 0 check (delivery_fee_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  payment_method_snapshot text not null check (payment_method_snapshot in ('cash','pix','credit_card','debit_card')),
  cash_change_for_cents bigint check (cash_change_for_cents is null or cash_change_for_cents >= 0),
  delivery_estimated_min_minutes integer check (delivery_estimated_min_minutes is null or delivery_estimated_min_minutes between 0 and 1440),
  delivery_estimated_max_minutes integer check (delivery_estimated_max_minutes is null or delivery_estimated_max_minutes between 0 and 1440),

  confirmed_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  canceled_by uuid references auth.users(id) on delete set null,
  cancel_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_store_same_org_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id) on delete restrict,
  constraint orders_customer_same_org_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete set null (customer_id),
  constraint orders_source_cart_fk
    foreign key (organization_id, store_id, source_cart_id)
    references public.carts (organization_id, store_id, id) on delete restrict,
  constraint orders_checkout_fk
    foreign key (organization_id, store_id, checkout_session_id)
    references public.checkout_sessions (organization_id, store_id, id) on delete restrict,
  constraint orders_source_cart_unique unique (source_cart_id),
  constraint orders_checkout_unique unique (checkout_session_id),
  constraint orders_store_display_unique unique (store_id, display_number),
  constraint orders_org_store_id_unique unique (organization_id, store_id, id),
  constraint orders_total_consistency check (
    total_cents = greatest(0, subtotal_cents - discount_cents + delivery_fee_cents)
  ),
  constraint orders_cash_change_consistency check (
    payment_method_snapshot = 'cash' or cash_change_for_cents is null
  ),
  constraint orders_delivery_address_consistency check (
    fulfillment_type <> 'delivery'
    or (address_street_snapshot is not null and address_number_snapshot is not null and address_district_snapshot is not null and address_city_snapshot is not null and address_state_snapshot is not null)
  )
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  order_id uuid not null,
  product_id uuid,
  product_name_snapshot text not null,
  product_image_url_snapshot text,
  quantity integer not null check (quantity between 1 and 999),
  note text,
  unit_base_price_cents integer not null check (unit_base_price_cents >= 0),
  unit_modifiers_price_cents integer not null default 0 check (unit_modifiers_price_cents >= 0),
  unit_total_price_cents integer not null check (unit_total_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  created_at timestamptz not null default now(),
  constraint order_items_order_same_store_fk
    foreign key (organization_id, store_id, order_id)
    references public.orders (organization_id, store_id, id) on delete cascade,
  constraint order_items_product_same_store_fk
    foreign key (organization_id, store_id, product_id)
    references public.products (organization_id, store_id, id) on delete set null (product_id),
  constraint order_items_org_store_id_unique unique (organization_id, store_id, id),
  constraint order_items_unit_total_consistency check (unit_total_price_cents = unit_base_price_cents + unit_modifiers_price_cents),
  constraint order_items_line_total_consistency check (line_total_cents = unit_total_price_cents::bigint * quantity)
);

create table if not exists public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  order_item_id uuid not null,
  modifier_group_id uuid,
  modifier_id uuid,
  group_name_snapshot text not null,
  modifier_name_snapshot text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now(),
  constraint order_item_modifiers_item_same_store_fk
    foreign key (organization_id, store_id, order_item_id)
    references public.order_items (organization_id, store_id, id) on delete cascade,
  constraint order_item_modifiers_group_same_store_fk
    foreign key (organization_id, store_id, modifier_group_id)
    references public.modifier_groups (organization_id, store_id, id) on delete set null (modifier_group_id),
  constraint order_item_modifiers_modifier_same_store_fk
    foreign key (organization_id, store_id, modifier_id)
    references public.modifiers (organization_id, store_id, id) on delete set null (modifier_id)
);

create table if not exists public.order_state_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  order_id uuid not null,
  state_domain text not null check (state_domain in ('order','payment','production','fulfillment')),
  from_state text,
  to_state text not null,
  reason text,
  source text not null default 'system' check (source in ('system','checkout','panel','pdv','integration','automation')),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint order_state_history_order_same_store_fk
    foreign key (organization_id, store_id, order_id)
    references public.orders (organization_id, store_id, id) on delete cascade
);

create index if not exists orders_store_created_idx on public.orders (organization_id, store_id, created_at desc);
create index if not exists orders_store_status_idx on public.orders (organization_id, store_id, order_status, created_at desc);
create index if not exists orders_customer_idx on public.orders (organization_id, customer_id, created_at desc) where customer_id is not null;
create index if not exists orders_public_access_idx on public.orders (id, public_access_token_hash);
create index if not exists order_items_order_idx on public.order_items (organization_id, store_id, order_id);
create index if not exists order_item_modifiers_item_idx on public.order_item_modifiers (organization_id, store_id, order_item_id);
create index if not exists order_state_history_order_idx on public.order_state_history (organization_id, store_id, order_id, created_at);

alter table public.order_sequences enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_modifiers enable row level security;
alter table public.order_state_history enable row level security;

revoke all on table public.order_sequences from anon, authenticated;
grant select, insert, update, delete on table public.order_sequences to service_role;

revoke all on table public.orders from anon, authenticated;
grant select on table public.orders to authenticated;
grant select, insert, update, delete on table public.orders to service_role;

revoke all on table public.order_items from anon, authenticated;
grant select on table public.order_items to authenticated;
grant select, insert, update, delete on table public.order_items to service_role;

revoke all on table public.order_item_modifiers from anon, authenticated;
grant select on table public.order_item_modifiers to authenticated;
grant select, insert, update, delete on table public.order_item_modifiers to service_role;

revoke all on table public.order_state_history from anon, authenticated;
grant select on table public.order_state_history to authenticated;
grant select, insert, update, delete on table public.order_state_history to service_role;

create policy orders_view on public.orders for select to authenticated
using (private.has_permission(organization_id, store_id, 'orders.view'));

create policy order_items_view on public.order_items for select to authenticated
using (private.has_permission(organization_id, store_id, 'orders.view'));

create policy order_item_modifiers_view on public.order_item_modifiers for select to authenticated
using (private.has_permission(organization_id, store_id, 'orders.view'));

create policy order_state_history_view on public.order_state_history for select to authenticated
using (private.has_permission(organization_id, store_id, 'orders.view'));

-- Conversão transacional e idempotente checkout -> pedido.
create or replace function public.create_order_from_checkout_internal(
  p_store_id uuid,
  p_token_hash text
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
begin
  select * into v_cart
  from public.carts
  where store_id = p_store_id and token_hash = p_token_hash
  for update;

  if v_cart.id is null then raise exception 'cart unavailable'; end if;

  select * into v_existing from public.orders where source_cart_id = v_cart.id;
  if v_existing.id is not null then
    return jsonb_build_object('order_id', v_existing.id, 'display_number', v_existing.display_number, 'created', false);
  end if;

  if v_cart.status <> 'active' or v_cart.expires_at <= now() then raise exception 'cart unavailable'; end if;

  select * into v_checkout
  from public.checkout_sessions
  where organization_id = v_cart.organization_id and store_id = v_cart.store_id and cart_id = v_cart.id
  for update;

  if v_checkout.id is null or v_checkout.reviewed_at is null then raise exception 'checkout not reviewed'; end if;
  if v_cart.updated_at > v_checkout.reviewed_at then raise exception 'cart changed after review'; end if;
  if v_checkout.customer_name is null or v_checkout.customer_phone_normalized is null then raise exception 'checkout identity incomplete'; end if;
  if v_checkout.fulfillment_type is null then raise exception 'checkout fulfillment incomplete'; end if;
  if v_checkout.fulfillment_type = 'delivery' and v_checkout.delivery_quote_status <> 'valid' then raise exception 'delivery not validated'; end if;
  if v_checkout.payment_method is null then raise exception 'checkout payment incomplete'; end if;
  if v_checkout.payment_method = 'cash' and v_checkout.cash_change_for_cents is not null and v_checkout.cash_change_for_cents < v_cart.total_cents then raise exception 'invalid cash change'; end if;
  if exists (select 1 from public.cart_items where cart_id = v_cart.id and validation_status <> 'valid') then raise exception 'cart contains invalid items'; end if;
  if not exists (select 1 from public.cart_items where cart_id = v_cart.id) then raise exception 'cart is empty'; end if;

  v_customer_id := v_checkout.customer_id;
  if v_customer_id is null then
    insert into public.customers (
      organization_id, name, phone, phone_normalized, email, created_at, updated_at
    ) values (
      v_cart.organization_id, v_checkout.customer_name, v_checkout.customer_phone,
      v_checkout.customer_phone_normalized, v_checkout.customer_email, now(), now()
    )
    on conflict (organization_id, phone_normalized)
      where phone_normalized is not null and deleted_at is null
    do update set
      phone = excluded.phone,
      email = coalesce(public.customers.email, excluded.email),
      updated_at = now()
    returning id into v_customer_id;
  end if;

  update public.checkout_sessions set customer_id = v_customer_id, updated_at = now() where id = v_checkout.id;
  update public.carts set customer_id = v_customer_id where id = v_cart.id;

  insert into public.order_sequences (organization_id, store_id, last_number, updated_at)
  values (v_cart.organization_id, v_cart.store_id, 1, now())
  on conflict (store_id) do update
    set last_number = public.order_sequences.last_number + 1,
        updated_at = now()
  returning last_number into v_display_number;

  insert into public.orders (
    organization_id, store_id, source_cart_id, checkout_session_id, public_access_token_hash,
    display_number, channel, fulfillment_type,
    order_status, payment_status, production_status, fulfillment_status,
    customer_id, customer_name_snapshot, customer_phone_snapshot, customer_email_snapshot,
    address_postal_code_snapshot, address_street_snapshot, address_number_snapshot,
    address_complement_snapshot, address_district_snapshot, address_city_snapshot,
    address_state_snapshot, address_reference_snapshot,
    subtotal_cents, discount_cents, delivery_fee_cents, total_cents,
    payment_method_snapshot, cash_change_for_cents,
    delivery_estimated_min_minutes, delivery_estimated_max_minutes
  ) values (
    v_cart.organization_id, v_cart.store_id, v_cart.id, v_checkout.id, p_token_hash,
    v_display_number, 'digital_menu', v_checkout.fulfillment_type,
    'pending_confirmation', 'pending', 'pending_confirmation', 'pending',
    v_customer_id, v_checkout.customer_name, v_checkout.customer_phone, v_checkout.customer_email,
    v_checkout.address_postal_code, v_checkout.address_street, v_checkout.address_number,
    v_checkout.address_complement, v_checkout.address_district, v_checkout.address_city,
    v_checkout.address_state, v_checkout.address_reference,
    v_cart.subtotal_cents, v_cart.discount_cents, v_cart.delivery_fee_cents, v_cart.total_cents,
    v_checkout.payment_method, v_checkout.cash_change_for_cents,
    v_checkout.delivery_estimated_min_minutes, v_checkout.delivery_estimated_max_minutes
  ) returning id into v_order_id;

  for v_cart_item in
    select * from public.cart_items where cart_id = v_cart.id order by created_at, id
  loop
    insert into public.order_items (
      organization_id, store_id, order_id, product_id,
      product_name_snapshot, product_image_url_snapshot, quantity, note,
      unit_base_price_cents, unit_modifiers_price_cents, unit_total_price_cents, line_total_cents
    ) values (
      v_cart.organization_id, v_cart.store_id, v_order_id, v_cart_item.product_id,
      v_cart_item.product_name_snapshot, v_cart_item.product_image_url_snapshot,
      v_cart_item.quantity, v_cart_item.note,
      v_cart_item.unit_base_price_cents, v_cart_item.unit_modifiers_price_cents,
      v_cart_item.unit_total_price_cents, v_cart_item.line_total_cents
    ) returning id into v_order_item_id;

    insert into public.order_item_modifiers (
      organization_id, store_id, order_item_id, modifier_group_id, modifier_id,
      group_name_snapshot, modifier_name_snapshot, unit_price_cents
    )
    select
      v_cart.organization_id, v_cart.store_id, v_order_item_id,
      m.modifier_group_id, m.modifier_id, m.group_name_snapshot,
      m.modifier_name_snapshot, m.unit_price_cents
    from public.cart_item_modifiers m
    where m.cart_item_id = v_cart_item.id
    order by m.created_at, m.id;
  end loop;

  insert into public.order_state_history (organization_id, store_id, order_id, state_domain, from_state, to_state, source)
  values
    (v_cart.organization_id, v_cart.store_id, v_order_id, 'order', null, 'pending_confirmation', 'checkout'),
    (v_cart.organization_id, v_cart.store_id, v_order_id, 'payment', null, 'pending', 'checkout'),
    (v_cart.organization_id, v_cart.store_id, v_order_id, 'production', null, 'pending_confirmation', 'checkout'),
    (v_cart.organization_id, v_cart.store_id, v_order_id, 'fulfillment', null, 'pending', 'checkout');

  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at
  ) values (
    v_cart.organization_id, v_cart.store_id, 'order.created', 'order', v_order_id,
    jsonb_build_object(
      'display_number', v_display_number,
      'channel', 'digital_menu',
      'fulfillment_type', v_checkout.fulfillment_type,
      'total_cents', v_cart.total_cents
    ),
    'pending', 0, now()
  );

  update public.carts set status = 'converted', updated_at = now() where id = v_cart.id;

  return jsonb_build_object('order_id', v_order_id, 'display_number', v_display_number, 'created', true);
end;
$$;

revoke all on function public.create_order_from_checkout_internal(uuid,text) from public, anon, authenticated;
grant execute on function public.create_order_from_checkout_internal(uuid,text) to service_role;

-- State machine central: valida + atualiza + histórico + evento na mesma transação.
create or replace function public.order_transition_internal(
  p_order_id uuid,
  p_domain text,
  p_to_state text,
  p_reason text default null,
  p_actor_user_id uuid default null,
  p_source text default 'system'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_from text;
  v_allowed boolean := false;
  v_event_type text;
begin
  if p_domain not in ('order','payment','production','fulfillment') then raise exception 'invalid state domain'; end if;
  if p_source not in ('system','checkout','panel','pdv','integration','automation') then raise exception 'invalid source'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order not found'; end if;

  if p_domain = 'order' then
    v_from := v_order.order_status;
    v_allowed :=
      (v_from = 'pending_confirmation' and p_to_state in ('confirmed','rejected','canceled')) or
      (v_from = 'confirmed' and p_to_state in ('completed','canceled'));
    if p_to_state = 'completed' and v_order.fulfillment_status not in ('delivered','picked_up_by_customer','served','not_required') then
      raise exception 'fulfillment is not complete';
    end if;
    if p_to_state = 'canceled' and coalesce(length(trim(p_reason)),0) < 3 then raise exception 'cancel reason required'; end if;
  elsif p_domain = 'payment' then
    v_from := v_order.payment_status;
    v_allowed :=
      (v_from = 'pending' and p_to_state in ('authorized','paid','failed')) or
      (v_from = 'authorized' and p_to_state in ('paid','failed')) or
      (v_from = 'failed' and p_to_state = 'pending') or
      (v_from = 'paid' and p_to_state in ('partially_refunded','refunded')) or
      (v_from = 'partially_refunded' and p_to_state = 'refunded');
  elsif p_domain = 'production' then
    v_from := v_order.production_status;
    v_allowed :=
      (v_from = 'pending_confirmation' and p_to_state in ('queued','canceled','not_required')) or
      (v_from = 'queued' and p_to_state in ('preparing','canceled')) or
      (v_from = 'preparing' and p_to_state in ('ready','canceled')) or
      (v_from = 'ready' and p_to_state = 'canceled');
  else
    v_from := v_order.fulfillment_status;
    v_allowed :=
      (v_from = 'pending' and p_to_state in ('awaiting_assignment','awaiting_pickup','served','canceled','not_required')) or
      (v_from = 'awaiting_assignment' and p_to_state in ('assigned','canceled')) or
      (v_from = 'assigned' and p_to_state in ('picked_up','canceled')) or
      (v_from = 'picked_up' and p_to_state in ('out_for_delivery','canceled')) or
      (v_from = 'out_for_delivery' and p_to_state = 'delivered') or
      (v_from = 'awaiting_pickup' and p_to_state in ('picked_up_by_customer','canceled'));
  end if;

  if p_to_state = v_from then
    return jsonb_build_object('order_id', v_order.id, 'domain', p_domain, 'from', v_from, 'to', p_to_state, 'changed', false);
  end if;
  if not v_allowed then raise exception 'invalid transition: % % -> %', p_domain, v_from, p_to_state; end if;

  if p_domain = 'order' then
    update public.orders set
      order_status = p_to_state,
      confirmed_at = case when p_to_state = 'confirmed' then now() else confirmed_at end,
      completed_at = case when p_to_state = 'completed' then now() else completed_at end,
      canceled_at = case when p_to_state = 'canceled' then now() else canceled_at end,
      canceled_by = case when p_to_state = 'canceled' then p_actor_user_id else canceled_by end,
      cancel_reason = case when p_to_state = 'canceled' then trim(p_reason) else cancel_reason end,
      updated_at = now()
    where id = p_order_id;
  elsif p_domain = 'payment' then
    update public.orders set payment_status = p_to_state, updated_at = now() where id = p_order_id;
  elsif p_domain = 'production' then
    update public.orders set production_status = p_to_state, updated_at = now() where id = p_order_id;
  else
    update public.orders set fulfillment_status = p_to_state, updated_at = now() where id = p_order_id;
  end if;

  insert into public.order_state_history (
    organization_id, store_id, order_id, state_domain, from_state, to_state, reason, source, actor_user_id
  ) values (
    v_order.organization_id, v_order.store_id, v_order.id, p_domain, v_from, p_to_state,
    nullif(trim(coalesce(p_reason,'')),''), p_source, p_actor_user_id
  );

  v_event_type := p_domain || '.' || p_to_state;
  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at, created_by
  ) values (
    v_order.organization_id, v_order.store_id, v_event_type, 'order', v_order.id,
    jsonb_build_object('display_number', v_order.display_number, 'from', v_from, 'to', p_to_state, 'domain', p_domain),
    'pending', 0, now(), p_actor_user_id
  );

  return jsonb_build_object('order_id', v_order.id, 'domain', p_domain, 'from', v_from, 'to', p_to_state, 'changed', true);
end;
$$;

revoke all on function public.order_transition_internal(uuid,text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.order_transition_internal(uuid,text,text,text,uuid,text) to service_role;

-- Realtime interno: Postgres Changes somente para tabelas protegidas por RLS.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
    ) then
      alter publication supabase_realtime add table public.orders;
    end if;
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_state_history'
    ) then
      alter publication supabase_realtime add table public.order_state_history;
    end if;
  end if;
end $$;
