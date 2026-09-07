-- PedeAqui OMNI: external marketplace orders must not emit native customer WhatsApp notifications.
begin;

insert into auth.users (id,email)
values ('f5555555-5555-4555-8555-555555555555','quality-omni-side-effects@example.invalid');
insert into public.organizations (id,name,created_by)
values ('f1000000-0000-4000-8000-000000000001','Quality Omni Side Effects Org','f5555555-5555-4555-8555-555555555555');
insert into public.stores (id,organization_id,name,slug,status)
values ('f1000000-0000-4000-8000-000000000011','f1000000-0000-4000-8000-000000000001','Omni Side Effects Store','quality-omni-side-effects','active');
insert into public.integration_accounts (id,organization_id,provider,status)
values ('f1000000-0000-4000-8000-000000000021','f1000000-0000-4000-8000-000000000001','ifood','connected');
insert into public.integration_merchants (
  id,organization_id,store_id,integration_account_id,provider,external_merchant_id
) values (
  'f1000000-0000-4000-8000-000000000031',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000011',
  'f1000000-0000-4000-8000-000000000021',
  'ifood','merchant-side-effects-test'
);
insert into public.integration_events (
  id,organization_id,store_id,integration_account_id,provider,capability,external_event_id,event_type,payload
) values (
  'f1000000-0000-4000-8000-000000000041',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000011',
  'f1000000-0000-4000-8000-000000000021',
  'ifood','ifood_orders','event-side-effects','ORDER_PLACED','{}'::jsonb
);

do $$
declare
  v_result jsonb;
  v_order_id uuid;
  v_order jsonb := jsonb_build_object(
    'provider','ifood',
    'externalMerchantId','merchant-side-effects-test',
    'externalOrderId','external-order-side-effects',
    'externalDisplayId','IF-SIDE-1',
    'orderType','takeout',
    'timing','immediate',
    'createdAt','2026-09-06T05:45:00.000Z',
    'scheduledFor',null,
    'recommendedPreparationAt',null,
    'customer',jsonb_build_object('name','Cliente Marketplace','phone','5511999999999'),
    'deliveryAddress',null,
    'items',jsonb_build_array(jsonb_build_object(
      'externalId','item-side-1','name','Pedido externo','quantity',1,
      'unitBasePriceCents',1000,'totalCents',1000,'notes',null,'modifiers','[]'::jsonb
    )),
    'money',jsonb_build_object(
      'subtotalCents',1000,'deliveryFeeCents',0,'discountCents',0,'additionalFeeCents',0,'totalCents',1000
    ),
    'payments',jsonb_build_array(jsonb_build_object(
      'method','provider_wallet','prepaid',true,'amountCents',1000,'providerStatus','PAID'
    )),
    'paymentOwner','provider',
    'logisticsOwner','merchant',
    'pickupCode','4321',
    'deliveryCode',null,
    'providerMetadata',jsonb_build_object('fixture','side-effect-guard')
  );
begin
  v_result := public.integration_import_external_order(
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000011',
    'f1000000-0000-4000-8000-000000000021',
    'event-side-effects',v_order,'PLACED','rev-side-1','corr-side-1'
  );
  v_order_id := (v_result->>'order_id')::uuid;

  if (select count(*) from public.domain_events where entity_id=v_order_id and event_type='order.created') <> 1 then
    raise exception 'external canonical order.created event was unexpectedly suppressed';
  end if;
  if (select count(*) from public.order_whatsapp_notifications where order_id=v_order_id) <> 0 then
    raise exception 'external order.created leaked into native WhatsApp notification queue';
  end if;

  insert into public.domain_events (
    organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at
  ) values (
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000011',
    'payment.paid','order',v_order_id,'{}'::jsonb,'pending',0,now()
  );

  if (select count(*) from public.order_whatsapp_notifications where order_id=v_order_id) <> 0 then
    raise exception 'external lifecycle event leaked into native WhatsApp notification queue';
  end if;
end $$;

rollback;