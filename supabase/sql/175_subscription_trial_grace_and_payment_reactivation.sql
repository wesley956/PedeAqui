create or replace function public.subscription_lifecycle_reconcile_internal(
  p_actor_user_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_trial_to_grace integer := 0;
  v_active_to_grace integer := 0;
  v_suspended integer := 0;
begin
  perform private.require_platform_super_admin(p_actor_user_id);

  with transitioned as (
    update public.organization_subscriptions s
    set status='past_due',
        payment_status=case when s.payment_status in ('paid','waived') then s.payment_status else 'overdue' end,
        grace_ends_at=coalesce(s.grace_ends_at, s.trial_ends_at + make_interval(days => s.grace_period_days::int)),
        updated_at=p_at
    where s.status='trialing'
      and s.trial_ends_at is not null
      and s.trial_ends_at <= p_at
      and s.payment_status not in ('paid','waived')
    returning s.id,s.organization_id,s.trial_ends_at,s.grace_ends_at
  )
  select count(*)::int into v_trial_to_grace from transitioned;

  insert into public.subscription_history(organization_id,subscription_id,from_status,to_status,event_type,idempotency_key,metadata)
  select s.organization_id,s.id,'trialing','past_due','trial_expired',
         'trial-expired:'||s.id::text||':'||to_char(s.trial_ends_at at time zone 'UTC','YYYYMMDDHH24MISS'),
         jsonb_build_object('reason','Período de teste encerrado sem pagamento','grace_ends_at',s.grace_ends_at)
  from public.organization_subscriptions s
  where s.status='past_due'
    and s.trial_ends_at is not null
    and s.trial_ends_at <= p_at
    and s.updated_at=p_at
  on conflict(organization_id,idempotency_key) do nothing;

  with transitioned as (
    update public.organization_subscriptions s
    set status='past_due',
        payment_status='overdue',
        grace_ends_at=coalesce(s.grace_ends_at, s.next_due_at + make_interval(days => s.grace_period_days::int)),
        updated_at=p_at
    where s.status='active'
      and s.next_due_at is not null
      and s.next_due_at <= p_at
      and s.payment_status not in ('paid','waived')
    returning s.id,s.organization_id,s.next_due_at,s.grace_ends_at
  )
  select count(*)::int into v_active_to_grace from transitioned;

  insert into public.subscription_history(organization_id,subscription_id,from_status,to_status,event_type,idempotency_key,metadata)
  select s.organization_id,s.id,'active','past_due','payment_overdue',
         'payment-overdue:'||s.id::text||':'||to_char(s.next_due_at at time zone 'UTC','YYYYMMDDHH24MISS'),
         jsonb_build_object('reason','Mensalidade vencida sem pagamento','grace_ends_at',s.grace_ends_at)
  from public.organization_subscriptions s
  where s.status='past_due'
    and s.next_due_at is not null
    and s.next_due_at <= p_at
    and s.updated_at=p_at
  on conflict(organization_id,idempotency_key) do nothing;

  with suspended as (
    update public.organization_subscriptions s
    set access_suspended_at=coalesce(s.access_suspended_at,p_at),
        access_suspension_reason=coalesce(s.access_suspension_reason,'Prazo de tolerância encerrado sem pagamento'),
        updated_at=p_at
    where s.status='past_due'
      and s.grace_ends_at is not null
      and s.grace_ends_at <= p_at
      and s.payment_status not in ('paid','waived')
      and s.access_suspended_at is null
    returning s.id,s.organization_id,s.grace_ends_at
  )
  select count(*)::int into v_suspended from suspended;

  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  select s.organization_id,p_actor_user_id,'platform.subscription.access_suspended','organization_subscription',s.id,
         jsonb_build_object('access_suspended_at',s.access_suspended_at,'grace_ends_at',s.grace_ends_at),
         'Prazo de tolerância encerrado sem pagamento','AUTO-LIFECYCLE'
  from public.organization_subscriptions s
  where s.access_suspended_at=p_at and s.updated_at=p_at;

  return jsonb_build_object(
    'trial_to_grace',v_trial_to_grace,
    'active_to_grace',v_active_to_grace,
    'suspended',v_suspended,
    'reconciled_at',p_at
  );
end;
$function$;

create or replace function public.subscription_payment_record_internal(
  p_invoice_id uuid,
  p_amount_cents integer,
  p_method text,
  p_status text,
  p_actor_user_id uuid,
  p_reason text,
  p_protocol text,
  p_idempotency_key text
)
returns public.subscription_payments
language plpgsql
set search_path to ''
as $function$
declare
  v_invoice public.subscription_invoices%rowtype;
  v_row public.subscription_payments%rowtype;
  v_sub public.organization_subscriptions%rowtype;
  v_next_due_at timestamptz;
  v_period_end timestamptz;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  select * into v_invoice from public.subscription_invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'invoice not found'; end if;

  select * into v_row from public.subscription_payments
  where organization_id=v_invoice.organization_id and idempotency_key=trim(p_idempotency_key);
  if v_row.id is not null then return v_row; end if;

  insert into public.subscription_payments(organization_id,invoice_id,amount_cents,method,status,paid_at,reason,protocol,idempotency_key,created_by)
  values(v_invoice.organization_id,v_invoice.id,p_amount_cents,p_method,p_status,case when p_status='paid' then now() end,trim(p_reason),trim(p_protocol),trim(p_idempotency_key),p_actor_user_id)
  returning * into v_row;

  if p_status='paid' then
    update public.subscription_invoices
    set status='paid',paid_at=coalesce(paid_at,now()),updated_at=now()
    where id=v_invoice.id;

    select * into v_sub from public.organization_subscriptions where id=v_invoice.subscription_id for update;
    if v_sub.id is null then raise exception 'subscription not found'; end if;

    v_next_due_at:=case
      when v_sub.billing_interval='year' then v_invoice.due_at+interval '1 year'
      when v_sub.billing_interval='month' then v_invoice.due_at+interval '1 month'
      else v_sub.next_due_at
    end;
    v_period_end:=case
      when v_sub.billing_interval='year' then v_invoice.due_at+interval '1 year'
      when v_sub.billing_interval='month' then v_invoice.due_at+interval '1 month'
      else v_sub.current_period_end
    end;

    update public.organization_subscriptions
    set status=case when v_sub.status in ('trialing','past_due') then 'active' else v_sub.status end,
        current_period_start=case when v_sub.billing_interval in ('month','year') then v_invoice.due_at else v_sub.current_period_start end,
        current_period_end=v_period_end,
        next_due_at=v_next_due_at,
        payment_status='paid',
        grace_ends_at=null,
        access_suspended_at=null,
        access_suspension_reason=null,
        updated_at=now()
    where id=v_sub.id;

    if v_sub.status in ('trialing','past_due') then
      insert into public.subscription_history(organization_id,subscription_id,from_status,to_status,event_type,idempotency_key,metadata)
      values(v_sub.organization_id,v_sub.id,v_sub.status,'active','payment_reactivated',
        'payment-reactivated:'||v_row.id::text,
        jsonb_build_object('reason','Pagamento confirmado','payment_id',v_row.id,'invoice_id',v_invoice.id,'next_due_at',v_next_due_at))
      on conflict(organization_id,idempotency_key) do nothing;
    end if;
  end if;

  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(v_invoice.organization_id,p_actor_user_id,'platform.payment.recorded','subscription_payment',v_row.id,to_jsonb(v_row)-'provider_reference',trim(p_reason),trim(p_protocol));
  return v_row;
end;
$function$;

create or replace function public.subscription_pix_charge_confirm_internal(
  p_charge_id uuid,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_status_detail text,
  p_paid_at timestamp with time zone,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_charge public.subscription_pix_charges%rowtype;
  v_subscription public.organization_subscriptions%rowtype;
  v_payment public.subscription_payments%rowtype;
  v_protocol text;
begin
  perform private.require_platform_super_admin(p_actor_user_id);
  select * into v_charge from public.subscription_pix_charges where id=p_charge_id for update;
  if v_charge.id is null then raise exception 'subscription pix charge not found'; end if;
  if v_charge.provider_order_id is null or v_charge.provider_order_id is distinct from p_provider_order_id then raise exception 'subscription pix provider order mismatch'; end if;
  select * into v_subscription from public.organization_subscriptions where id=v_charge.subscription_id and organization_id=v_charge.organization_id for update;
  if v_subscription.id is null then raise exception 'subscription not found'; end if;
  if v_charge.status='paid' then
    return jsonb_build_object('charge_id',v_charge.id,'status','paid','idempotent',true,'next_due_at',v_subscription.next_due_at);
  end if;
  if v_charge.status in ('cancelled','failed') then raise exception 'subscription pix charge cannot be confirmed from terminal status'; end if;
  if v_subscription.billing_interval not in ('month','year') then raise exception 'automatic pix renewal requires month or year billing interval'; end if;
  if v_subscription.next_due_at is null then raise exception 'subscription next due date is required'; end if;

  v_protocol:='MP-'||left(p_provider_order_id,40);
  v_payment:=public.subscription_payment_record_internal(
    v_charge.invoice_id,v_charge.amount_cents,'pix','paid',p_actor_user_id,
    'PIX da mensalidade confirmado automaticamente pelo Mercado Pago',v_protocol,'auto-pix-payment:'||v_charge.id::text
  );

  update public.subscription_payments
  set provider_key=v_charge.provider_key,provider_reference=p_provider_order_id,updated_at=now()
  where id=v_payment.id;

  update public.subscription_pix_charges
  set provider_payment_id=coalesce(p_provider_payment_id,provider_payment_id),status='paid',status_detail=p_status_detail,paid_at=coalesce(p_paid_at,now()),updated_at=now()
  where id=v_charge.id;

  select * into v_subscription from public.organization_subscriptions where id=v_charge.subscription_id;

  insert into public.platform_financial_audit(organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol)
  values(v_charge.organization_id,p_actor_user_id,'platform.subscription_pix_paid','subscription_pix_charge',v_charge.id,
    jsonb_build_object('provider',v_charge.provider_key,'provider_order_id',p_provider_order_id,'provider_payment_id',p_provider_payment_id,'payment_id',v_payment.id,'next_due_at',v_subscription.next_due_at),
    'PIX da mensalidade conciliado automaticamente',v_protocol);

  return jsonb_build_object('charge_id',v_charge.id,'payment_id',v_payment.id,'status','paid','idempotent',false,'next_due_at',v_subscription.next_due_at);
end;
$function$;