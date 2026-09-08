-- PedeAqui OMNI #948 — support retry is idempotent, audited and preserves provider idempotency.
begin;

insert into auth.users (id,email)
values ('f4444444-4444-4444-8444-444444444444','quality-omni-support@example.invalid');
insert into public.organizations (id,name,created_by)
values ('f0000000-0000-4000-8000-000000000001','Quality Omni Support Org','f4444444-4444-4444-8444-444444444444');
insert into public.stores (id,organization_id,name,slug,status)
values ('f0000000-0000-4000-8000-000000000011','f0000000-0000-4000-8000-000000000001','Omni Support Store','quality-omni-support','active');
insert into public.integration_accounts (id,organization_id,provider,status)
values ('f0000000-0000-4000-8000-000000000021','f0000000-0000-4000-8000-000000000001','ifood','connected');

insert into public.integration_outbox (
  id,organization_id,store_id,integration_account_id,provider,capability,operation,
  idempotency_key,payload,status,attempts,last_error_kind,last_error,available_at
) values (
  'f0000000-0000-4000-8000-000000000051',
  'f0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000011',
  'f0000000-0000-4000-8000-000000000021',
  'ifood','ifood_orders','confirm','ifood:support-order:confirm:v1','{}'::jsonb,
  'dead_letter',4,'provider_failure','provider timeout',now()+interval '1 day'
);

do $$
declare
  v_ok boolean;
  v_status text;
  v_key text;
  v_error_kind text;
  v_error text;
  v_available_at timestamptz;
  v_audit_count integer;
begin
  v_ok := public.integration_reprocess_outbox(
    'f0000000-0000-4000-8000-000000000051',
    'f4444444-4444-4444-8444-444444444444',
    'corr-support-retry'
  );
  if not v_ok then raise exception 'support retry should accept retry/dead-letter command'; end if;

  select status,idempotency_key,last_error_kind,last_error,available_at
    into v_status,v_key,v_error_kind,v_error,v_available_at
    from public.integration_outbox
   where id='f0000000-0000-4000-8000-000000000051';

  if v_status <> 'pending' then raise exception 'support retry did not return command to pending'; end if;
  if v_key <> 'ifood:support-order:confirm:v1' then raise exception 'support retry changed provider idempotency key'; end if;
  if v_error_kind is not null or v_error is not null then raise exception 'support retry did not clear previous diagnostic error'; end if;
  if v_available_at > now() + interval '5 seconds' then raise exception 'support retry did not make command available now'; end if;

  select count(*) into v_audit_count
    from public.integration_audit_log
   where action='outbox_reprocessed'
     and correlation_id='corr-support-retry'
     and actor_user_id='f4444444-4444-4444-8444-444444444444';
  if v_audit_count <> 1 then raise exception 'support retry audit missing or duplicated'; end if;

  v_ok := public.integration_reprocess_outbox(
    'f0000000-0000-4000-8000-000000000051',
    'f4444444-4444-4444-8444-444444444444',
    'corr-support-retry-second'
  );
  if v_ok then raise exception 'second retry should be rejected while command is already pending'; end if;
  if (select count(*) from public.integration_audit_log where correlation_id='corr-support-retry-second') <> 0 then
    raise exception 'rejected retry must not create an audit record';
  end if;
end $$;

rollback;
