-- PedeAqui — confirmação atômica do PIX da assinatura
-- Garante que webhook repetido não duplique pagamento nem avance o vencimento duas vezes.

create or replace function public.subscription_pix_charge_confirm_internal(
  p_charge_id uuid,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_status_detail text,
  p_paid_at timestamptz,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_charge public.subscription_pix_charges%rowtype;
  v_subscription public.organization_subscriptions%rowtype;
  v_payment public.subscription_payments%rowtype;
  v_next_due_at timestamptz;
  v_protocol text;
begin
  perform private.require_platform_super_admin(p_actor_user_id);

  select * into v_charge
  from public.subscription_pix_charges
  where id=p_charge_id
  for update;

  if v_charge.id is null then raise exception 'subscription pix charge not found'; end if;
  if v_charge.provider_order_id is null or v_charge.provider_order_id is distinct from p_provider_order_id then
    raise exception 'subscription pix provider order mismatch';
  end if;

  select * into v_subscription
  from public.organization_subscriptions
  where id=v_charge.subscription_id and organization_id=v_charge.organization_id
  for update;
  if v_subscription.id is null then raise exception 'subscription not found'; end if;

  -- O ledger pago é a trava de idempotência de negócio. Depois que chegamos aqui uma vez,
  -- repetições do mesmo webhook apenas devolvem o estado atual.
  if v_charge.status='paid' then
    return jsonb_build_object(
      'charge_id',v_charge.id,
      'status','paid',
      'idempotent',true,
      'next_due_at',v_subscription.next_due_at
    );
  end if;

  if v_charge.status in ('cancelled','failed') then
    raise exception 'subscription pix charge cannot be confirmed from terminal status';
  end if;
  if v_subscription.billing_interval not in ('month','year') then
    raise exception 'automatic pix renewal requires month or year billing interval';
  end if;
  if v_subscription.next_due_at is null then
    raise exception 'subscription next due date is required';
  end if;

  v_protocol:='MP-'||left(p_provider_order_id,40);

  v_payment:=public.subscription_payment_record_internal(
    v_charge.invoice_id,
    v_charge.amount_cents,
    'pix',
    'paid',
    p_actor_user_id,
    'PIX da mensalidade confirmado automaticamente pelo Mercado Pago',
    v_protocol,
    'auto-pix-payment:'||v_charge.id::text
  );

  update public.subscription_payments
  set provider_key=v_charge.provider_key,
      provider_reference=p_provider_order_id,
      updated_at=now()
  where id=v_payment.id;

  v_next_due_at:=case
    when v_subscription.billing_interval='year' then v_subscription.next_due_at+interval '1 year'
    else v_subscription.next_due_at+interval '1 month'
  end;

  update public.organization_subscriptions
  set next_due_at=v_next_due_at,
      payment_status='paid',
      updated_at=now()
  where id=v_subscription.id;

  update public.subscription_pix_charges
  set provider_payment_id=coalesce(p_provider_payment_id,provider_payment_id),
      status='paid',
      status_detail=p_status_detail,
      paid_at=coalesce(p_paid_at,now()),
      updated_at=now()
  where id=v_charge.id;

  insert into public.platform_financial_audit(
    organization_id,actor_user_id,action,entity_type,entity_id,after_data,reason,protocol
  ) values(
    v_charge.organization_id,
    p_actor_user_id,
    'platform.subscription_pix_paid',
    'subscription_pix_charge',
    v_charge.id,
    jsonb_build_object(
      'provider',v_charge.provider_key,
      'provider_order_id',p_provider_order_id,
      'provider_payment_id',p_provider_payment_id,
      'payment_id',v_payment.id,
      'next_due_at',v_next_due_at
    ),
    'PIX da mensalidade conciliado automaticamente',
    v_protocol
  );

  return jsonb_build_object(
    'charge_id',v_charge.id,
    'payment_id',v_payment.id,
    'status','paid',
    'idempotent',false,
    'next_due_at',v_next_due_at
  );
end;
$$;

revoke all on function public.subscription_pix_charge_confirm_internal(uuid,text,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.subscription_pix_charge_confirm_internal(uuid,text,text,text,timestamptz,uuid) to service_role;
