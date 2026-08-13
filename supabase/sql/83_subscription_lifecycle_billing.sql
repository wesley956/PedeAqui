-- PedeAqui — Milestone 23 [244]–[245]
-- Ciclo de assinatura e billing provider-agnostic.

create table public.billing_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null check (provider_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  external_event_id text not null check (char_length(trim(external_event_id)) between 2 and 240),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  status text not null default 'received' check (status in ('received','processed','failed')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_webhook_receipts_provider_event_unique unique(provider_key,external_event_id)
);

alter table public.billing_webhook_receipts enable row level security;
revoke all on table public.billing_webhook_receipts from anon,authenticated;
grant select,insert,update,delete on table public.billing_webhook_receipts to service_role;
create policy billing_webhook_receipts_browser_deny on public.billing_webhook_receipts for all to anon,authenticated using(false) with check(false);

create or replace function private.subscription_can_transition(p_from text,p_to text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select case
    when p_from is null then p_to in ('trialing','active','past_due')
    when p_from=p_to then true
    when p_from='trialing' then p_to in ('active','past_due','cancelled','expired')
    when p_from='active' then p_to in ('past_due','cancelled','expired')
    when p_from='past_due' then p_to in ('active','cancelled','expired')
    else false
  end;
$$;
revoke all on function private.subscription_can_transition(text,text) from public,anon,authenticated;

create or replace function public.subscription_apply_internal(
  p_organization_id uuid,
  p_plan_key text,
  p_to_status text,
  p_idempotency_key text,
  p_event_type text,
  p_billing_interval text default 'month',
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_trial_ends_at timestamptz default null,
  p_grace_ends_at timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_billing_provider_key text default null,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns public.organization_subscriptions
language plpgsql security invoker set search_path='' as $$
declare
  v_plan public.plans%rowtype;
  v_subscription public.organization_subscriptions%rowtype;
  v_existing_history public.subscription_history%rowtype;
  v_from text;
begin
  if char_length(trim(coalesce(p_idempotency_key,'')))<8 then raise exception 'subscription idempotency key is required'; end if;
  if p_to_status not in ('trialing','active','past_due','cancelled','expired') then raise exception 'invalid subscription status'; end if;
  if p_billing_interval not in ('month','year','manual') then raise exception 'invalid billing interval'; end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then raise exception 'subscription metadata must be an object'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,0));

  select * into v_existing_history from public.subscription_history
  where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing_history.id is not null then
    select * into v_subscription from public.organization_subscriptions where id=v_existing_history.subscription_id;
    return v_subscription;
  end if;

  select * into v_plan from public.plans where key=trim(p_plan_key) and active=true;
  if v_plan.id is null then raise exception 'active plan not found'; end if;

  select * into v_subscription from public.organization_subscriptions
  where organization_id=p_organization_id and status in ('trialing','active','past_due')
  order by created_at desc limit 1 for update;
  v_from:=v_subscription.status;

  if not private.subscription_can_transition(v_from,p_to_status) then
    raise exception 'invalid subscription transition % -> %',coalesce(v_from,'null'),p_to_status;
  end if;

  if v_subscription.id is null then
    insert into public.organization_subscriptions(
      organization_id,plan_id,status,billing_interval,current_period_start,current_period_end,trial_ends_at,grace_ends_at,
      cancel_at_period_end,cancelled_at,ended_at,billing_provider_key,provider_customer_id,provider_subscription_id,idempotency_key,metadata
    ) values (
      p_organization_id,v_plan.id,p_to_status,p_billing_interval,p_current_period_start,p_current_period_end,p_trial_ends_at,p_grace_ends_at,
      p_cancel_at_period_end,case when p_to_status='cancelled' then now() end,case when p_to_status in ('cancelled','expired') then now() end,
      nullif(trim(coalesce(p_billing_provider_key,'')),''),nullif(trim(coalesce(p_provider_customer_id,'')),''),nullif(trim(coalesce(p_provider_subscription_id,'')),''),trim(p_idempotency_key),coalesce(p_metadata,'{}'::jsonb)
    ) returning * into v_subscription;
  else
    update public.organization_subscriptions set
      plan_id=v_plan.id,
      status=p_to_status,
      billing_interval=p_billing_interval,
      current_period_start=coalesce(p_current_period_start,current_period_start),
      current_period_end=coalesce(p_current_period_end,current_period_end),
      trial_ends_at=coalesce(p_trial_ends_at,trial_ends_at),
      grace_ends_at=coalesce(p_grace_ends_at,grace_ends_at),
      cancel_at_period_end=p_cancel_at_period_end,
      cancelled_at=case when p_to_status='cancelled' then coalesce(cancelled_at,now()) else cancelled_at end,
      ended_at=case when p_to_status in ('cancelled','expired') then coalesce(ended_at,now()) else null end,
      billing_provider_key=coalesce(nullif(trim(coalesce(p_billing_provider_key,'')),''),billing_provider_key),
      provider_customer_id=coalesce(nullif(trim(coalesce(p_provider_customer_id,'')),''),provider_customer_id),
      provider_subscription_id=coalesce(nullif(trim(coalesce(p_provider_subscription_id,'')),''),provider_subscription_id),
      metadata=metadata||coalesce(p_metadata,'{}'::jsonb),
      updated_at=now()
    where id=v_subscription.id returning * into v_subscription;
  end if;

  insert into public.subscription_history(organization_id,subscription_id,from_status,to_status,event_type,idempotency_key,metadata)
  values(p_organization_id,v_subscription.id,v_from,p_to_status,trim(p_event_type),trim(p_idempotency_key),coalesce(p_metadata,'{}'::jsonb));

  return v_subscription;
end;
$$;
revoke all on function public.subscription_apply_internal(uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.subscription_apply_internal(uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,text,text,text,jsonb) to service_role;

create or replace function public.billing_webhook_receive_internal(
  p_provider_key text,p_external_event_id text,p_payload_hash text,p_payload jsonb
) returns public.billing_webhook_receipts
language plpgsql security invoker set search_path='' as $$
declare v_receipt public.billing_webhook_receipts%rowtype;
begin
  select * into v_receipt from public.billing_webhook_receipts
    where provider_key=trim(p_provider_key) and external_event_id=trim(p_external_event_id) for update;
  if v_receipt.id is not null then
    if v_receipt.payload_hash<>lower(trim(p_payload_hash)) then raise exception 'billing webhook replay payload mismatch'; end if;
    return v_receipt;
  end if;
  insert into public.billing_webhook_receipts(provider_key,external_event_id,payload_hash,payload)
  values(trim(p_provider_key),trim(p_external_event_id),lower(trim(p_payload_hash)),coalesce(p_payload,'{}'::jsonb)) returning * into v_receipt;
  return v_receipt;
end;
$$;
revoke all on function public.billing_webhook_receive_internal(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.billing_webhook_receive_internal(text,text,text,jsonb) to service_role;

create or replace function public.billing_webhook_finish_internal(
  p_receipt_id uuid,p_success boolean,p_error text default null
) returns public.billing_webhook_receipts
language plpgsql security invoker set search_path='' as $$
declare v_receipt public.billing_webhook_receipts%rowtype;
begin
  update public.billing_webhook_receipts set
    status=case when p_success then 'processed' else 'failed' end,
    error_message=case when p_success then null else left(coalesce(p_error,'billing webhook failed'),2000) end,
    processed_at=case when p_success then now() else processed_at end,
    updated_at=now()
  where id=p_receipt_id returning * into v_receipt;
  if v_receipt.id is null then raise exception 'billing webhook receipt not found'; end if;
  return v_receipt;
end;
$$;
revoke all on function public.billing_webhook_finish_internal(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.billing_webhook_finish_internal(uuid,boolean,text) to service_role;
