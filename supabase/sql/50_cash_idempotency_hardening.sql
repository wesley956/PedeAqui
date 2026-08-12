-- PedeAqui — Milestone 17 hardening
-- Retry de movimento manual deve retornar a operação já registrada antes de revalidar saldo/estado.

create or replace function private.cash_insert_movement(
  p_session_id uuid,
  p_type text,
  p_direction text,
  p_amount_cents bigint,
  p_idempotency_key text,
  p_reason text default null,
  p_payment_id uuid default null,
  p_order_id uuid default null,
  p_reference_movement_id uuid default null,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns public.cash_movements
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.cash_sessions%rowtype;
  v_existing public.cash_movements%rowtype;
  v_result public.cash_movements%rowtype;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'invalid cash movement amount'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) < 8 or char_length(trim(p_idempotency_key)) > 240 then raise exception 'invalid cash movement idempotency key'; end if;
  if p_type not in ('opening','sale','supply','withdrawal','refund','adjustment') then raise exception 'invalid cash movement type'; end if;
  if p_direction not in ('in','out') then raise exception 'invalid cash movement direction'; end if;

  select * into v_session from public.cash_sessions where id=p_session_id for update;
  if v_session.id is null then raise exception 'cash session not found'; end if;

  select * into v_existing from public.cash_movements
  where organization_id=v_session.organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then
    if v_existing.cash_session_id<>v_session.id or v_existing.movement_type<>p_type or v_existing.direction<>p_direction or v_existing.amount_cents<>p_amount_cents then
      raise exception 'cash movement idempotency key reused with different payload';
    end if;
    return v_existing;
  end if;

  if v_session.status <> 'open' then raise exception 'cash session is closed'; end if;
  if p_direction='out' and p_amount_cents > private.cash_expected_balance(v_session.id) then
    raise exception 'cash outflow exceeds expected balance';
  end if;

  insert into public.cash_movements (
    organization_id, store_id, cash_session_id, movement_type, direction, amount_cents,
    payment_id, order_id, reference_movement_id, reason, idempotency_key, metadata, created_by
  ) values (
    v_session.organization_id, v_session.store_id, v_session.id, p_type, p_direction, p_amount_cents,
    p_payment_id, p_order_id, p_reference_movement_id, nullif(trim(coalesce(p_reason,'')),''),
    trim(p_idempotency_key), coalesce(p_metadata,'{}'::jsonb), p_actor_user_id
  ) returning * into v_result;
  return v_result;
end;
$$;
revoke all on function private.cash_insert_movement(uuid,text,text,bigint,text,text,uuid,uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function private.cash_insert_movement(uuid,text,text,bigint,text,text,uuid,uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.cash_manual_movement_internal(
  p_session_id uuid,
  p_type text,
  p_amount_cents bigint,
  p_reason text,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns public.cash_movements
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.cash_sessions%rowtype;
  v_existing public.cash_movements%rowtype;
  v_expected bigint;
  v_direction text;
  v_result public.cash_movements%rowtype;
begin
  if p_actor_user_id is null then raise exception 'cash operator is required'; end if;
  if p_type not in ('supply','withdrawal') then raise exception 'invalid manual cash movement type'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'invalid cash movement amount'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 or char_length(trim(p_reason)) > 500 then raise exception 'cash movement reason is required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) < 8 or char_length(trim(p_idempotency_key)) > 240 then raise exception 'invalid cash movement idempotency key'; end if;

  select * into v_session from public.cash_sessions where id=p_session_id for update;
  if v_session.id is null then raise exception 'cash session not found'; end if;

  select * into v_existing from public.cash_movements
  where organization_id=v_session.organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then
    if v_existing.cash_session_id<>v_session.id or v_existing.movement_type<>p_type or v_existing.amount_cents<>p_amount_cents then
      raise exception 'cash movement idempotency key reused with different payload';
    end if;
    return v_existing;
  end if;

  if v_session.status <> 'open' then raise exception 'cash session is closed'; end if;
  if p_type='withdrawal' then
    v_expected := private.cash_expected_balance(v_session.id);
    if p_amount_cents > v_expected then raise exception 'cash withdrawal exceeds expected balance'; end if;
    v_direction := 'out';
  else
    v_direction := 'in';
  end if;

  select * into v_result from private.cash_insert_movement(
    v_session.id,p_type,v_direction,p_amount_cents,trim(p_idempotency_key),trim(p_reason),
    null,null,null,p_actor_user_id,jsonb_build_object('source','manual')
  );

  insert into public.audit_logs (organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values (v_session.organization_id,v_session.store_id,p_actor_user_id,'cash.'||p_type,'cash_movement',v_result.id,
    jsonb_build_object('session_id',v_session.id,'amount_cents',p_amount_cents,'reason',trim(p_reason)));
  insert into public.domain_events (organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values (v_session.organization_id,v_session.store_id,'cash.'||p_type,'cash_movement',v_result.id,
    jsonb_build_object('session_id',v_session.id,'amount_cents',p_amount_cents),'pending',0,now(),p_actor_user_id);
  return v_result;
end;
$$;
revoke all on function public.cash_manual_movement_internal(uuid,text,bigint,text,text,uuid) from public, anon, authenticated;
grant execute on function public.cash_manual_movement_internal(uuid,text,bigint,text,text,uuid) to service_role;
