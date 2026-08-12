-- PedeAqui — Milestone 17 [169]–[170]
-- Integra pagamentos em dinheiro ao caixa sem tornar cash_movements a fonte de verdade financeira.

create or replace function private.cash_open_session_for_actor(p_store_id uuid, p_actor_user_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if p_actor_user_id is null then raise exception 'open cash session required for cash payment'; end if;
  select s.id into v_session_id
  from public.cash_sessions s
  where s.store_id=p_store_id and s.opened_by=p_actor_user_id and s.status='open'
  for update;
  if v_session_id is null then raise exception 'open cash session required for cash payment'; end if;
  return v_session_id;
end;
$$;
revoke all on function private.cash_open_session_for_actor(uuid,uuid) from public, anon, authenticated;
grant execute on function private.cash_open_session_for_actor(uuid,uuid) to service_role;

create or replace function private.sync_cash_payment_movement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_original public.cash_movements%rowtype;
  v_actor uuid;
begin
  if new.method <> 'cash' then return new; end if;

  if tg_op='INSERT' then
    if new.status='paid' then
      v_actor := new.confirmed_by;
      v_session_id := private.cash_open_session_for_actor(new.store_id,v_actor);
      perform private.cash_insert_movement(
        v_session_id,'sale','in',new.amount_cents,
        'payment:'||new.id::text||':cash:paid',
        'Venda em dinheiro',new.id,new.order_id,null,v_actor,
        jsonb_build_object('source','payment','payment_source',new.source)
      );
    elsif new.status='refunded' then
      raise exception 'cash payment cannot be inserted already refunded';
    end if;
    return new;
  end if;

  if new.status='paid' and old.status is distinct from 'paid' then
    v_actor := new.confirmed_by;
    v_session_id := private.cash_open_session_for_actor(new.store_id,v_actor);
    perform private.cash_insert_movement(
      v_session_id,'sale','in',new.amount_cents,
      'payment:'||new.id::text||':cash:paid',
      'Venda em dinheiro',new.id,new.order_id,null,v_actor,
      jsonb_build_object('source','payment','payment_source',new.source)
    );
  elsif new.status='refunded' and old.status is distinct from 'refunded' then
    begin
      v_actor := nullif(new.metadata->>'refunded_by','')::uuid;
    exception when invalid_text_representation then
      v_actor := null;
    end;
    v_session_id := private.cash_open_session_for_actor(new.store_id,v_actor);
    select * into v_original from public.cash_movements
    where payment_id=new.id and movement_type='sale';
    if v_original.id is null then raise exception 'cash sale movement missing for refund'; end if;
    perform private.cash_insert_movement(
      v_session_id,'refund','out',new.amount_cents,
      'payment:'||new.id::text||':cash:refunded',
      coalesce(nullif(new.metadata->>'refund_reason',''),'Estorno em dinheiro'),
      new.id,new.order_id,v_original.id,v_actor,
      jsonb_build_object('source','payment_refund','original_cash_session_id',v_original.cash_session_id)
    );
  end if;
  return new;
end;
$$;
revoke all on function private.sync_cash_payment_movement() from public, anon, authenticated;

drop trigger if exists payments_sync_cash_movement on public.payments;
create trigger payments_sync_cash_movement
after insert or update of status on public.payments
for each row execute function private.sync_cash_payment_movement();

create or replace function public.payment_refund_internal(
  p_payment_id uuid,
  p_reason text,
  p_actor_user_id uuid default null,
  p_source text default 'panel'
) returns public.payments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_remaining_paid bigint;
  v_target_status text;
begin
  if p_actor_user_id is null then raise exception 'refund actor is required'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 or char_length(trim(p_reason)) > 500 then raise exception 'refund reason is required'; end if;
  if p_source not in ('checkout','panel','pdv','integration','system') then raise exception 'invalid payment source'; end if;

  select * into v_payment from public.payments where id=p_payment_id for update;
  if v_payment.id is null then raise exception 'payment not found'; end if;
  if v_payment.status='refunded' then return v_payment; end if;
  if v_payment.status<>'paid' then raise exception 'only paid payment can be refunded'; end if;

  update public.payments set
    status='refunded',
    refunded_at=now(),
    updated_at=now(),
    metadata=metadata || jsonb_build_object('refund_reason',trim(p_reason),'refunded_by',p_actor_user_id)
  where id=v_payment.id
  returning * into v_payment;

  select * into v_order from public.orders where id=v_payment.order_id for update;
  select coalesce(sum(amount_cents),0)::bigint into v_remaining_paid
  from public.payments where order_id=v_payment.order_id and status='paid';

  if v_remaining_paid=0 then v_target_status:='refunded';
  elsif v_remaining_paid < v_order.total_cents then v_target_status:='partially_refunded';
  else v_target_status:=v_order.payment_status;
  end if;

  if v_target_status is distinct from v_order.payment_status then
    perform public.order_transition_internal(v_order.id,'payment',v_target_status,trim(p_reason),p_actor_user_id,p_source);
  end if;

  insert into public.domain_events (organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values (v_payment.organization_id,v_payment.store_id,'payment.refunded','payment',v_payment.id,
    jsonb_build_object('order_id',v_payment.order_id,'method',v_payment.method,'amount_cents',v_payment.amount_cents,'reason',trim(p_reason)),
    'pending',0,now(),p_actor_user_id);
  return v_payment;
end;
$$;
revoke all on function public.payment_refund_internal(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.payment_refund_internal(uuid,text,uuid,text) to service_role;
