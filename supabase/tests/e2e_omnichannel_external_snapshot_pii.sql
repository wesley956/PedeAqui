-- PedeAqui OMNI #936/#937 — duplicated PII must not persist in external_orders.last_snapshot.
-- Fixture administrativa de TESTE; a transação inteira é revertida.
begin;

insert into auth.users (id,email)
values ('f6666666-6666-4666-8666-666666666666','quality-omni-pii@example.invalid');
insert into public.organizations (id,name,created_by)
values ('f6000000-0000-4000-8000-000000000001','Quality Omni PII Org','f6666666-6666-4666-8666-666666666666');
insert into public.stores (id,organization_id,name,slug,status)
values ('f6000000-0000-4000-8000-000000000011','f6000000-0000-4000-8000-000000000001','Omni PII Store','quality-omni-pii','active');
insert into public.integration_accounts (id,organization_id,provider,status)
values ('f6000000-0000-4000-8000-000000000021','f6000000-0000-4000-8000-000000000001','ifood','connected');
insert into public.integration_merchants (
  id,organization_id,store_id,integration_account_id,provider,external_merchant_id
) values (
  'f6000000-0000-4000-8000-000000000031',
  'f6000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000011',
  'f6000000-0000-4000-8000-000000000021',
  'ifood','merchant-pii-test'
);
insert into public.integration_events (
  id,organization_id,store_id,integration_account_id,provider,capability,external_event_id,event_type,payload
) values (
  'f6000000-0000-4000-8000-000000000041',
  'f6000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000011',
  'f6000000-0000-4000-8000-000000000021',
  'ifood','ifood_orders','event-pii-1','ORDER_PLACED','{}'::jsonb
);

do $$
declare
  v_order jsonb := jsonb_build_object(
    'provider','ifood',
    'externalMerchantId','merchant-pii-test',
    'externalOrderId','external-order-pii',
    'externalDisplayId','IF-PII-1',
    'orderType','delivery',
    'timing','immediate',
    'createdAt','2026-09-07T05:45:00.000Z',
    'scheduledFor',null,
    'recommendedPreparationAt',null,
    'customer',jsonb_build_object('name','Cliente Sensível','phone','5511999999999'),
    'deliveryAddress',jsonb_build_object(
      'street','Rua Privada','number','123','neighborhood','Centro','city','Cidade','state','SP',
      'postalCode','13000000','complement','Casa 2','reference','Portão vermelho','latitude',-22.0,'longitude',-47.0
    ),
    'items',jsonb_build_array(jsonb_build_object(
      'externalId','item-pii-1','name','Pedido operacional','quantity',1,
      'unitBasePriceCents',1200,'totalCents',1500,'notes','Sem cebola - observação sensível',
      'modifiers',jsonb_build_array(jsonb_build_object(
        'externalId','mod-pii-1','groupName','Adicionais','name','Extra','quantity',1,
        'unitPriceCents',300,'totalCents',300
      ))
    )),
    'money',jsonb_build_object(
      'subtotalCents',1500,'deliveryFeeCents',500,'discountCents',0,'additionalFeeCents',0,'totalCents',2000
    ),
    'payments',jsonb_build_array(jsonb_build_object(
      'method','provider_wallet','prepaid',true,'amountCents',2000,'providerStatus','PAID',
      'cardholderName','Nome que não deve persistir'
    )),
    'paymentOwner','provider',
    'logisticsOwner','ifood',
    'pickupCode',null,
    'deliveryCode','9876',
    'providerMetadata',jsonb_build_object(
      'rawCustomerDocument','123.456.789-00','debugToken','secret-like-value','fixture','pii-test'
    )
  );
  v_result jsonb;
  v_order_id uuid;
  v_snapshot jsonb;
begin
  v_result := public.integration_import_external_order(
    'f6000000-0000-4000-8000-000000000001',
    'f6000000-0000-4000-8000-000000000011',
    'f6000000-0000-4000-8000-000000000021',
    'event-pii-1',v_order,'PLACED','rev-pii-1','corr-pii-1'
  );
  v_order_id := (v_result->>'order_id')::uuid;

  -- Operational snapshots remain available in the canonical aggregate.
  if (select customer_name_snapshot from public.orders where id=v_order_id) <> 'Cliente Sensível' then
    raise exception 'canonical order lost customer name required for operation';
  end if;
  if (select customer_phone_snapshot from public.orders where id=v_order_id) <> '5511999999999' then
    raise exception 'canonical order lost customer phone required for operation';
  end if;
  if (select address_street_snapshot from public.orders where id=v_order_id) <> 'Rua Privada' then
    raise exception 'canonical order lost delivery address required for operation';
  end if;
  if (select note from public.order_items where order_id=v_order_id limit 1) <> 'Sem cebola - observação sensível' then
    raise exception 'canonical order item lost operational note';
  end if;

  select last_snapshot into v_snapshot from public.external_orders where order_id=v_order_id;

  -- Reconciliation copy is whitelist-only and must not duplicate operational PII.
  if v_snapshot ? 'customer' or v_snapshot ? 'deliveryAddress' or v_snapshot ? 'items' or v_snapshot ? 'providerMetadata' then
    raise exception 'external reconciliation snapshot retained a forbidden PII-bearing top-level field: %',v_snapshot;
  end if;
  if v_snapshot::text like '%Cliente Sensível%'
     or v_snapshot::text like '%5511999999999%'
     or v_snapshot::text like '%Rua Privada%'
     or v_snapshot::text like '%Sem cebola%'
     or v_snapshot::text like '%123.456.789-00%'
     or v_snapshot::text like '%secret-like-value%'
     or v_snapshot::text like '%Nome que não deve persistir%' then
    raise exception 'external reconciliation snapshot still contains duplicated PII: %',v_snapshot;
  end if;
  if v_snapshot->>'externalOrderId' <> 'external-order-pii'
     or (v_snapshot->>'itemCount')::integer <> 1
     or v_snapshot#>>'{money,totalCents}' <> '2000'
     or v_snapshot#>>'{payments,0,method}' <> 'provider_wallet'
     or v_snapshot#>>'{payments,0,providerStatus}' <> 'PAID'
     or v_snapshot->>'deliveryCode' <> '9876' then
    raise exception 'minimal external snapshot lost reconciliation data: %',v_snapshot;
  end if;

  -- Future updates cannot bypass the minimizer trigger either.
  update public.external_orders
     set last_snapshot = last_snapshot || jsonb_build_object(
       'customer',jsonb_build_object('name','PII REINTRODUZIDA'),
       'deliveryAddress',jsonb_build_object('street','Rua Vazamento'),
       'items',jsonb_build_array(jsonb_build_object('notes','nota vazada')),
       'providerMetadata',jsonb_build_object('secret','vazamento')
     )
   where order_id=v_order_id;

  select last_snapshot into v_snapshot from public.external_orders where order_id=v_order_id;
  if v_snapshot ? 'customer' or v_snapshot ? 'deliveryAddress' or v_snapshot ? 'items' or v_snapshot ? 'providerMetadata'
     or v_snapshot::text like '%PII REINTRODUZIDA%'
     or v_snapshot::text like '%Rua Vazamento%'
     or v_snapshot::text like '%nota vazada%'
     or v_snapshot::text like '%vazamento%' then
    raise exception 'snapshot minimizer trigger was bypassed on update: %',v_snapshot;
  end if;
end $$;

rollback;
