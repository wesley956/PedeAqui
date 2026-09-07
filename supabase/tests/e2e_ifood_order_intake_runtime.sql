-- PedeAqui OMNI #939 — exact account/store claims and iFood SLA telemetry.
-- Administrative fixture only; every row is rolled back.
begin;

insert into auth.users (id,email)
values ('f7777777-7777-4777-8777-777777777777','quality-ifood-intake@example.invalid');
insert into public.organizations (id,name,created_by)
values ('f7000000-0000-4000-8000-000000000001','Quality iFood Intake Org','f7777777-7777-4777-8777-777777777777');
insert into public.stores (id,organization_id,name,slug,status) values
  ('f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000001','iFood Intake A','quality-ifood-intake-a','active'),
  ('f7000000-0000-4000-8000-000000000012','f7000000-0000-4000-8000-000000000001','iFood Intake B','quality-ifood-intake-b','active');
insert into public.integration_accounts (
  id,organization_id,provider,status,environment,auth_mode,connection_state
) values
  ('f7000000-0000-4000-8000-000000000021','f7000000-0000-4000-8000-000000000001','ifood','connected','sandbox','distributed','connected'),
  ('f7000000-0000-4000-8000-000000000022','f7000000-0000-4000-8000-000000000001','ifood','connected','production','distributed','connected');
insert into public.integration_merchants (
  id,organization_id,store_id,integration_account_id,provider,environment,external_merchant_id,capabilities
) values
  ('f7000000-0000-4000-8000-000000000031','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000021','ifood','sandbox','merchant-intake-a','{"ifood_orders":true}'::jsonb),
  ('f7000000-0000-4000-8000-000000000032','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000012','f7000000-0000-4000-8000-000000000022','ifood','production','merchant-intake-b','{"ifood_orders":true}'::jsonb);

insert into public.integration_events (
  id,organization_id,store_id,integration_account_id,provider,capability,
  external_event_id,event_type,payload,occurred_at,received_at
) values
  ('f7000000-0000-4000-8000-000000000041','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000021','ifood','ifood_orders','event-pair-a','ORDER_PLACED','{}',now()-interval '7 minutes',now()-interval '6 minutes 50 seconds'),
  ('f7000000-0000-4000-8000-000000000042','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000012','f7000000-0000-4000-8000-000000000022','ifood','ifood_orders','event-pair-b','ORDER_PLACED','{}',now(),now()),
  ('f7000000-0000-4000-8000-000000000043','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000012','f7000000-0000-4000-8000-000000000021','ifood','ifood_orders','event-cross-a-b','ORDER_PLACED','{}',now(),now()),
  ('f7000000-0000-4000-8000-000000000044','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000022','ifood','ifood_orders','event-cross-b-a','ORDER_PLACED','{}',now(),now()),
  ('f7000000-0000-4000-8000-000000000045','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000021','ifood','ifood_catalog','event-catalog','CATALOG_CHANGED','{}',now(),now());

do $$
declare
  v_count integer;
  v_order jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_order_id uuid;
  v_sla record;
begin
  select count(*) into v_count
  from public.integration_claim_events_scoped(
    100,
    'ifood-exact-pairs',
    array['f7000000-0000-4000-8000-000000000021','f7000000-0000-4000-8000-000000000022']::uuid[],
    array['f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000012']::uuid[],
    120,
    array['ifood_orders']::text[]
  );
  if v_count <> 2 then raise exception 'exact pair claim expected 2 events, got %',v_count; end if;
  if exists (
    select 1 from public.integration_events
    where external_event_id in ('event-cross-a-b','event-cross-b-a','event-catalog')
      and status <> 'pending'
  ) then raise exception 'exact pair claim leased a cross-pair or wrong-capability event'; end if;

  select count(*) into v_count
  from public.integration_claim_events_scoped(
    100,
    'ifood-competing-worker',
    array['f7000000-0000-4000-8000-000000000021','f7000000-0000-4000-8000-000000000022']::uuid[],
    array['f7000000-0000-4000-8000-000000000011','f7000000-0000-4000-8000-000000000012']::uuid[],
    120,
    array['ifood_orders']::text[]
  );
  if v_count <> 0 then raise exception 'active leases were double claimed'; end if;

  perform public.integration_finish_event(
    'f7000000-0000-4000-8000-000000000041','ifood-exact-pairs','processed',null,null,null
  );

  v_order := jsonb_build_object(
    'provider','ifood',
    'externalMerchantId','merchant-intake-a',
    'externalOrderId','external-intake-order-a',
    'externalDisplayId','SLA-A',
    'orderType','takeout',
    'timing','immediate',
    'createdAt',(now()-interval '7 minutes')::text,
    'scheduledFor',null,
    'recommendedPreparationAt',null,
    'customer',jsonb_build_object('name','Cliente SLA','phone',null),
    'deliveryAddress',null,
    'items',jsonb_build_array(jsonb_build_object(
      'externalId','item-sla','name','Pedido SLA','quantity',1,
      'unitBasePriceCents',1000,'totalCents',1000,'notes',null,'modifiers','[]'::jsonb
    )),
    'money',jsonb_build_object(
      'subtotalCents',1000,'deliveryFeeCents',0,'discountCents',0,
      'additionalFeeCents',0,'totalCents',1000
    ),
    'payments',jsonb_build_array(jsonb_build_object(
      'method','CASH','prepaid',false,'amountCents',1000,'providerStatus','PENDING'
    )),
    'paymentOwner','merchant',
    'logisticsOwner',null,
    'pickupCode',null,
    'deliveryCode',null,
    'providerMetadata','{}'::jsonb
  );

  v_result := public.integration_import_external_order(
    'f7000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000011',
    'f7000000-0000-4000-8000-000000000021',
    'event-pair-a',v_order,'PLACED',null,'sla-fixture'
  );
  v_order_id := (v_result->>'order_id')::uuid;

  insert into public.integration_events (
    organization_id,store_id,integration_account_id,provider,capability,
    external_event_id,event_type,payload,occurred_at,received_at
  ) values (
    'f7000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000011',
    'f7000000-0000-4000-8000-000000000021',
    'ifood','ifood_orders','event-pair-a-update','ORDER_UPDATED','{}',now(),now()
  );
  v_replay := public.integration_import_external_order(
    'f7000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000011',
    'f7000000-0000-4000-8000-000000000021',
    'event-pair-a-update',v_order,'PLACED','revision-2','sla-fixture-update'
  );
  if coalesce((v_replay->>'created')::boolean,true) is not false
     or (v_replay->>'order_id')::uuid <> v_order_id then
    raise exception 'different event for the same order did not converge';
  end if;
  if (select count(*) from public.orders where id=v_order_id) <> 1 then
    raise exception 'different event duplicated canonical order';
  end if;

  select * into v_sla
  from public.integration_ifood_confirmation_sla(
    array['f7000000-0000-4000-8000-000000000021']::uuid[],
    array['f7000000-0000-4000-8000-000000000011']::uuid[],
    120
  );
  if v_sla.order_id is distinct from v_order_id then raise exception 'SLA row did not resolve imported order'; end if;
  if v_sla.state <> 'risk' then raise exception 'seven-minute order should be at risk, got %',v_sla.state; end if;
  if v_sla.provider_to_received_seconds not between 9 and 11 then
    raise exception 'provider-to-received lag mismatch: %',v_sla.provider_to_received_seconds;
  end if;
  if v_sla.received_to_imported_seconds < 400 then
    raise exception 'received-to-imported lag was not captured: %',v_sla.received_to_imported_seconds;
  end if;
  if v_sla.seconds_remaining not between 50 and 60 then
    raise exception 'confirmation time remaining mismatch: %',v_sla.seconds_remaining;
  end if;

  select count(*) into v_count
  from public.integration_ifood_confirmation_sla(
    array['f7000000-0000-4000-8000-000000000021']::uuid[],
    array['f7000000-0000-4000-8000-000000000012']::uuid[],
    120
  );
  if v_count <> 0 then raise exception 'SLA query crossed account/store pair boundary'; end if;

  update public.orders set order_status='confirmed' where id=v_order_id;
  select count(*) into v_count
  from public.integration_ifood_confirmation_sla(
    array['f7000000-0000-4000-8000-000000000021']::uuid[],
    array['f7000000-0000-4000-8000-000000000011']::uuid[],
    120
  );
  if v_count <> 0 then raise exception 'confirmed order remained in pending-confirmation SLA'; end if;

  if has_function_privilege('anon','public.integration_ifood_confirmation_sla(uuid[],uuid[],integer)','execute')
     or has_function_privilege('authenticated','public.integration_ifood_confirmation_sla(uuid[],uuid[],integer)','execute') then
    raise exception 'browser role can execute iFood SLA function';
  end if;
  if not has_function_privilege('service_role','public.integration_ifood_confirmation_sla(uuid[],uuid[],integer)','execute') then
    raise exception 'service role cannot execute iFood SLA function';
  end if;
  if not exists (
    select 1 from cron.job
    where jobname='pedeaqui-ifood-order-intake'
      and schedule='30 seconds'
      and active=false
      and command like '%ifood_order_intake%'
  ) then raise exception 'paused 30-second iFood scheduler is not configured'; end if;
end $$;

rollback;
