-- PedeAqui OMNI #936 — durable inbox/outbox concurrency, lease recovery and audited replay.
-- Fixture administrativa de TESTE; a transação inteira é revertida.
begin;

insert into auth.users (id,email)
values ('e4444444-4444-4444-8444-444444444444','quality-omni@example.invalid');
insert into public.organizations (id,name,created_by)
values ('e0000000-0000-4000-8000-000000000001','Quality Omni Org','e4444444-4444-4444-8444-444444444444');
insert into public.stores (id,organization_id,name,slug,status)
values ('e0000000-0000-4000-8000-000000000011','e0000000-0000-4000-8000-000000000001','Omni Test Store','quality-omni','active');

insert into public.integration_accounts (id,organization_id,provider,status)
values ('e0000000-0000-4000-8000-000000000021','e0000000-0000-4000-8000-000000000001','ifood','connected');
insert into public.integration_merchants (
  id,organization_id,store_id,integration_account_id,provider,external_merchant_id
) values (
  'e0000000-0000-4000-8000-000000000031',
  'e0000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000011',
  'e0000000-0000-4000-8000-000000000021',
  'ifood',
  'merchant-omni-test'
);

insert into public.integration_events (
  id,organization_id,store_id,integration_account_id,provider,capability,external_event_id,event_type,payload
) values (
  'e0000000-0000-4000-8000-000000000041',
  'e0000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000011',
  'e0000000-0000-4000-8000-000000000021',
  'ifood','ifood_orders','event-omni-1','ORDER_PLACED','{}'::jsonb
);

insert into public.integration_outbox (
  id,organization_id,store_id,integration_account_id,provider,capability,operation,idempotency_key,payload
) values (
  'e0000000-0000-4000-8000-000000000051',
  'e0000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000011',
  'e0000000-0000-4000-8000-000000000021',
  'ifood','ifood_orders','confirm','ifood:order-test:confirm:v1','{}'::jsonb
);

do $$
declare
  v_count integer;
  v_ok boolean;
  v_attempts integer;
  v_worker text;
  v_key text;
begin
  select count(*) into v_count from public.integration_claim_events(10,'worker-a',120);
  if v_count <> 1 then raise exception 'worker-a expected one inbox claim, got %',v_count; end if;

  select count(*) into v_count from public.integration_claim_events(10,'worker-b',120);
  if v_count <> 0 then raise exception 'worker-b double-claimed active inbox lease'; end if;

  select attempts,locked_by into v_attempts,v_worker
    from public.integration_events where id='e0000000-0000-4000-8000-000000000041';
  if v_attempts <> 1 or v_worker <> 'worker-a' then raise exception 'first inbox lease state invalid'; end if;

  update public.integration_events
     set locked_at=now()-interval '5 minutes'
   where id='e0000000-0000-4000-8000-000000000041';

  select count(*) into v_count from public.integration_claim_events(10,'worker-b',120);
  if v_count <> 1 then raise exception 'stale inbox lease was not recovered'; end if;

  select attempts,locked_by into v_attempts,v_worker
    from public.integration_events where id='e0000000-0000-4000-8000-000000000041';
  if v_attempts <> 2 or v_worker <> 'worker-b' then raise exception 'recovered inbox lease state invalid'; end if;

  v_ok := public.integration_finish_event(
    'e0000000-0000-4000-8000-000000000041','worker-a','processed',null,null,null
  );
  if v_ok then raise exception 'old worker was able to finish a lease it no longer owns'; end if;

  v_ok := public.integration_finish_event(
    'e0000000-0000-4000-8000-000000000041','worker-b','retry','provider','timeout',now()
  );
  if not v_ok then raise exception 'current worker failed to put inbox event in retry'; end if;

  select count(*) into v_count from public.integration_claim_events(10,'worker-c',120);
  if v_count <> 1 then raise exception 'retry inbox event was not reclaimable'; end if;

  v_ok := public.integration_finish_event(
    'e0000000-0000-4000-8000-000000000041','worker-c','dead_letter','provider','max attempts',null
  );
  if not v_ok then raise exception 'dead-letter transition failed'; end if;

  v_ok := public.integration_reprocess_event(
    'e0000000-0000-4000-8000-000000000041','e4444444-4444-4444-8444-444444444444','corr-omni-test'
  );
  if not v_ok then raise exception 'audited inbox replay failed'; end if;
  if (select count(*) from public.integration_audit_log where action='event_reprocessed' and correlation_id='corr-omni-test') <> 1 then
    raise exception 'inbox replay audit missing';
  end if;

  select count(*) into v_count from public.integration_claim_outbox(10,'outbox-a',120);
  if v_count <> 1 then raise exception 'outbox-a expected one claim, got %',v_count; end if;

  select count(*) into v_count from public.integration_claim_outbox(10,'outbox-b',120);
  if v_count <> 0 then raise exception 'outbox-b double-claimed active command lease'; end if;

  v_ok := public.integration_finish_outbox(
    'e0000000-0000-4000-8000-000000000051','outbox-a','retry','provider','timeout',now()
  );
  if not v_ok then raise exception 'outbox retry transition failed'; end if;

  select count(*) into v_count from public.integration_claim_outbox(10,'outbox-b',120);
  if v_count <> 1 then raise exception 'retry outbox command was not reclaimable'; end if;
  select idempotency_key into v_key from public.integration_outbox where id='e0000000-0000-4000-8000-000000000051';
  if v_key <> 'ifood:order-test:confirm:v1' then raise exception 'outbox retry changed idempotency key'; end if;

  v_ok := public.integration_finish_outbox(
    'e0000000-0000-4000-8000-000000000051','outbox-b','sent',null,null,null
  );
  if not v_ok then raise exception 'outbox sent transition failed'; end if;
end $$;

rollback;
