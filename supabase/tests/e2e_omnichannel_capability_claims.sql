-- PedeAqui OMNI: specialized inbox workers must not lease another capability's events.
begin;

insert into auth.users (id,email)
values ('f6666666-6666-4666-8666-666666666666','quality-omni-capability-claims@example.invalid');
insert into public.organizations (id,name,created_by)
values ('f2000000-0000-4000-8000-000000000001','Quality Omni Capability Org','f6666666-6666-4666-8666-666666666666');
insert into public.stores (id,organization_id,name,slug,status)
values ('f2000000-0000-4000-8000-000000000011','f2000000-0000-4000-8000-000000000001','Omni Capability Store','quality-omni-capability','active');
insert into public.integration_accounts (id,organization_id,provider,status)
values ('f2000000-0000-4000-8000-000000000021','f2000000-0000-4000-8000-000000000001','ifood','connected');
insert into public.integration_merchants (
  id,organization_id,store_id,integration_account_id,provider,external_merchant_id
) values (
  'f2000000-0000-4000-8000-000000000031',
  'f2000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000011',
  'f2000000-0000-4000-8000-000000000021',
  'ifood','merchant-capability-test'
);

insert into public.integration_events (
  id,organization_id,store_id,integration_account_id,provider,capability,external_event_id,event_type,payload
) values
(
  'f2000000-0000-4000-8000-000000000041',
  'f2000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000011',
  'f2000000-0000-4000-8000-000000000021',
  'ifood','ifood_orders','event-cap-order','ORDER_PLACED','{}'::jsonb
),
(
  'f2000000-0000-4000-8000-000000000042',
  'f2000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000011',
  'f2000000-0000-4000-8000-000000000021',
  'ifood','ifood_catalog','event-cap-catalog','CATALOG_CHANGED','{}'::jsonb
);

do $$
declare
  v_count integer;
  v_ok boolean;
begin
  select count(*) into v_count
  from public.integration_claim_events(
    10,
    'orders-worker',
    120,
    array['ifood_orders','99food_orders']::text[]
  );
  if v_count <> 1 then
    raise exception 'orders worker expected exactly one matching claim, got %',v_count;
  end if;

  if (select status from public.integration_events where id='f2000000-0000-4000-8000-000000000041') <> 'processing' then
    raise exception 'orders event was not leased';
  end if;
  if (select locked_by from public.integration_events where id='f2000000-0000-4000-8000-000000000041') <> 'orders-worker' then
    raise exception 'orders event lease owner mismatch';
  end if;
  if (select status from public.integration_events where id='f2000000-0000-4000-8000-000000000042') <> 'pending' then
    raise exception 'orders worker stole catalog event';
  end if;

  v_ok := public.integration_finish_event(
    'f2000000-0000-4000-8000-000000000041','orders-worker','ignored',null,null,null
  );
  if not v_ok then raise exception 'orders worker could not finish own event'; end if;

  select count(*) into v_count
  from public.integration_claim_events(
    10,
    'catalog-worker',
    120,
    array['ifood_catalog']::text[]
  );
  if v_count <> 1 then
    raise exception 'catalog worker expected exactly one catalog claim, got %',v_count;
  end if;

  if (select locked_by from public.integration_events where id='f2000000-0000-4000-8000-000000000042') <> 'catalog-worker' then
    raise exception 'catalog event lease owner mismatch';
  end if;
end $$;

rollback;
