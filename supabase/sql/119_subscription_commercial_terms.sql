-- PedeAqui — PA-DIAG-060/065/066
-- Termos comerciais explícitos por assinatura, incluindo preço promocional permanente.

alter table public.plans
  add column if not exists monthly_price_cents integer check (monthly_price_cents is null or monthly_price_cents between 0 and 100000000),
  add column if not exists yearly_price_cents integer check (yearly_price_cents is null or yearly_price_cents between 0 and 100000000),
  add column if not exists currency text not null default 'BRL' check (currency = 'BRL');

alter table public.organization_subscriptions
  add column if not exists agreed_price_cents integer check (agreed_price_cents is null or agreed_price_cents between 0 and 100000000),
  add column if not exists price_currency text not null default 'BRL' check (price_currency = 'BRL'),
  add column if not exists price_locked boolean not null default false,
  add column if not exists price_locked_at timestamptz,
  add column if not exists price_lock_reason text check (price_lock_reason is null or char_length(trim(price_lock_reason)) between 5 and 500),
  add column if not exists billing_due_day smallint check (billing_due_day is null or billing_due_day between 1 and 28),
  add column if not exists next_due_at timestamptz,
  add column if not exists payment_status text not null default 'not_started'
    check (payment_status in ('not_started','pending','paid','overdue','waived'));

alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_price_lock_consistency;
alter table public.organization_subscriptions
  add constraint organization_subscriptions_price_lock_consistency check (
    not price_locked
    or (agreed_price_cents is not null and price_locked_at is not null and price_lock_reason is not null)
  );

comment on column public.organization_subscriptions.price_locked is
  'Quando verdadeiro, o valor acordado não acompanha reajustes do plano. A remoção do bloqueio exige nova ação auditada.';

create or replace function public.subscription_terms_update_internal(
  p_organization_id uuid,
  p_agreed_price_cents integer,
  p_price_locked boolean,
  p_price_lock_reason text,
  p_billing_due_day smallint,
  p_next_due_at timestamptz,
  p_payment_status text,
  p_reason text,
  p_protocol text,
  p_idempotency_key text,
  p_actor_user_id uuid
) returns public.organization_subscriptions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_existing public.subscription_history%rowtype;
  v_before jsonb;
  v_lock_reason text;
begin
  if p_agreed_price_cents is null or p_agreed_price_cents < 0 or p_agreed_price_cents > 100000000 then
    raise exception 'invalid agreed price';
  end if;
  if p_billing_due_day is not null and p_billing_due_day not between 1 and 28 then raise exception 'invalid billing due day'; end if;
  if p_payment_status not in ('not_started','pending','paid','overdue','waived') then raise exception 'invalid payment status'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'commercial reason required'; end if;
  if char_length(trim(coalesce(p_protocol,''))) not between 3 and 120 then raise exception 'commercial protocol required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 240 then raise exception 'idempotency key required'; end if;
  if p_actor_user_id is null then raise exception 'actor required'; end if;
  v_lock_reason := nullif(trim(coalesce(p_price_lock_reason,'')),'');
  if p_price_locked and (v_lock_reason is null or char_length(v_lock_reason) not between 5 and 500) then
    raise exception 'price lock reason required';
  end if;

  select * into v_existing from public.subscription_history
  where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then
    select * into v_subscription from public.organization_subscriptions where id=v_existing.subscription_id;
    return v_subscription;
  end if;

  select * into v_subscription from public.organization_subscriptions
  where organization_id=p_organization_id
  order by (status in ('trialing','active','past_due')) desc, updated_at desc, created_at desc
  limit 1 for update;
  if v_subscription.id is null then raise exception 'subscription not found'; end if;

  -- A trava da assinatura serializa dois submits simultâneos da mesma empresa.
  -- Revalidar depois da trava transforma a segunda chamada na mesma resposta,
  -- em vez de deixá-la bater na restrição única do histórico.
  select * into v_existing from public.subscription_history
  where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then
    select * into v_subscription from public.organization_subscriptions where id=v_existing.subscription_id;
    return v_subscription;
  end if;

  v_before := jsonb_build_object(
    'agreed_price_cents',v_subscription.agreed_price_cents,
    'price_locked',v_subscription.price_locked,
    'billing_due_day',v_subscription.billing_due_day,
    'next_due_at',v_subscription.next_due_at,
    'payment_status',v_subscription.payment_status
  );

  update public.organization_subscriptions set
    agreed_price_cents=p_agreed_price_cents,
    price_currency='BRL',
    price_locked=p_price_locked,
    price_locked_at=case when p_price_locked then coalesce(price_locked_at,now()) else null end,
    price_lock_reason=case when p_price_locked then v_lock_reason else null end,
    billing_due_day=p_billing_due_day,
    next_due_at=p_next_due_at,
    payment_status=p_payment_status,
    updated_at=now()
  where id=v_subscription.id returning * into v_subscription;

  insert into public.subscription_history(
    organization_id,subscription_id,from_status,to_status,event_type,idempotency_key,metadata
  ) values (
    p_organization_id,v_subscription.id,v_subscription.status,v_subscription.status,
    'platform.subscription_terms_updated',trim(p_idempotency_key),
    jsonb_build_object(
      'source','platform_admin','actor_user_id',p_actor_user_id,'reason',trim(p_reason),'protocol',trim(p_protocol),
      'before',v_before,
      'after',jsonb_build_object(
        'agreed_price_cents',v_subscription.agreed_price_cents,
        'price_locked',v_subscription.price_locked,
        'billing_due_day',v_subscription.billing_due_day,
        'next_due_at',v_subscription.next_due_at,
        'payment_status',v_subscription.payment_status
      )
    )
  );

  insert into public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id
  ) values (
    p_organization_id,p_actor_user_id,'platform.subscription_terms_updated','organization_subscription',v_subscription.id,
    v_before,
    jsonb_build_object(
      'agreed_price_cents',v_subscription.agreed_price_cents,
      'price_locked',v_subscription.price_locked,
      'billing_due_day',v_subscription.billing_due_day,
      'next_due_at',v_subscription.next_due_at,
      'payment_status',v_subscription.payment_status,
      'reason',trim(p_reason)
    ),
    trim(p_protocol)
  );
  return v_subscription;
end;
$$;

revoke all on function public.subscription_terms_update_internal(uuid,integer,boolean,text,smallint,timestamptz,text,text,text,text,uuid)
from public, anon, authenticated;
grant execute on function public.subscription_terms_update_internal(uuid,integer,boolean,text,smallint,timestamptz,text,text,text,text,uuid)
to service_role;
