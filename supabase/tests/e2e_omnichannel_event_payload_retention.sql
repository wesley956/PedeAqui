-- PedeAqui OMNI #936 — terminal event payload retention without losing dedupe/audit identity.
-- Administrative TEST fixture; the entire transaction is rolled back.
begin;

insert into auth.users (id,email)
values ('e5555555-5555-4555-8555-555555555555','retention-omni@example.invalid');
insert into public.organizations (id,name,created_by)
values ('e1000000-0000-4000-8000-000000000001','Retention Omni Org','e5555555-5555-4555-8555-555555555555');
insert into public.stores (id,organization_id,name,slug,status)
values ('e1000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000001','Retention Store','retention-omni','active');
insert into public.integration_accounts (id,organization_id,provider,status)
values ('e1000000-0000-4000-8000-000000000021','e1000000-0000-4000-8000-000000000001','ifood','connected');

insert into public.integration_events (
  id,organization_id,store_id,integration_account_id,provider,capability,
  external_event_id,event_type,status,payload,received_at,processed_at
) values
(
  'e1000000-0000-4000-8000-000000000041','e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000021',
  'ifood','ifood_orders','retention-old-processed','ORDER_PLACED','processed',
  '{"customer":{"name":"PII must disappear","phone":"+5500000000000"},"orderId":"ext-old"}'::jsonb,
  now()-interval '31 days',now()-interval '30 days'
),
(
  'e1000000-0000-4000-8000-000000000042','e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000021',
  'ifood','ifood_orders','retention-old-ignored','UNKNOWN_EVENT','ignored',
  '{"customer":{"name":"Ignored PII"},"kind":"unknown"}'::jsonb,
  now()-interval '31 days',now()-interval '30 days'
),
(
  'e1000000-0000-4000-8000-000000000043','e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000021',
  'ifood','ifood_orders','retention-recent-processed','ORDER_PLACED','processed',
  '{"customer":{"name":"Still inside retention window"}}'::jsonb,
  now()-interval '2 days',now()-interval '1 day'
),
(
  'e1000000-0000-4000-8000-000000000044','e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000021',
  'ifood','ifood_orders','retention-dead-letter','ORDER_PLACED','dead_letter',
  '{"customer":{"name":"Needed for support/reprocess"}}'::jsonb,
  now()-interval '31 days',null
),
(
  'e1000000-0000-4000-8000-000000000045','e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000021',
  'ifood','ifood_orders','retention-retry','ORDER_PLACED','retry',
  '{"customer":{"name":"Needed for retry"}}'::jsonb,
  now()-interval '31 days',null
);

do $$
declare
  v_redacted integer;
  v_second integer;
  v_payload jsonb;
  v_redacted_at timestamptz;
  v_status text;
  v_external_event_id text;
  v_proc oid;
begin
  v_redacted := public.integration_redact_event_payloads(now()-interval '7 days', 100);
  if v_redacted <> 2 then
    raise exception 'expected 2 old terminal payloads redacted, got %', v_redacted;
  end if;

  select payload,payload_redacted_at,status,external_event_id
    into v_payload,v_redacted_at,v_status,v_external_event_id
    from public.integration_events where id='e1000000-0000-4000-8000-000000000041';
  if v_payload <> '{}'::jsonb or v_redacted_at is null then
    raise exception 'old processed payload was not safely redacted';
  end if;
  if v_status <> 'processed' or v_external_event_id <> 'retention-old-processed' then
    raise exception 'retention mutated durable event identity/state';
  end if;

  select payload into v_payload from public.integration_events where id='e1000000-0000-4000-8000-000000000042';
  if v_payload <> '{}'::jsonb then raise exception 'old ignored payload was not redacted'; end if;

  select payload into v_payload from public.integration_events where id='e1000000-0000-4000-8000-000000000043';
  if v_payload = '{}'::jsonb then raise exception 'recent terminal payload was redacted too early'; end if;

  select payload into v_payload from public.integration_events where id='e1000000-0000-4000-8000-000000000044';
  if v_payload = '{}'::jsonb then raise exception 'dead-letter payload must remain available for support/reprocess'; end if;

  select payload into v_payload from public.integration_events where id='e1000000-0000-4000-8000-000000000045';
  if v_payload = '{}'::jsonb then raise exception 'retry payload must remain available to the worker'; end if;

  v_second := public.integration_redact_event_payloads(now()-interval '7 days', 100);
  if v_second <> 0 then raise exception 'retention must be idempotent, second run redacted % rows', v_second; end if;

  select p.oid into v_proc
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='integration_redact_event_payloads'
   limit 1;
  if has_function_privilege('anon',v_proc,'EXECUTE') or has_function_privilege('authenticated',v_proc,'EXECUTE') then
    raise exception 'browser roles must not execute payload retention';
  end if;
end $$;

rollback;
