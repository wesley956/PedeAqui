-- PedeAqui OMNI #936/#937 — atomic canonical external-order materialization.
-- Fixture administrativa de TESTE; a transação inteira é revertida.
begin;

insert into auth.users (id,email)
values ('f4444444-4444-4444-8444-444444444444','quality-omni-import@example.invalid');
insert into public.organizations (id,name,created_by)
values ('f0000000-0000-4000-8000-000000000001','Quality Omni Import Org','f4444444-4444-4444-8444-444444444444');
insert into public.stores (id,organization_id,name,slug,status)
values ('f0000000-0000-4000-8000-000000000011','f0000000-0000-4000-8000-000000000001','Omni Import Test Store','quality-omni-import','active');

insert into public.integration_accounts (id,organization_id,provider,status)
values ('f0000000-0000-4000-8000-000000000021','f0000000-0000-4000-8000-000000000001','ifood','connected');
insert into public.integration_merchants (
  id,organization_id,store_id,integration_account_id,provider,external_merchant_id
) values (
  'f0000000-0000-4000-8000-000000000031',
  'f0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000011',
  'f0000000-0000-4000-8000-000000000021',
  'ifood',
  'merchant-import-test'
);

insert into public.integration_events (
  id,organization_id,store_id,integration_account_id,provider,capability,external_event_id,event_type,payload
) values
(
  'f0000000-0000-4000-8000-000000000041',
  'f0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000011',
  'f0000000-0000-4000-8000-000000000021',
  'ifood','ifood_orders','event-import-valid','ORDER_PLACED','{}'::jsonb
),
(
  'f0000000-0000-4000-8000-000000000042',
  'f0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000011',
  'f0000000-0000-4000-8000-000000000021',
  'ifood','ifood_orders','event-import-invalid','ORDER_PLACED','{}'::jsonb
);

do $$
declare
  v_order jsonb := jsonb_build_object(
    'provider','ifood',
    'externalMerchantId','merchant-import-test',
    'externalOrderId','external-order-valid',
    'externalDisplayId','IF-1234',
    'orderType','delivery',
    'timing','immediate',
    'createdAt','2026-09-06T05:30:00.000Z',
    'scheduledFor',null,
    'recommendedPreparationAt',null,
    'customer',jsonb_build_object('name','Cliente Externo','phone',null),
    'deliveryAddress',jsonb_build_object(
      'street','Rua A','number','10','neighborhood','Centro','city','Cidade','state','SP',
      'postalCode','13000000','complement',null,'reference','Portão azul','latitude',null,'longitude',null
    ),
    'items',jsonb_build_array(jsonb_build_object(
      'externalId','item-1','name','Lanche','quantity',1,'unitBasePriceCents',2000,'totalCents',2500,
      'notes','Sem cebola',
      'modifiers',jsonb_build_array(jsonb_build_object(
        'externalId','mod-1','name','Adicional','quantity',1,'unitPriceCents',500,'totalCents',500
      ))
    )),
    'money',jsonb_build_object(
      'subtotalCents',2500,'deliveryFeeCents',500,'discountCents',200,'additionalFeeCents',100,'totalCents',2900
    ),
    'payments',jsonb_build_array(jsonb_build_object(
      'method','provider_wallet','prepaid',true,'amountCents',2900,'providerStatus','PAID'
    )),
    'paymentOwner','provider',
    'logisticsOwner','ifood',
    'pickupCode',null,
    'deliveryCode','1234',
    'providerMetadata',jsonb_build_object('fixture','isolated-db')
  );
  v_invalid jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_order_id uuid;
  v_count integer;
  v_text text;
  v_number bigint;
begin
  v_result := public.integration_import_external_order(
    'f0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000011',
    'f0000000-0000-4000-8000-000000000021',
    'event-import-valid',v_order,'PLACED','rev-1','corr-import-1'
  );
  if coalesce((v_result->>'created')::boolean,false) is not true then raise exception 'first import was not created'; end if;
  v_order_id := (v_result->>'order_id')::uuid;

  select count(*) into v_count from public.orders
   where organization_id='f0000000-0000-4000-8000-000000000001'
     and store_id='f0000000-0000-4000-8000-000000000011';
  if v_count <> 1 then raise exception 'expected exactly one canonical order, got %',v_count; end if;

  select channel,total_cents,additional_fee_cents into v_text,v_number,v_count
    from public.orders where id=v_order_id;
  if v_text <> 'ifood' or v_number <> 2900 or v_count <> 100 then
    raise exception 'canonical order financial/channel snapshot mismatch';
  end if;
  if (select payment_status from public.orders where id=v_order_id) <> 'paid' then raise exception 'prepaid external order did not start paid'; end if;
  if (select source_cart_id is not null or checkout_session_id is not null or public_access_token_hash is not null from public.orders where id=v_order_id) then
    raise exception 'external order unexpectedly depends on checkout/cart identity';
  end if;

  if (select count(*) from public.order_items where order_id=v_order_id) <> 1 then raise exception 'external order item snapshot missing'; end if;
  if (select count(*) from public.order_item_modifiers m join public.order_items i on i.id=m.order_item_id where i.order_id=v_order_id and m.quantity=1 and m.unit_price_cents=500) <> 1 then
    raise exception 'external modifier snapshot missing';
  end if;

  if (select count(*) from public.payments where order_id=v_order_id) <> 1 then raise exception 'external payment was duplicated or missing'; end if;
  if (select count(*) from public.payments where order_id=v_order_id and source='integration' and status='paid' and amount_cents=2900 and metadata->>'external_method'='provider_wallet') <> 1 then
    raise exception 'external prepaid payment was not persisted explicitly';
  end if;
  if (select count(*) from public.order_payment_provider_charges where order_id=v_order_id) <> 0 then
    raise exception 'external prepaid order created a native payment-provider charge';
  end if;

  if (select count(*) from public.external_orders where order_id=v_order_id and external_order_id='external-order-valid' and sync_status='synced') <> 1 then
    raise exception 'external order link missing';
  end if;
  if (select count(*) from public.order_state_history where order_id=v_order_id and source='integration') <> 4 then
    raise exception 'external order initial state history is incomplete';
  end if;
  if (select count(*) from public.domain_events where entity_id=v_order_id and event_type='order.created') <> 1 then
    raise exception 'canonical order.created event missing';
  end if;

  v_replay := public.integration_import_external_order(
    'f0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000011',
    'f0000000-0000-4000-8000-000000000021',
    'event-import-valid',v_order,'PLACED','rev-2','corr-import-replay'
  );
  if coalesce((v_replay->>'created')::boolean,true) is not false then raise exception 'replay created a second order'; end if;
  if (v_replay->>'order_id')::uuid <> v_order_id then raise exception 'replay did not converge to original order id'; end if;
  if (select count(*) from public.orders where organization_id='f0000000-0000-4000-8000-000000000001' and store_id='f0000000-0000-4000-8000-000000000011') <> 1 then
    raise exception 'replay duplicated canonical order';
  end if;
  if (select count(*) from public.payments where order_id=v_order_id) <> 1 then raise exception 'replay duplicated payment'; end if;
  if (select count(*) from public.order_items where order_id=v_order_id) <> 1 then raise exception 'replay duplicated item'; end if;
  if (select external_revision from public.external_orders where order_id=v_order_id) <> 'rev-2' then raise exception 'replay did not refresh external revision'; end if;
  if (select count(*) from public.integration_audit_log where action='external_order_imported' and metadata->>'order_id'=v_order_id::text) <> 1 then
    raise exception 'initial import audit missing';
  end if;
  if (select count(*) from public.integration_audit_log where action='external_order_replayed' and metadata->>'order_id'=v_order_id::text) <> 1 then
    raise exception 'replay audit missing';
  end if;

  -- Corrupt one modifier total. The nested exception handler proves the RPC fails while
  -- the outer transaction remains usable, so we can assert that nothing partial leaked.
  v_invalid := jsonb_set(v_order,'{externalOrderId}','"external-order-invalid"'::jsonb,true);
  v_invalid := jsonb_set(v_invalid,'{items,0,modifiers,0,totalCents}','400'::jsonb,true);
  begin
    perform public.integration_import_external_order(
      'f0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000011',
      'f0000000-0000-4000-8000-000000000021',
      'event-import-invalid',v_invalid,'PLACED','rev-invalid','corr-invalid'
    );
    raise exception 'invalid external order unexpectedly imported';
  exception
    when others then
      if sqlerrm = 'invalid external order unexpectedly imported' then raise; end if;
      if position('external modifier total invariant failed' in sqlerrm) = 0 then
        raise exception 'unexpected invalid-import error: %',sqlerrm;
      end if;
  end;

  if (select count(*) from public.external_orders where external_order_id='external-order-invalid') <> 0 then
    raise exception 'failed import leaked external_orders link';
  end if;
  if (select count(*) from public.orders where organization_id='f0000000-0000-4000-8000-000000000001' and store_id='f0000000-0000-4000-8000-000000000011') <> 1 then
    raise exception 'failed import leaked a partial canonical order';
  end if;

  select pg_get_constraintdef(oid) into v_text
  from pg_constraint
  where conname='orders_channel_check' and conrelid='public.orders'::regclass;
  if position('99food' in coalesce(v_text,'')) = 0 then raise exception 'orders channel constraint does not include 99food'; end if;
end $$;

rollback;