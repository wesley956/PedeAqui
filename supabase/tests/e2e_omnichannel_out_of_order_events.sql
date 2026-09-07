-- PedeAqui OMNI #936/#937 — late/older external events cannot regress reconciliation state.
-- The whole fixture is rolled back.
begin;

insert into auth.users (id,email)
values ('f8888888-8888-4888-8888-888888888888','quality-omni-ordering@example.invalid');
insert into public.organizations (id,name,created_by)
values ('f8000000-0000-4000-8000-000000000001','Quality Omni Ordering Org','f8888888-8888-4888-8888-888888888888');
insert into public.stores (id,organization_id,name,slug,status)
values ('f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000001','Ordering Store','quality-omni-ordering','active');
insert into public.integration_accounts (id,organization_id,provider,status)
values ('f8000000-0000-4000-8000-000000000021','f8000000-0000-4000-8000-000000000001','ifood','connected');
insert into public.integration_merchants (
  id,organization_id,store_id,integration_account_id,provider,external_merchant_id
) values (
  'f8000000-0000-4000-8000-000000000031','f8000000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000021',
  'ifood','merchant-ordering-test'
);

insert into public.integration_events (
  id,organization_id,store_id,integration_account_id,provider,capability,
  external_event_id,event_type,payload,occurred_at,received_at
) values
  (
    'f8000000-0000-4000-8000-000000000041','f8000000-0000-4000-8000-000000000001',
    'f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000021',
    'ifood','ifood_orders','event-old','ORDER_PLACED','{}'::jsonb,
    '2026-09-07T05:00:00Z','2026-09-07T06:00:00Z'
  ),
  (
    'f8000000-0000-4000-8000-000000000042','f8000000-0000-4000-8000-000000000001',
    'f8000000-0000-4000-8000-000000000011','f8000000-0000-4000-8000-000000000021',
    'ifood','ifood_orders','event-new','ORDER_CONFIRMED','{}'::jsonb,
    '2026-09-07T05:10:00Z','2026-09-07T06:01:00Z'
  );

do $$
declare
  v_old jsonb := jsonb_build_object(
    'provider','ifood','externalMerchantId','merchant-ordering-test','externalOrderId','ordering-order-1',
    'externalDisplayId','ORD-1','orderType','takeout','timing','immediate',
    'createdAt','2026-09-07T04:59:00Z','scheduledFor',null,'recommendedPreparationAt',null,
    'customer',jsonb_build_object('name','Cliente Ordering','phone',null),'deliveryAddress',null,
    'items',jsonb_build_array(jsonb_build_object(
      'externalId','item-1','name','Pedido','quantity',1,'unitBasePriceCents',1000,'totalCents',1000,
      'notes',null,'modifiers','[]'::jsonb
    )),
    'money',jsonb_build_object('subtotalCents',1000,'deliveryFeeCents',0,'discountCents',0,'additionalFeeCents',0,'totalCents',1000),
    'payments',jsonb_build_array(jsonb_build_object('method','provider_wallet','prepaid',true,'amountCents',1000,'providerStatus','PAID')),
    'paymentOwner','provider','logisticsOwner','merchant','pickupCode','OLD1','deliveryCode',null,
    'providerMetadata',jsonb_build_object('fixture','old')
  );
  v_new jsonb;
  v_result jsonb;
  v_order_id uuid;
  v_status text;
  v_revision text;
  v_event_id text;
  v_pickup text;
  v_event_at timestamptz;
  v_updated_at timestamptz;
begin
  v_new := jsonb_set(v_old,'{pickupCode}','"NEW9"'::jsonb,true);
  v_new := jsonb_set(v_new,'{providerMetadata,fixture}','"new"'::jsonb,true);

  v_result := public.integration_import_external_order(
    'f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011',
    'f8000000-0000-4000-8000-000000000021','event-old',v_old,'PLACED','rev-old','corr-old-first'
  );
  v_order_id := (v_result->>'order_id')::uuid;

  if (select last_provider_event_at from public.external_orders where order_id=v_order_id) <> '2026-09-07T05:00:00Z'::timestamptz then
    raise exception 'initial provider event watermark mismatch';
  end if;

  perform public.integration_import_external_order(
    'f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011',
    'f8000000-0000-4000-8000-000000000021','event-new',v_new,'CONFIRMED','rev-new','corr-new'
  );

  select external_status,external_revision,last_external_event_id,last_snapshot->>'pickupCode',last_provider_event_at,updated_at
    into v_status,v_revision,v_event_id,v_pickup,v_event_at,v_updated_at
  from public.external_orders where order_id=v_order_id;

  if v_status <> 'CONFIRMED' or v_revision <> 'rev-new' or v_event_id <> 'event-new'
     or v_pickup <> 'NEW9' or v_event_at <> '2026-09-07T05:10:00Z'::timestamptz then
    raise exception 'newer provider event was not applied correctly';
  end if;

  -- Now deliver the older event again. The RPC may classify it as a replay, but
  -- the DB ordering guard must preserve every field from the newer sync view.
  perform pg_sleep(0.01);
  perform public.integration_import_external_order(
    'f8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000011',
    'f8000000-0000-4000-8000-000000000021','event-old',v_old,'PLACED','rev-regression-attempt','corr-old-late'
  );

  if (select external_status from public.external_orders where order_id=v_order_id) <> 'CONFIRMED' then
    raise exception 'stale event regressed external status';
  end if;
  if (select external_revision from public.external_orders where order_id=v_order_id) <> 'rev-new' then
    raise exception 'stale event regressed external revision';
  end if;
  if (select last_external_event_id from public.external_orders where order_id=v_order_id) <> 'event-new' then
    raise exception 'stale event replaced latest external event identity';
  end if;
  if (select last_snapshot->>'pickupCode' from public.external_orders where order_id=v_order_id) <> 'NEW9' then
    raise exception 'stale event regressed reconciliation snapshot';
  end if;
  if (select last_provider_event_at from public.external_orders where order_id=v_order_id) <> '2026-09-07T05:10:00Z'::timestamptz then
    raise exception 'stale event regressed provider watermark';
  end if;
  if (select updated_at from public.external_orders where order_id=v_order_id) <> v_updated_at then
    raise exception 'stale event falsely refreshed external_orders.updated_at';
  end if;

  -- Canonical operational aggregate remains one order with one set of effects.
  if (select count(*) from public.orders where id=v_order_id) <> 1 then raise exception 'ordering replay duplicated canonical order'; end if;
  if (select count(*) from public.order_items where order_id=v_order_id) <> 1 then raise exception 'ordering replay duplicated items'; end if;
  if (select count(*) from public.payments where order_id=v_order_id) <> 1 then raise exception 'ordering replay duplicated payments'; end if;
  if (select count(*) from public.domain_events where entity_id=v_order_id and event_type='order.created') <> 1 then
    raise exception 'ordering replay duplicated order.created';
  end if;
end $$;

rollback;
