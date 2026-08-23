-- PedeAqui — PA-PUBLIC-UX-002 / #751
-- Seleção por quantidade em grupos de opções, de forma append-only e compatível
-- com os grupos legados (radio/checkbox) e snapshots já persistidos.

alter table public.modifier_groups
  add column if not exists selection_mode text not null default 'distinct_choices';

alter table public.cart_item_modifiers
  add column if not exists quantity integer not null default 1;

alter table public.order_item_modifiers
  add column if not exists quantity integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'modifier_groups_selection_mode_check') then
    alter table public.modifier_groups
      add constraint modifier_groups_selection_mode_check
      check (selection_mode in ('distinct_choices','quantity_per_option'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cart_item_modifiers_quantity_check') then
    alter table public.cart_item_modifiers
      add constraint cart_item_modifiers_quantity_check
      check (quantity between 1 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_item_modifiers_quantity_check') then
    alter table public.order_item_modifiers
      add constraint order_item_modifiers_quantity_check
      check (quantity between 1 and 100);
  end if;
end $$;

-- A leitura pública passa a informar explicitamente a semântica do grupo.
create or replace function private.get_public_product(p_store_slug text, p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.stores%rowtype;
  p public.products%rowtype;
  settings jsonb;
  hours jsonb;
  groups_json jsonb;
begin
  select * into s
  from public.stores
  where lower(slug) = lower(trim(p_store_slug))
    and status in ('active', 'temporarily_closed')
  limit 1;
  if s.id is null then return null; end if;

  select jsonb_build_object(
    'active', coalesce(ms.active, true),
    'accepting_orders', coalesce(ms.accepting_orders, true),
    'pause_reason', ms.pause_reason
  ) into settings
  from (select 1) x
  left join public.store_menu_settings ms on ms.store_id = s.id;
  if coalesce((settings->>'active')::boolean, true) = false then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'weekday', h.weekday,
    'opens_at', to_char(h.opens_at, 'HH24:MI'),
    'closes_at', to_char(h.closes_at, 'HH24:MI'),
    'closes_next_day', h.closes_next_day
  ) order by h.weekday, h.sort_order, h.opens_at), '[]'::jsonb)
  into hours
  from public.store_hours h
  where h.store_id = s.id and h.active = true;

  select * into p
  from public.products
  where id = p_product_id
    and organization_id = s.organization_id
    and store_id = s.id
    and active = true
    and availability <> 'inactive'
    and deleted_at is null;
  if p.id is null then return null; end if;

  select coalesce(jsonb_agg(group_obj order by group_sort, group_name), '[]'::jsonb)
  into groups_json
  from (
    select pmg.sort_order group_sort, g.name group_name,
      jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'description', g.description,
        'min_selection', g.min_selection,
        'max_selection', g.max_selection,
        'required', g.required,
        'selection_mode', coalesce(g.selection_mode, 'distinct_choices'),
        'modifiers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', m.id,
            'name', m.name,
            'price_cents', m.price_cents
          ) order by m.sort_order, m.name)
          from public.modifiers m
          where m.modifier_group_id = g.id
            and m.organization_id = s.organization_id
            and m.store_id = s.id
            and m.active = true
            and m.deleted_at is null
        ), '[]'::jsonb)
      ) group_obj
    from public.product_modifier_groups pmg
    join public.modifier_groups g
      on g.id = pmg.modifier_group_id
      and g.organization_id = pmg.organization_id
      and g.store_id = pmg.store_id
    where pmg.product_id = p.id
      and pmg.organization_id = s.organization_id
      and pmg.store_id = s.id
      and g.active = true
      and g.deleted_at is null
  ) q;

  return jsonb_build_object(
    'store', jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'slug', s.slug,
      'status', s.status,
      'timezone', s.timezone,
      'business_type', coalesce(s.business_type, 'restaurant')
    ),
    'settings', settings,
    'hours', hours,
    'product', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description', p.description,
      'image_url', p.image_url,
      'price_cents', p.price_cents,
      'promotional_price_cents', p.promotional_price_cents,
      'preparation_time_minutes', p.preparation_time_minutes,
      'availability', p.availability,
      'modifier_groups', groups_json
    )
  );
end;
$$;

-- Carrinho padrão: cada snapshot pode carregar quantidade da opção.
create or replace function public.cart_add_item_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_product_id uuid,
  p_product_name text,
  p_product_image_url text,
  p_unit_base_price_cents integer,
  p_quantity integer,
  p_note text,
  p_modifiers jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cart_id uuid;
  v_item_id uuid;
  v_modifier_total bigint := 0;
  v_unit_total bigint;
  v_line_total bigint;
  v_modifier jsonb;
  v_subtotal bigint;
  v_modifier_quantity integer;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid cart token hash'; end if;
  if p_quantity < 1 or p_quantity > 99 then raise exception 'invalid quantity'; end if;
  if p_unit_base_price_cents < 0 then raise exception 'invalid price'; end if;
  if jsonb_typeof(coalesce(p_modifiers, '[]'::jsonb)) <> 'array' then raise exception 'invalid modifiers'; end if;

  insert into public.carts (organization_id, store_id, token_hash, expires_at)
  values (p_organization_id, p_store_id, p_token_hash, p_expires_at)
  on conflict (token_hash) do update
    set expires_at = greatest(public.carts.expires_at, excluded.expires_at), updated_at = now()
    where public.carts.organization_id = excluded.organization_id
      and public.carts.store_id = excluded.store_id
      and public.carts.status = 'active'
  returning id into v_cart_id;

  if v_cart_id is null then
    select id into v_cart_id from public.carts
    where token_hash = p_token_hash and organization_id = p_organization_id and store_id = p_store_id and status = 'active';
  end if;
  if v_cart_id is null then raise exception 'cart unavailable'; end if;

  select coalesce(sum(
    (m->>'unit_price_cents')::bigint * coalesce(nullif(m->>'quantity','')::integer, 1)
  ), 0)
  into v_modifier_total
  from jsonb_array_elements(coalesce(p_modifiers, '[]'::jsonb)) m;

  if v_modifier_total < 0 or v_modifier_total > 2147483647 then raise exception 'modifier total out of range'; end if;
  v_unit_total := p_unit_base_price_cents::bigint + v_modifier_total;
  if v_unit_total < 0 or v_unit_total > 2147483647 then raise exception 'unit total out of range'; end if;
  v_line_total := v_unit_total * p_quantity;

  insert into public.cart_items (
    organization_id, store_id, cart_id, product_id, product_name_snapshot, product_image_url_snapshot,
    quantity, note, unit_base_price_cents, unit_modifiers_price_cents, unit_total_price_cents, line_total_cents
  ) values (
    p_organization_id, p_store_id, v_cart_id, p_product_id, p_product_name, p_product_image_url,
    p_quantity, nullif(trim(p_note), ''), p_unit_base_price_cents, v_modifier_total::integer, v_unit_total::integer, v_line_total
  ) returning id into v_item_id;

  for v_modifier in select value from jsonb_array_elements(coalesce(p_modifiers, '[]'::jsonb)) loop
    v_modifier_quantity := coalesce(nullif(v_modifier->>'quantity','')::integer, 1);
    if v_modifier_quantity < 1 or v_modifier_quantity > 100 then raise exception 'invalid modifier quantity'; end if;
    insert into public.cart_item_modifiers (
      organization_id, store_id, cart_item_id, modifier_group_id, modifier_id,
      group_name_snapshot, modifier_name_snapshot, unit_price_cents, quantity
    ) values (
      p_organization_id, p_store_id, v_item_id,
      (v_modifier->>'group_id')::uuid,
      (v_modifier->>'modifier_id')::uuid,
      v_modifier->>'group_name',
      v_modifier->>'modifier_name',
      (v_modifier->>'unit_price_cents')::integer,
      v_modifier_quantity
    );
  end loop;

  select coalesce(sum(line_total_cents), 0) into v_subtotal
  from public.cart_items where cart_id = v_cart_id and validation_status = 'valid';

  update public.carts
  set subtotal_cents = v_subtotal,
      total_cents = greatest(0, v_subtotal - discount_cents + delivery_fee_cents),
      last_validated_at = now(), updated_at = now()
  where id = v_cart_id;

  return jsonb_build_object('cart_id', v_cart_id, 'item_id', v_item_id, 'subtotal_cents', v_subtotal);
end;
$$;

-- Carrinho de Gás preserva todo o contrato segmentado e apenas passa a respeitar
-- a quantidade dos modificadores tradicionais quando um produto possuir ambos.
create or replace function public.cart_add_gas_item_internal(
  p_organization_id uuid,p_store_id uuid,p_token_hash text,p_expires_at timestamptz,p_product_id uuid,p_product_name text,p_product_image_url text,
  p_unit_base_price_cents integer,p_quantity integer,p_note text,p_modifiers jsonb,p_sale_mode text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_cart_id uuid; v_item_id uuid; v_modifier_total bigint:=0; v_segment_total integer:=0; v_unit_total bigint; v_line_total bigint;
  v_modifier jsonb; v_subtotal bigint; v_profile public.product_gas_profiles%rowtype; v_type public.gas_container_types%rowtype; v_modifier_quantity integer;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid cart token hash'; end if;
  if p_quantity<1 or p_quantity>99 then raise exception 'invalid quantity'; end if;
  if p_unit_base_price_cents<0 then raise exception 'invalid price'; end if;
  if p_sale_mode not in ('exchange','with_container') then raise exception 'invalid gas sale mode'; end if;
  if jsonb_typeof(coalesce(p_modifiers,'[]'::jsonb))<>'array' then raise exception 'invalid modifiers'; end if;
  if not exists(select 1 from public.stores s where s.id=p_store_id and s.organization_id=p_organization_id and s.business_type='gas') then raise exception 'gas profile required'; end if;
  if not exists(select 1 from public.store_modules sm where sm.organization_id=p_organization_id and sm.store_id=p_store_id and sm.module_key='gas_containers' and sm.enabled) then raise exception 'gas container module unavailable'; end if;
  select * into v_profile from public.product_gas_profiles p where p.organization_id=p_organization_id and p.store_id=p_store_id and p.product_id=p_product_id and p.active;
  if v_profile.product_id is null then raise exception 'gas product profile unavailable'; end if;
  if p_sale_mode='exchange' and not v_profile.exchange_enabled then raise exception 'exchange is unavailable for product'; end if;
  if p_sale_mode='with_container' and not v_profile.container_sale_enabled then raise exception 'container sale is unavailable for product'; end if;
  select * into v_type from public.gas_container_types t where t.organization_id=p_organization_id and t.store_id=p_store_id and t.id=v_profile.container_type_id and t.active;
  if v_type.id is null then raise exception 'container type unavailable'; end if;
  v_segment_total:=case when p_sale_mode='with_container' then v_profile.container_surcharge_cents else 0 end;

  insert into public.carts(organization_id,store_id,token_hash,expires_at) values(p_organization_id,p_store_id,p_token_hash,p_expires_at)
  on conflict(token_hash) do update set expires_at=greatest(public.carts.expires_at,excluded.expires_at),updated_at=now()
  where public.carts.organization_id=excluded.organization_id and public.carts.store_id=excluded.store_id and public.carts.status='active'
  returning id into v_cart_id;
  if v_cart_id is null then select id into v_cart_id from public.carts where token_hash=p_token_hash and organization_id=p_organization_id and store_id=p_store_id and status='active'; end if;
  if v_cart_id is null then raise exception 'cart unavailable'; end if;
  select coalesce(sum((m->>'unit_price_cents')::bigint*coalesce(nullif(m->>'quantity','')::integer,1)),0) into v_modifier_total from jsonb_array_elements(coalesce(p_modifiers,'[]'::jsonb)) m;
  if v_modifier_total<0 or v_modifier_total>2147483647 then raise exception 'modifier total out of range'; end if;
  v_unit_total:=p_unit_base_price_cents::bigint+v_modifier_total+v_segment_total;
  if v_unit_total<0 or v_unit_total>2147483647 then raise exception 'unit total out of range'; end if;
  v_line_total:=v_unit_total*p_quantity;
  insert into public.cart_items(organization_id,store_id,cart_id,product_id,product_name_snapshot,product_image_url_snapshot,quantity,note,unit_base_price_cents,unit_modifiers_price_cents,unit_segment_price_cents,unit_total_price_cents,line_total_cents)
  values(p_organization_id,p_store_id,v_cart_id,p_product_id,p_product_name,p_product_image_url,p_quantity,nullif(trim(p_note),''),p_unit_base_price_cents,v_modifier_total::integer,v_segment_total,v_unit_total::integer,v_line_total)
  returning id into v_item_id;
  for v_modifier in select value from jsonb_array_elements(coalesce(p_modifiers,'[]'::jsonb)) loop
    v_modifier_quantity:=coalesce(nullif(v_modifier->>'quantity','')::integer,1);
    if v_modifier_quantity<1 or v_modifier_quantity>100 then raise exception 'invalid modifier quantity'; end if;
    insert into public.cart_item_modifiers(organization_id,store_id,cart_item_id,modifier_group_id,modifier_id,group_name_snapshot,modifier_name_snapshot,unit_price_cents,quantity)
    values(p_organization_id,p_store_id,v_item_id,(v_modifier->>'group_id')::uuid,(v_modifier->>'modifier_id')::uuid,v_modifier->>'group_name',v_modifier->>'modifier_name',(v_modifier->>'unit_price_cents')::integer,v_modifier_quantity);
  end loop;
  insert into public.cart_item_gas_options(organization_id,store_id,cart_item_id,container_type_id,sale_mode,container_code_snapshot,container_name_snapshot,unit_container_price_cents)
  values(p_organization_id,p_store_id,v_item_id,v_type.id,p_sale_mode,v_type.code,v_type.name,v_segment_total);
  select coalesce(sum(line_total_cents),0) into v_subtotal from public.cart_items where cart_id=v_cart_id and validation_status='valid';
  update public.carts set subtotal_cents=v_subtotal,total_cents=greatest(0,v_subtotal-discount_cents+delivery_fee_cents),last_validated_at=now(),updated_at=now() where id=v_cart_id;
  return jsonb_build_object('cart_id',v_cart_id,'item_id',v_item_id,'subtotal_cents',v_subtotal);
end $$;

-- Repricing preserva quantity no snapshot em vez de reconstruir tudo como 1.
create or replace function public.cart_apply_reprice_internal(
  p_store_id uuid, p_token_hash text, p_updates jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_cart_id uuid;
  u jsonb;
  m jsonb;
  v_subtotal bigint;
  v_invalid integer;
begin
  if jsonb_typeof(coalesce(p_updates,'[]'::jsonb)) <> 'array' then raise exception 'invalid updates'; end if;
  select id into v_cart_id from public.carts where store_id=p_store_id and token_hash=p_token_hash and status='active' and expires_at>now() for update;
  if v_cart_id is null then raise exception 'cart unavailable'; end if;

  for u in select value from jsonb_array_elements(coalesce(p_updates,'[]'::jsonb)) loop
    update public.cart_items
    set product_name_snapshot = coalesce(u->>'product_name', product_name_snapshot),
        product_image_url_snapshot = case when u ? 'product_image_url' then nullif(u->>'product_image_url','') else product_image_url_snapshot end,
        unit_base_price_cents = coalesce((u->>'unit_base_price_cents')::integer, unit_base_price_cents),
        unit_modifiers_price_cents = coalesce((u->>'unit_modifiers_price_cents')::integer, unit_modifiers_price_cents),
        unit_segment_price_cents = coalesce((u->>'unit_segment_price_cents')::integer, unit_segment_price_cents),
        unit_total_price_cents = coalesce((u->>'unit_total_price_cents')::integer, unit_total_price_cents),
        line_total_cents = coalesce((u->>'line_total_cents')::bigint, line_total_cents),
        validation_status = (u->>'validation_status'),
        price_changed_at = case when coalesce((u->>'price_changed')::boolean,false) then now() else price_changed_at end,
        updated_at = now()
    where id=(u->>'item_id')::uuid and cart_id=v_cart_id;

    if u ? 'unit_segment_price_cents' then
      update public.cart_item_gas_options
      set unit_container_price_cents=(u->>'unit_segment_price_cents')::integer
      where cart_item_id=(u->>'item_id')::uuid;
    end if;

    if u ? 'modifiers' and (u->>'validation_status') = 'valid' then
      delete from public.cart_item_modifiers where cart_item_id=(u->>'item_id')::uuid;
      for m in select value from jsonb_array_elements(u->'modifiers') loop
        insert into public.cart_item_modifiers(
          organization_id, store_id, cart_item_id, modifier_group_id, modifier_id,
          group_name_snapshot, modifier_name_snapshot, unit_price_cents, quantity
        )
        select ci.organization_id, ci.store_id, ci.id,
          (m->>'group_id')::uuid,(m->>'modifier_id')::uuid,m->>'group_name',m->>'modifier_name',(m->>'unit_price_cents')::integer,
          coalesce(nullif(m->>'quantity','')::integer,1)
        from public.cart_items ci where ci.id=(u->>'item_id')::uuid and ci.cart_id=v_cart_id;
      end loop;
    end if;
  end loop;

  select coalesce(sum(line_total_cents),0) into v_subtotal from public.cart_items where cart_id=v_cart_id and validation_status='valid';
  select count(*) into v_invalid from public.cart_items where cart_id=v_cart_id and validation_status<>'valid';
  update public.carts set subtotal_cents=v_subtotal,total_cents=greatest(0,v_subtotal-discount_cents+delivery_fee_cents),last_validated_at=now(),updated_at=now() where id=v_cart_id;
  return jsonb_build_object('cart_id',v_cart_id,'subtotal_cents',v_subtotal,'invalid_items',v_invalid);
end; $$;

-- Conversão para pedido mantém a quantidade como snapshot histórico.
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
  if v_existing.id is not null then return jsonb_build_object('order_id',v_existing.id,'display_number',v_existing.display_number,'created',false); end if;
  if v_cart.status<>'active' or v_cart.expires_at<=now() then raise exception 'cart unavailable'; end if;
  select * into v_checkout from public.checkout_sessions where organization_id=v_cart.organization_id and store_id=v_cart.store_id and cart_id=v_cart.id for update;
  if v_checkout.id is null or v_checkout.reviewed_at is null then raise exception 'checkout not reviewed'; end if;
  if v_cart.updated_at>v_checkout.reviewed_at then raise exception 'cart changed after review'; end if;
  if v_checkout.customer_name is null or v_checkout.customer_phone_normalized is null then raise exception 'checkout identity incomplete'; end if;
  if v_checkout.fulfillment_type is null then raise exception 'checkout fulfillment incomplete'; end if;
  if v_checkout.fulfillment_type='delivery' and v_checkout.delivery_quote_status<>'valid' then raise exception 'delivery not validated'; end if;
  if v_checkout.payment_method is null then raise exception 'checkout payment incomplete'; end if;
  if v_checkout.scheduled_for is not null and v_checkout.scheduled_for<now()+interval '10 minutes' then raise exception 'checkout schedule expired'; end if;
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

  v_growth:=private.resolve_growth_benefits(v_cart.organization_id,v_cart.store_id,v_customer_id,'digital_menu',v_cart.subtotal_cents,v_cart.coupon_id,v_cart.coupon_code_snapshot,v_cart.cashback_redeem_requested_cents,v_cart.loyalty_redeem_requested_points);
  v_discount:=(v_growth->>'discount_cents')::bigint;
  v_total:=greatest(0,v_cart.subtotal_cents-v_discount+v_cart.delivery_fee_cents);
  if v_discount<>v_cart.discount_cents or v_total<>v_cart.total_cents then raise exception 'benefits changed; review checkout again'; end if;
  if v_checkout.payment_method='cash' and v_checkout.cash_change_for_cents is not null and v_checkout.cash_change_for_cents<v_total then raise exception 'invalid cash change'; end if;

  update public.checkout_sessions set customer_id=v_customer_id,updated_at=now() where id=v_checkout.id;
  update public.carts set customer_id=v_customer_id where id=v_cart.id;
  insert into public.order_sequences(organization_id,store_id,last_number,updated_at) values(v_cart.organization_id,v_cart.store_id,1,now())
  on conflict(store_id) do update set last_number=public.order_sequences.last_number+1,updated_at=now() returning last_number into v_display_number;
  v_payment_status:=case when v_total=0 then 'paid' else 'pending' end;

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
      quantity,note,unit_base_price_cents,unit_modifiers_price_cents,unit_segment_price_cents,unit_total_price_cents,line_total_cents
    ) values (
      v_cart.organization_id,v_cart.store_id,v_order_id,v_cart_item.product_id,v_cart_item.product_name_snapshot,
      v_cart_item.product_image_url_snapshot,v_cart_item.quantity,v_cart_item.note,v_cart_item.unit_base_price_cents,
      v_cart_item.unit_modifiers_price_cents,v_cart_item.unit_segment_price_cents,v_cart_item.unit_total_price_cents,v_cart_item.line_total_cents
    ) returning id into v_order_item_id;

    insert into public.order_item_modifiers(
      organization_id,store_id,order_item_id,modifier_group_id,modifier_id,group_name_snapshot,modifier_name_snapshot,unit_price_cents,quantity
    ) select v_cart.organization_id,v_cart.store_id,v_order_item_id,m.modifier_group_id,m.modifier_id,
      m.group_name_snapshot,m.modifier_name_snapshot,m.unit_price_cents,m.quantity
    from public.cart_item_modifiers m where m.cart_item_id=v_cart_item.id order by m.created_at,m.id;

    insert into public.order_item_gas_options(
      organization_id,store_id,order_item_id,container_type_id,sale_mode,container_code_snapshot,container_name_snapshot,unit_container_price_cents
    ) select v_cart.organization_id,v_cart.store_id,v_order_item_id,g.container_type_id,g.sale_mode,
      g.container_code_snapshot,g.container_name_snapshot,g.unit_container_price_cents
    from public.cart_item_gas_options g where g.cart_item_id=v_cart_item.id;
  end loop;

  insert into public.order_state_history(organization_id,store_id,order_id,state_domain,from_state,to_state,source)
  values
    (v_cart.organization_id,v_cart.store_id,v_order_id,'order',null,'pending_confirmation','checkout'),
    (v_cart.organization_id,v_cart.store_id,v_order_id,'payment',null,v_payment_status,'checkout'),
    (v_cart.organization_id,v_cart.store_id,v_order_id,'production',null,'pending_confirmation','checkout'),
    (v_cart.organization_id,v_cart.store_id,v_order_id,'fulfillment',null,'pending','checkout');
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at)
  values(v_cart.organization_id,v_cart.store_id,'order.created','order',v_order_id,
    jsonb_build_object('display_number',v_display_number,'channel','digital_menu','fulfillment_type',v_checkout.fulfillment_type,'subtotal_cents',v_cart.subtotal_cents,'discount_cents',v_discount,'total_cents',v_total),'pending',0,now());
  update public.carts set status='converted',updated_at=now() where id=v_cart.id;
  return jsonb_build_object('order_id',v_order_id,'display_number',v_display_number,'created',true);
end;
$$;

-- Impressão também preserva a montagem (ex.: 5x Coxinha, 2x Kibe).
create or replace function private.print_order_items_payload(p_order_id uuid, p_station_id uuid, p_filter_station boolean)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'order_item_id', oi.id,
      'product_id', oi.product_id,
      'name', oi.product_name_snapshot,
      'quantity', oi.quantity,
      'note', oi.note,
      'unit_total_cents', oi.unit_total_price_cents,
      'line_total_cents', oi.line_total_cents,
      'modifiers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'group', oim.group_name_snapshot,
          'name', oim.modifier_name_snapshot,
          'unit_price_cents', oim.unit_price_cents,
          'quantity', oim.quantity
        ) order by oim.created_at)
        from public.order_item_modifiers oim
        where oim.order_item_id = oi.id
      ), '[]'::jsonb)
    ) order by oi.created_at
  ), '[]'::jsonb)
  from public.order_items oi
  where oi.order_id = p_order_id
    and (
      not p_filter_station
      or exists (
        select 1 from public.product_production_stations pps
        where pps.organization_id = oi.organization_id
          and pps.store_id = oi.store_id
          and pps.product_id = oi.product_id
          and pps.station_id = p_station_id
      )
    );
$$;

-- Mantém as mesmas fronteiras privadas definidas pelas migrations anteriores.
revoke all on function public.cart_add_item_internal(uuid,uuid,text,timestamptz,uuid,text,text,integer,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.cart_add_item_internal(uuid,uuid,text,timestamptz,uuid,text,text,integer,integer,text,jsonb) to service_role;
revoke all on function public.cart_add_gas_item_internal(uuid,uuid,text,timestamptz,uuid,text,text,integer,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.cart_add_gas_item_internal(uuid,uuid,text,timestamptz,uuid,text,text,integer,integer,text,jsonb,text) to service_role;
revoke all on function public.cart_apply_reprice_internal(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cart_apply_reprice_internal(uuid,text,jsonb) to service_role;
revoke all on function public.create_order_from_checkout_internal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_order_from_checkout_internal(uuid,text,text) to service_role;
revoke all on function private.print_order_items_payload(uuid,uuid,boolean) from public,anon,authenticated;
