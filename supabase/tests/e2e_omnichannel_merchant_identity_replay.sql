-- PedeAqui OMNI #936/#937 — merchant-scoped identities and replay stress.
-- Two stores share one provider account and intentionally reuse the same event/order IDs.
-- The whole fixture is rolled back.
begin;

insert into auth.users (id,email)
values ('f7777777-7777-4777-8777-777777777777','quality-omni-merchant-scope@example.invalid');
insert into public.organizations (id,name,created_by)
values ('f7000000-0000-4000-8000-000000000001','Quality Omni Merchant Scope Org','f7777777-7777-4777-8777-777777777777');
insert into public.stores (id,organization_id,name,slug,status) values
  ('f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000001','Merchant Store A','quality-merchant-a','active'),
  ('f7000000-0000-4000-8000-000000000012','f7000000-0000-4000-8000-000000000001','Merchant Store B','quality-merchant-b','active');
insert into public.integration_accounts (id,organization_id,provider,status)
values ('f7000000-0000-4000-8000-000000000021','f7000000-0000-4000-8000-000000000001','ifood','connected');
insert into public.integration_merchants (
  id,organization_id,store_id,integration_account_id,provider,external_merchant_id
) values
  ('f7000000-0000-4000-8000-000000000031','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000021','ifood','merchant-shared-a'),
  ('f7000000-0000-4000-8000-000000000032','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000012','f7000000-0000-4000-8000-000000000021','ifood','merchant-shared-b');

-- Same provider event ID in two different merchants/stores must be structurally valid.
insert into public.integration_events (
  id,organization_id,store_id,integration_account_id,provider,capability,external_event_id,event_type,payload
) values
  ('f7000000-0000-4000-8000-000000000041','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000021','ifood','ifood_orders','shared-event-42','ORDER_PLACED','{}'::jsonb),
  ('f7000000-0000-4000-8000-000000000042','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000012','f7000000-0000-4000-8000-000000000021','ifood','ifood_orders','shared-event-42','ORDER_PLACED','{}'::jsonb);

do $$
declare
  v_order_a jsonb := jsonb_build_object(
    'provider','ifood','externalMerchantId','merchant-shared-a','externalOrderId','shared-order-42',
    'externalDisplayId','A-42','orderType','takeout','timing','immediate',
    'createdAt','2026-09-07T06:30:00.000Z','scheduledFor',null,'recommendedPreparationAt',null,
    'customer',jsonb_build_object('name','Cliente Merchant A','phone',null),'deliveryAddress',null,
    'items',jsonb_build_array(jsonb_build_object(
      'externalId','item-a','name','Pedido A','quantity',1,'unitBasePriceCents',1000,'totalCents',1000,
      'notes',null,'modifiers','[]'::jsonb
    )),
    'money',jsonb_build_object('subtotalCents',1000,'deliveryFeeCents',0,'discountCents',0,'additionalFeeCents',0,'totalCents',1000),
    'payments',jsonb_build_array(jsonb_build_object('method','provider_wallet','prepaid',true,'amountCents',1000,'providerStatus','PAID')),
    'paymentOwner','provider','logisticsOwner','merchant','pickupCode','1111','deliveryCode',null,
    'providerMetadata',jsonb_build_object('fixture','merchant-a')
  );
  v_order_b jsonb := jsonb_build_object(
    'provider','ifood','externalMerchantId','merchant-shared-b','externalOrderId','shared-order-42',
    'externalDisplayId','B-42','orderType','takeout','timing','immediate',
    'createdAt','2026-09-07T06:30:00.000Z','scheduledFor',null,'recommendedPreparationAt',null,
    'customer',jsonb_build_object('name','Cliente Merchant B','phone',null),'deliveryAddress',null,
    'items',jsonb_build_array(jsonb_build_object(
      'externalId','item-b','name','Pedido B','quantity',1,'unitBasePriceCents',1000,'totalCents',1000,
      'notes',null,'modifiers','[]'::jsonb
    )),
    'money',jsonb_build_object('subtotalCents',1000,'deliveryFeeCents',0,'discountCents',0,'additionalFeeCents',0,'totalCents',1000),
    'payments',jsonb_build_array(jsonb_build_object('method','provider_wallet','prepaid',true,'amountCents',1000,'providerStatus','PAID')),
    'paymentOwner','provider','logisticsOwner','merchant','pickupCode','2222','deliveryCode',null,
    'providerMetadata',jsonb_build_object('fixture','merchant-b')
  );
  v_result_a jsonb;
  v_result_b jsonb;
  v_replay jsonb;
  v_order_id_a uuid;
  v_order_id_b uuid;
  i integer;
begin
  -- Simulate the same inbox event being delivered 100 additional times to each store.
  for i in 1..100 loop
    insert into public.integration_events (
      organization_id,store_id,integration_account_id,provider,capability,external_event_id,event_type,payload
    ) values (
      'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000021',
      'ifood','ifood_orders','shared-event-42','ORDER_PLACED','{}'::jsonb
    ) on conflict (integration_account_id,store_id,external_event_id) do nothing;

    insert into public.integration_events (
      organization_id,store_id,integration_account_id,provider,capability,external_event_id,event_type,payload
    ) values (
      'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000012','f7000000-0000-4000-8000-000000000021',
      'ifood','ifood_orders','shared-event-42','ORDER_PLACED','{}'::jsonb
    ) on conflict (integration_account_id,store_id,external_event_id) do nothing;
  end loop;

  if (select count(*) from public.integration_events where integration_account_id='f7000000-0000-4000-8000-000000000021' and external_event_id='shared-event-42') <> 2 then
    raise exception 'merchant-scoped inbox dedupe failed';
  end if;

  v_result_a := public.integration_import_external_order(
    'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000021',
    'shared-event-42',v_order_a,'PLACED','rev-a-0','corr-a-0'
  );
  v_result_b := public.integration_import_external_order(
    'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000012','f7000000-0000-4000-8000-000000000021',
    'shared-event-42',v_order_b,'PLACED','rev-b-0','corr-b-0'
  );

  if coalesce((v_result_a->>'created')::boolean,false) is not true or coalesce((v_result_b->>'created')::boolean,false) is not true then
    raise exception 'first import for one merchant was not created';
  end if;
  v_order_id_a := (v_result_a->>'order_id')::uuid;
  v_order_id_b := (v_result_b->>'order_id')::uuid;
  if v_order_id_a = v_order_id_b then raise exception 'two merchants converged to the same canonical order'; end if;

  -- Replay each merchant 100x. Every call must converge to its own original order.
  for i in 1..100 loop
    v_replay := public.integration_import_external_order(
      'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000021',
      'shared-event-42',v_order_a,'PLACED','rev-a-' || i::text,'corr-a-' || i::text
    );
    if coalesce((v_replay->>'created')::boolean,true) is not false or (v_replay->>'order_id')::uuid <> v_order_id_a then
      raise exception 'merchant A replay % did not converge',i;
    end if;

    v_replay := public.integration_import_external_order(
      'f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000012','f7000000-0000-4000-8000-000000000021',
      'shared-event-42',v_order_b,'PLACED','rev-b-' || i::text,'corr-b-' || i::text
    );
    if coalesce((v_replay->>'created')::boolean,true) is not false or (v_replay->>'order_id')::uuid <> v_order_id_b then
      raise exception 'merchant B replay % did not converge',i;
    end if;
  end loop;

  if (select count(*) from public.external_orders where integration_account_id='f7000000-0000-4000-8000-000000000021' and external_order_id='shared-order-42') <> 2 then
    raise exception 'equal external order ids across merchants did not remain distinct';
  end if;
  if (select count(distinct integration_merchant_id) from public.external_orders where external_order_id='shared-order-42') <> 2 then
    raise exception 'external order links are not merchant-scoped';
  end if;
  if (select count(*) from public.orders where id in (v_order_id_a,v_order_id_b)) <> 2 then raise exception 'canonical order count mismatch after replays'; end if;
  if (select count(*) from public.order_items where order_id in (v_order_id_a,v_order_id_b)) <> 2 then raise exception 'items duplicated during replay storm'; end if;
  if (select count(*) from public.payments where order_id in (v_order_id_a,v_order_id_b)) <> 2 then raise exception 'payments duplicated during replay storm'; end if;
  if (select count(*) from public.domain_events where entity_id in (v_order_id_a,v_order_id_b) and event_type='order.created') <> 2 then
    raise exception 'order.created side effects duplicated during replay storm';
  end if;
  if (select external_revision from public.external_orders where integration_merchant_id='f7000000-0000-4000-8000-000000000031' and external_order_id='shared-order-42') <> 'rev-a-100' then
    raise exception 'merchant A reconciliation revision did not advance independently';
  end if;
  if (select external_revision from public.external_orders where integration_merchant_id='f7000000-0000-4000-8000-000000000032' and external_order_id='shared-order-42') <> 'rev-b-100' then
    raise exception 'merchant B reconciliation revision did not advance independently';
  end if;
end $$;

rollback;
