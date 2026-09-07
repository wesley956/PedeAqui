-- PedeAqui OMNI #939 — executable iFood order intake, SLA telemetry and
-- an intentionally paused 30-second scheduler. No merchant capability is enabled.

create extension if not exists pg_net with schema extensions;

alter table public.external_orders
  add column if not exists provider_created_at timestamptz,
  add column if not exists received_at timestamptz,
  add column if not exists imported_at timestamptz,
  add column if not exists confirmation_deadline timestamptz;

create or replace function private.integration_safe_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_value is null or pg_catalog.btrim(p_value) = '' then return null; end if;
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;
revoke all on function private.integration_safe_timestamptz(text)
  from public, anon, authenticated;
grant execute on function private.integration_safe_timestamptz(text)
  to service_role;

create or replace function private.integration_external_order_ifood_sla()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_received_at timestamptz;
  v_provider_created_at timestamptz;
begin
  if new.provider <> 'ifood' then return new; end if;

  v_provider_created_at := private.integration_safe_timestamptz(new.last_snapshot->>'createdAt');
  if new.last_external_event_id is not null then
    select e.received_at
      into v_event_received_at
    from public.integration_events e
    where e.organization_id = new.organization_id
      and e.store_id = new.store_id
      and e.integration_account_id = new.integration_account_id
      and e.provider = new.provider
      and e.external_event_id = new.last_external_event_id
    order by e.received_at asc
    limit 1;
  end if;

  if tg_op = 'INSERT' then
    new.provider_created_at := v_provider_created_at;
    new.received_at := coalesce(v_event_received_at, pg_catalog.now());
    new.imported_at := pg_catalog.now();
  else
    new.provider_created_at := coalesce(old.provider_created_at, v_provider_created_at);
    new.received_at := coalesce(old.received_at, v_event_received_at);
    new.imported_at := coalesce(old.imported_at, pg_catalog.now());
  end if;
  new.confirmation_deadline := case
    when new.provider_created_at is null then null
    else new.provider_created_at + interval '8 minutes'
  end;
  return new;
end;
$$;
revoke all on function private.integration_external_order_ifood_sla()
  from public, anon, authenticated;

drop trigger if exists external_orders_hydrate_ifood_sla on public.external_orders;
create trigger external_orders_hydrate_ifood_sla
before insert or update of last_external_event_id, last_snapshot
on public.external_orders
for each row execute function private.integration_external_order_ifood_sla();

update public.external_orders eo
set provider_created_at = coalesce(
      eo.provider_created_at,
      private.integration_safe_timestamptz(eo.last_snapshot->>'createdAt')
    ),
    received_at = coalesce(eo.received_at, (
      select e.received_at
      from public.integration_events e
      where e.organization_id = eo.organization_id
        and e.store_id = eo.store_id
        and e.integration_account_id = eo.integration_account_id
        and e.provider = eo.provider
        and e.external_event_id = eo.last_external_event_id
      order by e.received_at asc
      limit 1
    ), eo.created_at),
    imported_at = coalesce(eo.imported_at, eo.created_at),
    confirmation_deadline = coalesce(
      eo.confirmation_deadline,
      private.integration_safe_timestamptz(eo.last_snapshot->>'createdAt') + interval '8 minutes'
    )
where eo.provider = 'ifood';

create index if not exists external_orders_ifood_confirmation_sla_idx
  on public.external_orders(integration_account_id, store_id, confirmation_deadline)
  where provider = 'ifood' and confirmation_deadline is not null;

create or replace function public.integration_ifood_confirmation_sla(
  p_integration_account_ids uuid[],
  p_store_ids uuid[],
  p_risk_seconds integer default 120
)
returns table(
  organization_id uuid,
  store_id uuid,
  integration_account_id uuid,
  order_id uuid,
  external_order_id text,
  provider_created_at timestamptz,
  received_at timestamptz,
  imported_at timestamptz,
  confirmation_deadline timestamptz,
  provider_to_received_seconds bigint,
  received_to_imported_seconds bigint,
  seconds_remaining bigint,
  state text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_integration_account_ids is null
     or p_store_ids is null
     or pg_catalog.cardinality(p_integration_account_ids) = 0
     or pg_catalog.cardinality(p_integration_account_ids) <> pg_catalog.cardinality(p_store_ids)
     or exists (
       select 1
       from rows from (
         pg_catalog.unnest(p_integration_account_ids),
         pg_catalog.unnest(p_store_ids)
       ) as allowed_scope(account_id, allowed_store_id)
       where account_id is null or allowed_store_id is null
     ) then
    raise exception 'integration account/store allowlist is required and must contain matching pairs';
  end if;
  if p_risk_seconds is null or p_risk_seconds not between 30 and 480 then
    raise exception 'risk threshold must be between 30 and 480 seconds';
  end if;

  return query
  with allowed_scopes as (
    select account_id, allowed_store_id
    from rows from (
      pg_catalog.unnest(p_integration_account_ids),
      pg_catalog.unnest(p_store_ids)
    ) as allowed_scope(account_id, allowed_store_id)
  )
  select
    eo.organization_id,
    eo.store_id,
    eo.integration_account_id,
    eo.order_id,
    eo.external_order_id,
    eo.provider_created_at,
    eo.received_at,
    eo.imported_at,
    eo.confirmation_deadline,
    greatest(
      0,
      pg_catalog.floor(pg_catalog.date_part('epoch', eo.received_at - eo.provider_created_at))
    )::bigint,
    greatest(
      0,
      pg_catalog.floor(pg_catalog.date_part('epoch', eo.imported_at - eo.received_at))
    )::bigint,
    pg_catalog.floor(pg_catalog.date_part('epoch', eo.confirmation_deadline - pg_catalog.now()))::bigint,
    case
      when eo.confirmation_deadline <= pg_catalog.now() then 'expired'
      when eo.confirmation_deadline <= pg_catalog.now() + pg_catalog.make_interval(secs => p_risk_seconds) then 'risk'
      else 'healthy'
    end
  from public.external_orders eo
  join public.orders o
    on o.organization_id = eo.organization_id
   and o.store_id = eo.store_id
   and o.id = eo.order_id
  where eo.provider = 'ifood'
    and eo.provider_created_at is not null
    and eo.received_at is not null
    and eo.imported_at is not null
    and eo.confirmation_deadline is not null
    and o.order_status = 'pending_confirmation'
    and exists (
      select 1 from allowed_scopes allowed
      where allowed.account_id = eo.integration_account_id
        and allowed.allowed_store_id = eo.store_id
    )
  order by eo.confirmation_deadline asc
  limit 100;
end;
$$;
revoke all on function public.integration_ifood_confirmation_sla(uuid[], uuid[], integer)
  from public, anon, authenticated;
grant execute on function public.integration_ifood_confirmation_sla(uuid[], uuid[], integer)
  to service_role;

do $$
declare
  v_secret_id uuid;
begin
  select id into v_secret_id
  from vault.secrets
  where name = 'pedeaqui_internal_ifood_order_intake_token';

  if v_secret_id is null then
    perform vault.create_secret(
      pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
      'pedeaqui_internal_ifood_order_intake_token',
      'Token do agendador interno de entrada de pedidos iFood',
      null
    );
  end if;
end $$;

create or replace function public.authorize_internal_job_internal(p_job_key text,p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_token is null or pg_catalog.length(p_token) <> 64 then false
    else coalesce(
      extensions.digest(p_token, 'sha256') = extensions.digest(
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = case p_job_key
            when 'campaign_messages' then 'pedeaqui_internal_campaign_messages_token'
            when 'route_retention' then 'pedeaqui_internal_route_retention_token'
            when 'payment_reconciliation' then 'pedeaqui_internal_payment_reconciliation_token'
            when 'subscription_renewals' then 'pedeaqui_internal_subscription_renewals_token'
            when 'ifood_order_intake' then 'pedeaqui_internal_ifood_order_intake_token'
            else null
          end
          limit 1
        ),
        'sha256'
      ),
      false
    )
  end
$$;
revoke all on function public.authorize_internal_job_internal(text,text)
  from public, anon, authenticated;
grant execute on function public.authorize_internal_job_internal(text,text)
  to service_role;

create or replace function private.invoke_internal_job(p_job_key text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_secret_name text;
  v_token text;
begin
  select x.path, x.secret_name into v_path, v_secret_name
  from (values
    ('campaign_messages','/api/internal/campaign-messages','pedeaqui_internal_campaign_messages_token'),
    ('route_retention','/api/internal/route-retention','pedeaqui_internal_route_retention_token'),
    ('payment_reconciliation','/api/internal/payment-reconciliation','pedeaqui_internal_payment_reconciliation_token'),
    ('subscription_renewals','/api/internal/subscription-renewals','pedeaqui_internal_subscription_renewals_token'),
    ('ifood_order_intake','/api/internal/ifood-order-intake','pedeaqui_internal_ifood_order_intake_token')
  ) as x(job_key,path,secret_name)
  where x.job_key = p_job_key;

  if v_path is null then raise exception 'unknown internal job'; end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = v_secret_name
  limit 1;
  if v_token is null or pg_catalog.length(v_token) <> 64 then
    raise exception 'internal job token unavailable';
  end if;

  return net.http_get(
    url => 'https://www.pedeaqui.pp.ua' || v_path,
    headers => jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'User-Agent', 'PedeAqui-Supabase-Scheduler/1.0'
    ),
    timeout_milliseconds => 25000
  );
end;
$$;
revoke all on function private.invoke_internal_job(text)
  from public, anon, authenticated;

select cron.unschedule('pedeaqui-ifood-order-intake')
where exists(select 1 from cron.job where jobname = 'pedeaqui-ifood-order-intake');

select cron.schedule(
  'pedeaqui-ifood-order-intake',
  '30 seconds',
  $job$select private.invoke_internal_job('ifood_order_intake');$job$
);

-- Fail closed: code/schema can be promoted without producing iFood traffic.
select cron.alter_job(
  job_id => (select jobid from cron.job where jobname = 'pedeaqui-ifood-order-intake' limit 1),
  active => false
);

comment on column public.external_orders.provider_created_at is
  'Provider order creation instant used as the start of the iFood confirmation SLA.';
comment on column public.external_orders.received_at is
  'First durable provider event receipt used to measure polling/provider lag.';
comment on column public.external_orders.imported_at is
  'First canonical PedeAqui import instant used to measure intake lag.';
comment on column public.external_orders.confirmation_deadline is
  'Provider confirmation deadline. For iFood FOOD intake this is provider_created_at plus eight minutes.';
comment on function public.integration_ifood_confirmation_sla(uuid[], uuid[], integer) is
  'Backend-only PII-free lag and eight-minute confirmation SLA snapshot for exact enabled account/store pairs.';
