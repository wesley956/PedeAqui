-- PedeAqui — token público do pedido separado do token de carrinho.
-- Mantém retries determinísticos no servidor e permite iniciar novo carrinho sem perder acompanhamento antigo.

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
begin
  if p_order_access_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid order access token hash'; end if;

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
    v_cart.organization_id, v_cart.store_id, v_cart.id, v_checkout.id, p_order_access_token_hash,
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

revoke all on function public.create_order_from_checkout_internal(uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_order_from_checkout_internal(uuid,text,text) to service_role;

revoke all on function public.create_order_from_checkout_internal(uuid,text) from public, anon, authenticated, service_role;
drop function public.create_order_from_checkout_internal(uuid,text);
