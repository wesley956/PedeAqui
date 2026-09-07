-- Omnichannel canonical external-order import (#936/#937).
-- Provider adapters hand this function a normalized snapshot only. Raw provider payloads
-- stay in the durable inbox and never become the operational order aggregate.

alter table public.orders
  add column if not exists additional_fee_cents bigint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_additional_fee_nonnegative') then
    alter table public.orders
      add constraint orders_additional_fee_nonnegative check (additional_fee_cents >= 0);
  end if;
end $$;

alter table public.orders drop constraint if exists orders_channel_check;
alter table public.orders add constraint orders_channel_check check (
  channel in ('digital_menu','pdv','counter','waiter','table_qr','whatsapp','api','manual','ifood','99food')
);

alter table public.orders drop constraint if exists orders_total_consistency;
alter table public.orders add constraint orders_total_consistency check (
  total_cents = greatest(0, subtotal_cents - discount_cents + delivery_fee_cents + additional_fee_cents)
);

-- External sales channels own their payment snapshot. Do not let the generic order trigger
-- seed a native checkout/system payment intent that could later be mistaken for a PedeAqui
-- Pix charge. PDV keeps its existing explicit payment path as well.
create or replace function private.seed_order_payment_intent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source text;
  v_suffix text;
begin
  if new.channel in ('pdv','ifood','99food') or new.total_cents <= 0 then
    return new;
  end if;

  v_source := case when new.channel = 'digital_menu' then 'checkout' else 'system' end;
  v_suffix := case when new.channel = 'digital_menu' then 'checkout' else new.channel end;

  insert into public.payments (
    organization_id, store_id, order_id, method, status, amount_cents,
    cash_tendered_cents, idempotency_key, source, metadata
  ) values (
    new.organization_id,
    new.store_id,
    new.id,
    new.payment_method_snapshot,
    'pending',
    new.total_cents,
    case when new.payment_method_snapshot = 'cash' then new.cash_change_for_cents else null end,
    'order:' || new.id::text || ':' || v_suffix || ':payment:1',
    v_source,
    jsonb_build_object('seeded_from_order', true, 'channel', new.channel)
  )
  on conflict (organization_id, idempotency_key) do nothing;
  return new;
end;
$$;
revoke all on function private.seed_order_payment_intent() from public, anon, authenticated;

create or replace function private.integration_normalize_payment_method(p_method text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when lower(coalesce(p_method,'')) like '%pix%' then 'pix'
    when lower(coalesce(p_method,'')) like '%cash%' or lower(coalesce(p_method,'')) like '%dinheiro%' then 'cash'
    when lower(coalesce(p_method,'')) like '%debit%' or lower(coalesce(p_method,'')) like '%debito%' or lower(coalesce(p_method,'')) like '%débito%' then 'debit_card'
    else 'credit_card'
  end
$$;
revoke all on function private.integration_normalize_payment_method(text) from public, anon, authenticated;

create or replace function public.integration_import_external_order(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_account_id uuid,
  p_external_event_id text,
  p_order jsonb,
  p_external_status text default null,
  p_external_revision text default null,
  p_correlation_id text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account public.integration_accounts%rowtype;
  v_merchant public.integration_merchants%rowtype;
  v_existing_link public.external_orders%rowtype;
  v_provider text;
  v_external_merchant_id text;
  v_external_order_id text;
  v_payment_owner text;
  v_logistics_owner text;
  v_order_type text;
  v_fulfillment_type text;
  v_timing text;
  v_customer_name text;
  v_customer_phone text;
  v_subtotal bigint;
  v_discount bigint;
  v_delivery_fee bigint;
  v_additional_fee bigint;
  v_total bigint;
  v_payment_total bigint;
  v_prepaid_total bigint;
  v_payment_status text;
  v_payment_method text;
  v_display_number bigint;
  v_order_id uuid;
  v_order_item_id uuid;
  v_scheduled_for timestamptz;
  v_item jsonb;
  v_modifier jsonb;
  v_payment jsonb;
  v_item_quantity integer;
  v_modifier_quantity integer;
  v_unit_base integer;
  v_unit_modifiers bigint;
  v_unit_total bigint;
  v_line_total bigint;
  v_modifier_total bigint;
  v_payment_amount bigint;
  v_payment_index integer := 0;
  v_payment_row_status text;
  v_method text;
  v_existing_display bigint;
begin
  if jsonb_typeof(coalesce(p_order,'null'::jsonb)) <> 'object' then
    raise exception 'canonical external order must be an object';
  end if;

  v_provider := lower(trim(coalesce(p_order->>'provider','')));
  v_external_merchant_id := trim(coalesce(p_order->>'externalMerchantId',''));
  v_external_order_id := trim(coalesce(p_order->>'externalOrderId',''));
  v_payment_owner := trim(coalesce(p_order->>'paymentOwner',''));
  v_logistics_owner := nullif(trim(coalesce(p_order->>'logisticsOwner','')),'');
  v_order_type := trim(coalesce(p_order->>'orderType',''));
  v_timing := trim(coalesce(p_order->>'timing',''));
  v_customer_name := trim(coalesce(p_order#>>'{customer,name}',''));
  v_customer_phone := coalesce(p_order#>>'{customer,phone}','');

  if v_provider not in ('ifood','99food') then raise exception 'unsupported external sales provider'; end if;
  if v_external_merchant_id = '' then raise exception 'external merchant id is required'; end if;
  if v_external_order_id = '' then raise exception 'external order id is required'; end if;
  if v_payment_owner not in ('pedeaqui','provider','merchant') then raise exception 'invalid payment owner'; end if;
  if v_logistics_owner is not null and v_logistics_owner not in ('pedeaqui','merchant','ifood','99food','99entrega') then
    raise exception 'invalid logistics owner';
  end if;
  if char_length(v_customer_name) < 2 or char_length(v_customer_name) > 120 then raise exception 'invalid customer name'; end if;
  if jsonb_typeof(coalesce(p_order->'items','null'::jsonb)) <> 'array' or jsonb_array_length(p_order->'items') = 0 then
    raise exception 'external order items are required';
  end if;
  if jsonb_array_length(p_order->'items') > 200 then raise exception 'too many external order items'; end if;
  if jsonb_typeof(coalesce(p_order->'payments','null'::jsonb)) <> 'array' then raise exception 'external payments must be an array'; end if;
  if jsonb_typeof(coalesce(p_order->'money','null'::jsonb)) <> 'object' then raise exception 'external money snapshot is required'; end if;

  v_subtotal := coalesce((p_order#>>'{money,subtotalCents}')::bigint,-1);
  v_discount := coalesce((p_order#>>'{money,discountCents}')::bigint,-1);
  v_delivery_fee := coalesce((p_order#>>'{money,deliveryFeeCents}')::bigint,-1);
  v_additional_fee := coalesce((p_order#>>'{money,additionalFeeCents}')::bigint,-1);
  v_total := coalesce((p_order#>>'{money,totalCents}')::bigint,-1);
  if least(v_subtotal,v_discount,v_delivery_fee,v_additional_fee,v_total) < 0 then raise exception 'negative external money value'; end if;
  if v_subtotal + v_delivery_fee + v_additional_fee - v_discount <> v_total then raise exception 'external order total invariant failed'; end if;

  select coalesce(sum((value->>'amountCents')::bigint),0),
         coalesce(sum(case when coalesce((value->>'prepaid')::boolean,false) then (value->>'amountCents')::bigint else 0 end),0)
    into v_payment_total,v_prepaid_total
  from jsonb_array_elements(p_order->'payments');
  if v_payment_total <> v_total then raise exception 'external payment total does not match order total'; end if;
  if v_total > 0 and jsonb_array_length(p_order->'payments') = 0 then raise exception 'external payment snapshot is required'; end if;
  if v_payment_owner = 'provider' and v_total > 0 and jsonb_array_length(p_order->'payments') = 0 then
    raise exception 'provider payment snapshot is required';
  end if;

  if v_order_type = 'delivery' then
    v_fulfillment_type := 'delivery';
    if jsonb_typeof(coalesce(p_order->'deliveryAddress','null'::jsonb)) <> 'object' then raise exception 'delivery address is required'; end if;
    if nullif(trim(coalesce(p_order#>>'{deliveryAddress,street}','')),'') is null
       or nullif(trim(coalesce(p_order#>>'{deliveryAddress,number}','')),'') is null
       or nullif(trim(coalesce(p_order#>>'{deliveryAddress,neighborhood}','')),'') is null
       or nullif(trim(coalesce(p_order#>>'{deliveryAddress,city}','')),'') is null
       or upper(trim(coalesce(p_order#>>'{deliveryAddress,state}',''))) !~ '^[A-Z]{2}$' then
      raise exception 'external delivery address is incomplete';
    end if;
  elsif v_order_type = 'takeout' then
    v_fulfillment_type := 'pickup';
  elsif v_order_type = 'dine_in' then
    v_fulfillment_type := 'table';
  else
    raise exception 'invalid external order type';
  end if;

  if v_timing not in ('immediate','scheduled') then raise exception 'invalid external order timing'; end if;
  if v_timing = 'scheduled' then
    if nullif(trim(coalesce(p_order->>'scheduledFor','')),'') is null then raise exception 'scheduled external order requires scheduledFor'; end if;
    v_scheduled_for := (p_order->>'scheduledFor')::timestamptz;
  else
    v_scheduled_for := null;
  end if;

  select * into v_account
  from public.integration_accounts
  where id = p_integration_account_id
    and organization_id = p_organization_id
    and provider = v_provider;
  if v_account.id is null then raise exception 'integration account scope mismatch'; end if;

  select * into v_merchant
  from public.integration_merchants
  where organization_id = p_organization_id
    and store_id = p_store_id
    and integration_account_id = p_integration_account_id
    and provider = v_provider
    and external_merchant_id = v_external_merchant_id;
  if v_merchant.id is null then raise exception 'integration merchant scope mismatch'; end if;

  if nullif(trim(coalesce(p_external_event_id,'')),'') is not null and not exists (
    select 1 from public.integration_events e
    where e.organization_id = p_organization_id
      and e.store_id = p_store_id
      and e.integration_account_id = p_integration_account_id
      and e.provider = v_provider
      and e.external_event_id = p_external_event_id
  ) then
    raise exception 'external event is not durably ingested';
  end if;

  -- Serialize imports for the same provider/account/order before checking the durable link.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_integration_account_id::text || ':' || v_external_order_id, 0)
  );

  select * into v_existing_link
  from public.external_orders
  where integration_account_id = p_integration_account_id
    and external_order_id = v_external_order_id
  for update;

  if v_existing_link.id is not null then
    if v_existing_link.organization_id <> p_organization_id or v_existing_link.store_id <> p_store_id or v_existing_link.provider <> v_provider then
      raise exception 'external order identity scope mismatch';
    end if;
    update public.external_orders
       set external_status = coalesce(p_external_status,external_status),
           external_revision = coalesce(p_external_revision,external_revision),
           last_external_event_id = coalesce(nullif(trim(coalesce(p_external_event_id,'')),''),last_external_event_id),
           last_snapshot = p_order,
           payment_owner = v_payment_owner,
           logistics_owner = v_logistics_owner,
           sync_status = 'synced',
           updated_at = now()
     where id = v_existing_link.id;
    select display_number into v_existing_display from public.orders where id = v_existing_link.order_id;
    insert into public.integration_audit_log(
      organization_id,store_id,integration_account_id,provider,capability,action,source,correlation_id,metadata
    ) values (
      p_organization_id,p_store_id,p_integration_account_id,v_provider,
      case when v_provider='ifood' then 'ifood_orders' else '99food_orders' end,
      'external_order_replayed','worker',nullif(trim(coalesce(p_correlation_id,'')),''),
      jsonb_build_object('order_id',v_existing_link.order_id,'external_order_id',v_external_order_id)
    );
    return jsonb_build_object('order_id',v_existing_link.order_id,'display_number',v_existing_display,'created',false);
  end if;

  -- Validate item arithmetic before any durable row is created. Any later exception still rolls
  -- the entire function back because the RPC runs as one PostgreSQL transaction.
  for v_item in select value from jsonb_array_elements(p_order->'items') loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'invalid external item'; end if;
    if char_length(trim(coalesce(v_item->>'name',''))) < 1 then raise exception 'external item name is required'; end if;
    v_item_quantity := coalesce((v_item->>'quantity')::integer,0);
    v_unit_base := coalesce((v_item->>'unitBasePriceCents')::integer,-1);
    v_line_total := coalesce((v_item->>'totalCents')::bigint,-1);
    if v_item_quantity < 1 or v_item_quantity > 999 or v_unit_base < 0 or v_line_total < 0 then raise exception 'invalid external item values'; end if;
    if jsonb_typeof(coalesce(v_item->'modifiers','null'::jsonb)) <> 'array' then raise exception 'external item modifiers must be an array'; end if;
    v_unit_modifiers := 0;
    for v_modifier in select value from jsonb_array_elements(v_item->'modifiers') loop
      if jsonb_typeof(v_modifier) <> 'object' then raise exception 'invalid external modifier'; end if;
      if char_length(trim(coalesce(v_modifier->>'name',''))) < 1 then raise exception 'external modifier name is required'; end if;
      v_modifier_quantity := coalesce((v_modifier->>'quantity')::integer,0);
      v_modifier_total := coalesce((v_modifier->>'totalCents')::bigint,-1);
      if v_modifier_quantity < 1 or v_modifier_quantity > 100
         or coalesce((v_modifier->>'unitPriceCents')::integer,-1) < 0
         or v_modifier_total <> (v_modifier->>'unitPriceCents')::bigint * v_modifier_quantity then
        raise exception 'external modifier total invariant failed';
      end if;
      v_unit_modifiers := v_unit_modifiers + v_modifier_total;
    end loop;
    v_unit_total := v_unit_base::bigint + v_unit_modifiers;
    if v_unit_total > 2147483647 or v_unit_modifiers > 2147483647 then raise exception 'external item unit total out of range'; end if;
    if v_line_total <> v_unit_total * v_item_quantity then raise exception 'external item total invariant failed'; end if;
  end loop;

  if (select coalesce(sum((value->>'totalCents')::bigint),0) from jsonb_array_elements(p_order->'items')) <> v_subtotal then
    raise exception 'external item subtotal does not match money snapshot';
  end if;

  insert into public.order_sequences(organization_id,store_id,last_number,updated_at)
  values(p_organization_id,p_store_id,1,now())
  on conflict(store_id) do update
    set last_number=public.order_sequences.last_number+1,updated_at=now()
  returning last_number into v_display_number;

  v_payment_status := case when v_total = 0 or v_prepaid_total = v_total then 'paid' else 'pending' end;
  v_payment_method := private.integration_normalize_payment_method(
    coalesce(p_order#>>'{payments,0,method}','external')
  );

  insert into public.orders(
    organization_id,store_id,display_number,channel,fulfillment_type,
    order_status,payment_status,production_status,fulfillment_status,
    customer_id,customer_name_snapshot,customer_phone_snapshot,customer_email_snapshot,
    address_postal_code_snapshot,address_street_snapshot,address_number_snapshot,address_complement_snapshot,
    address_district_snapshot,address_city_snapshot,address_state_snapshot,address_reference_snapshot,
    subtotal_cents,discount_cents,delivery_fee_cents,additional_fee_cents,total_cents,
    payment_method_snapshot,cash_change_for_cents,scheduled_for
  ) values (
    p_organization_id,p_store_id,v_display_number,v_provider,v_fulfillment_type,
    'pending_confirmation',v_payment_status,'pending_confirmation','pending',
    null,v_customer_name,v_customer_phone,null,
    nullif(trim(coalesce(p_order#>>'{deliveryAddress,postalCode}','')),''),
    nullif(trim(coalesce(p_order#>>'{deliveryAddress,street}','')),''),
    nullif(trim(coalesce(p_order#>>'{deliveryAddress,number}','')),''),
    nullif(trim(coalesce(p_order#>>'{deliveryAddress,complement}','')),''),
    nullif(trim(coalesce(p_order#>>'{deliveryAddress,neighborhood}','')),''),
    nullif(trim(coalesce(p_order#>>'{deliveryAddress,city}','')),''),
    nullif(upper(trim(coalesce(p_order#>>'{deliveryAddress,state}',''))),''),
    nullif(trim(coalesce(p_order#>>'{deliveryAddress,reference}','')),''),
    v_subtotal,v_discount,v_delivery_fee,v_additional_fee,v_total,
    v_payment_method,null,v_scheduled_for
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_order->'items') loop
    v_item_quantity := (v_item->>'quantity')::integer;
    v_unit_base := (v_item->>'unitBasePriceCents')::integer;
    select coalesce(sum((value->>'totalCents')::bigint),0) into v_unit_modifiers
      from jsonb_array_elements(v_item->'modifiers');
    v_unit_total := v_unit_base::bigint + v_unit_modifiers;
    v_line_total := (v_item->>'totalCents')::bigint;

    insert into public.order_items(
      organization_id,store_id,order_id,product_id,product_name_snapshot,product_image_url_snapshot,
      quantity,note,unit_base_price_cents,unit_modifiers_price_cents,unit_segment_price_cents,
      unit_total_price_cents,line_total_cents
    ) values (
      p_organization_id,p_store_id,v_order_id,null,trim(v_item->>'name'),null,
      v_item_quantity,nullif(left(trim(coalesce(v_item->>'notes','')),500),''),
      v_unit_base,v_unit_modifiers::integer,0,v_unit_total::integer,v_line_total
    ) returning id into v_order_item_id;

    for v_modifier in select value from jsonb_array_elements(v_item->'modifiers') loop
      insert into public.order_item_modifiers(
        organization_id,store_id,order_item_id,modifier_group_id,modifier_id,
        group_name_snapshot,modifier_name_snapshot,unit_price_cents,quantity
      ) values (
        p_organization_id,p_store_id,v_order_item_id,null,null,
        coalesce(nullif(trim(coalesce(v_modifier->>'groupName','')),''),'Adicionais'),
        trim(v_modifier->>'name'),(v_modifier->>'unitPriceCents')::integer,(v_modifier->>'quantity')::integer
      );
    end loop;
  end loop;

  for v_payment in select value from jsonb_array_elements(p_order->'payments') loop
    v_payment_index := v_payment_index + 1;
    v_payment_amount := (v_payment->>'amountCents')::bigint;
    if v_payment_amount < 0 then raise exception 'invalid external payment amount'; end if;
    if v_payment_amount = 0 then continue; end if;
    v_method := private.integration_normalize_payment_method(v_payment->>'method');
    v_payment_row_status := case when coalesce((v_payment->>'prepaid')::boolean,false) then 'paid' else 'pending' end;
    insert into public.payments(
      organization_id,store_id,order_id,method,status,amount_cents,idempotency_key,source,metadata,paid_at
    ) values (
      p_organization_id,p_store_id,v_order_id,v_method,v_payment_row_status,v_payment_amount,
      'external:' || v_provider || ':' || v_order_id::text || ':payment:' || v_payment_index::text,
      'integration',
      jsonb_build_object(
        'external_method',coalesce(v_payment->>'method',''),
        'provider_status',v_payment->>'providerStatus',
        'payment_owner',v_payment_owner,
        'prepaid',coalesce((v_payment->>'prepaid')::boolean,false)
      ),
      case when v_payment_row_status='paid' then now() else null end
    );
  end loop;

  insert into public.order_state_history(organization_id,store_id,order_id,state_domain,from_state,to_state,source)
  values
    (p_organization_id,p_store_id,v_order_id,'order',null,'pending_confirmation','integration'),
    (p_organization_id,p_store_id,v_order_id,'payment',null,v_payment_status,'integration'),
    (p_organization_id,p_store_id,v_order_id,'production',null,'pending_confirmation','integration'),
    (p_organization_id,p_store_id,v_order_id,'fulfillment',null,'pending','integration');

  insert into public.external_orders(
    organization_id,store_id,order_id,integration_account_id,integration_merchant_id,
    provider,external_order_id,payment_owner,logistics_owner,external_status,external_revision,
    sync_status,last_external_event_id,last_snapshot
  ) values (
    p_organization_id,p_store_id,v_order_id,p_integration_account_id,v_merchant.id,
    v_provider,v_external_order_id,v_payment_owner,v_logistics_owner,p_external_status,p_external_revision,
    'synced',nullif(trim(coalesce(p_external_event_id,'')),''),p_order
  );

  insert into public.domain_events(
    organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at
  ) values (
    p_organization_id,p_store_id,'order.created','order',v_order_id,
    jsonb_build_object(
      'display_number',v_display_number,
      'channel',v_provider,
      'fulfillment_type',v_fulfillment_type,
      'total_cents',v_total,
      'external_order',true
    ),
    'pending',0,now()
  );

  insert into public.integration_audit_log(
    organization_id,store_id,integration_account_id,provider,capability,action,source,correlation_id,metadata
  ) values (
    p_organization_id,p_store_id,p_integration_account_id,v_provider,
    case when v_provider='ifood' then 'ifood_orders' else '99food_orders' end,
    'external_order_imported','worker',nullif(trim(coalesce(p_correlation_id,'')),''),
    jsonb_build_object('order_id',v_order_id,'external_order_id',v_external_order_id,'payment_status',v_payment_status)
  );

  return jsonb_build_object('order_id',v_order_id,'display_number',v_display_number,'created',true);
end;
$$;

revoke all on function public.integration_import_external_order(uuid,uuid,uuid,text,jsonb,text,text,text)
  from public, anon, authenticated;
grant execute on function public.integration_import_external_order(uuid,uuid,uuid,text,jsonb,text,text,text)
  to service_role;

comment on function public.integration_import_external_order(uuid,uuid,uuid,text,jsonb,text,text,text) is
  'Atomically materializes one normalized external sales-channel order into the canonical PedeAqui order aggregate. Replays converge to the existing order id.';