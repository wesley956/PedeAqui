-- PedeAqui — Milestone 17 [164]–[174]
-- Operações atômicas de configuração, abertura, movimentos, resumo e fechamento.

create or replace function public.cash_create_register_internal(
  p_store_id uuid,
  p_code text,
  p_name text,
  p_actor_user_id uuid default null
) returns public.cash_registers
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_result public.cash_registers%rowtype;
begin
  if p_code is null or trim(p_code) !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' then raise exception 'invalid cash register code'; end if;
  if char_length(trim(coalesce(p_name,''))) < 1 or char_length(trim(p_name)) > 80 then raise exception 'invalid cash register name'; end if;
  select * into v_store from public.stores where id=p_store_id and status='active';
  if v_store.id is null then raise exception 'store unavailable'; end if;

  insert into public.cash_registers (organization_id,store_id,code,name,created_by,updated_by)
  values (v_store.organization_id,v_store.id,lower(trim(p_code)),trim(p_name),p_actor_user_id,p_actor_user_id)
  returning * into v_result;

  insert into public.audit_logs (organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values (v_store.organization_id,v_store.id,p_actor_user_id,'cash.register_created','cash_register',v_result.id,
    jsonb_build_object('code',v_result.code,'name',v_result.name));
  insert into public.domain_events (organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values (v_store.organization_id,v_store.id,'cash.register_created','cash_register',v_result.id,
    jsonb_build_object('code',v_result.code,'name',v_result.name),'pending',0,now(),p_actor_user_id);
  return v_result;
end;
$$;
revoke all on function public.cash_create_register_internal(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.cash_create_register_internal(uuid,text,text,uuid) to service_role;

create or replace function public.cash_update_register_internal(
  p_cash_register_id uuid,
  p_name text,
  p_active boolean,
  p_actor_user_id uuid default null
) returns public.cash_registers
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.cash_registers%rowtype;
  v_result public.cash_registers%rowtype;
begin
  if char_length(trim(coalesce(p_name,''))) < 1 or char_length(trim(p_name)) > 80 then raise exception 'invalid cash register name'; end if;
  select * into v_before from public.cash_registers where id=p_cash_register_id for update;
  if v_before.id is null then raise exception 'cash register not found'; end if;
  if p_active=false and exists (select 1 from public.cash_sessions where cash_register_id=v_before.id and status='open') then
    raise exception 'cannot disable cash register with open session';
  end if;
  update public.cash_registers set name=trim(p_name),active=p_active,updated_by=p_actor_user_id,updated_at=now()
  where id=v_before.id returning * into v_result;
  insert into public.audit_logs (organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values (v_before.organization_id,v_before.store_id,p_actor_user_id,'cash.register_updated','cash_register',v_before.id,
    jsonb_build_object('name',v_before.name,'active',v_before.active),jsonb_build_object('name',v_result.name,'active',v_result.active));
  return v_result;
end;
$$;
revoke all on function public.cash_update_register_internal(uuid,text,boolean,uuid) from public, anon, authenticated;
grant execute on function public.cash_update_register_internal(uuid,text,boolean,uuid) to service_role;

create or replace function public.cash_open_session_internal(
  p_cash_register_id uuid,
  p_opening_balance_cents bigint,
  p_idempotency_key text,
  p_note text default null,
  p_actor_user_id uuid default null
) returns public.cash_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_register public.cash_registers%rowtype;
  v_existing public.cash_sessions%rowtype;
  v_session public.cash_sessions%rowtype;
begin
  if p_actor_user_id is null then raise exception 'cash operator is required'; end if;
  if p_opening_balance_cents is null or p_opening_balance_cents < 0 then raise exception 'invalid opening balance'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) < 8 or char_length(trim(p_idempotency_key)) > 240 then raise exception 'invalid cash open idempotency key'; end if;
  if p_note is not null and char_length(trim(p_note)) > 500 then raise exception 'opening note too long'; end if;

  select * into v_register from public.cash_registers where id=p_cash_register_id for update;
  if v_register.id is null or not v_register.active then raise exception 'cash register unavailable'; end if;

  select * into v_existing from public.cash_sessions
  where organization_id=v_register.organization_id and open_idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then return v_existing; end if;

  if exists (select 1 from public.cash_sessions where cash_register_id=v_register.id and status='open') then
    raise exception 'cash register already has an open session';
  end if;
  if exists (select 1 from public.cash_sessions where store_id=v_register.store_id and opened_by=p_actor_user_id and status='open') then
    raise exception 'operator already has an open cash session';
  end if;

  insert into public.cash_sessions (
    organization_id,store_id,cash_register_id,opening_balance_cents,open_idempotency_key,opening_note,opened_by
  ) values (
    v_register.organization_id,v_register.store_id,v_register.id,p_opening_balance_cents,trim(p_idempotency_key),
    nullif(trim(coalesce(p_note,'')),''),p_actor_user_id
  ) returning * into v_session;

  if p_opening_balance_cents > 0 then
    perform private.cash_insert_movement(
      v_session.id,'opening','in',p_opening_balance_cents,
      'cash-session:'||v_session.id::text||':opening','Saldo inicial',null,null,null,p_actor_user_id,
      jsonb_build_object('source','session_open')
    );
  end if;

  insert into public.audit_logs (organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values (v_session.organization_id,v_session.store_id,p_actor_user_id,'cash.session_opened','cash_session',v_session.id,
    jsonb_build_object('cash_register_id',v_session.cash_register_id,'opening_balance_cents',v_session.opening_balance_cents));
  insert into public.domain_events (organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values (v_session.organization_id,v_session.store_id,'cash.session_opened','cash_session',v_session.id,
    jsonb_build_object('cash_register_id',v_session.cash_register_id,'opening_balance_cents',v_session.opening_balance_cents),'pending',0,now(),p_actor_user_id);
  return v_session;
end;
$$;
revoke all on function public.cash_open_session_internal(uuid,bigint,text,text,uuid) from public, anon, authenticated;
grant execute on function public.cash_open_session_internal(uuid,bigint,text,text,uuid) to service_role;

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
  v_expected bigint;
  v_direction text;
  v_result public.cash_movements%rowtype;
begin
  if p_actor_user_id is null then raise exception 'cash operator is required'; end if;
  if p_type not in ('supply','withdrawal') then raise exception 'invalid manual cash movement type'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'invalid cash movement amount'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 or char_length(trim(p_reason)) > 500 then raise exception 'cash movement reason is required'; end if;

  select * into v_session from public.cash_sessions where id=p_session_id for update;
  if v_session.id is null then raise exception 'cash session not found'; end if;
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

create or replace function public.cash_session_summary_internal(p_session_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'session_id', s.id,
    'status', s.status,
    'opening_balance_cents', s.opening_balance_cents,
    'expected_cash_cents', private.cash_expected_balance(s.id),
    'counted_cash_cents', s.counted_cash_cents,
    'difference_cents', s.difference_cents,
    'totals', jsonb_build_object(
      'opening_cents', coalesce(sum(m.amount_cents) filter (where m.movement_type='opening'),0),
      'sales_cents', coalesce(sum(m.amount_cents) filter (where m.movement_type='sale'),0),
      'supplies_cents', coalesce(sum(m.amount_cents) filter (where m.movement_type='supply'),0),
      'withdrawals_cents', coalesce(sum(m.amount_cents) filter (where m.movement_type='withdrawal'),0),
      'refunds_cents', coalesce(sum(m.amount_cents) filter (where m.movement_type='refund'),0),
      'adjustments_in_cents', coalesce(sum(m.amount_cents) filter (where m.movement_type='adjustment' and m.direction='in'),0),
      'adjustments_out_cents', coalesce(sum(m.amount_cents) filter (where m.movement_type='adjustment' and m.direction='out'),0)
    )
  )
  from public.cash_sessions s
  left join public.cash_movements m on m.cash_session_id=s.id
  where s.id=p_session_id
  group by s.id;
$$;
revoke all on function public.cash_session_summary_internal(uuid) from public, anon, authenticated;
grant execute on function public.cash_session_summary_internal(uuid) to service_role;

create or replace function public.cash_close_session_internal(
  p_session_id uuid,
  p_counted_cash_cents bigint,
  p_idempotency_key text,
  p_note text default null,
  p_actor_user_id uuid default null
) returns public.cash_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.cash_sessions%rowtype;
  v_expected bigint;
begin
  if p_actor_user_id is null then raise exception 'cash operator is required'; end if;
  if p_counted_cash_cents is null or p_counted_cash_cents < 0 then raise exception 'invalid counted cash'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) < 8 or char_length(trim(p_idempotency_key)) > 240 then raise exception 'invalid cash close idempotency key'; end if;
  if p_note is not null and char_length(trim(p_note)) > 500 then raise exception 'closing note too long'; end if;

  select * into v_session from public.cash_sessions where id=p_session_id for update;
  if v_session.id is null then raise exception 'cash session not found'; end if;
  if v_session.status='closed' then
    if v_session.close_idempotency_key=trim(p_idempotency_key) then return v_session; end if;
    raise exception 'cash session is already closed';
  end if;

  v_expected := private.cash_expected_balance(v_session.id);
  update public.cash_sessions set
    status='closed',
    expected_cash_cents_snapshot=v_expected,
    counted_cash_cents=p_counted_cash_cents,
    difference_cents=p_counted_cash_cents-v_expected,
    close_idempotency_key=trim(p_idempotency_key),
    closing_note=nullif(trim(coalesce(p_note,'')),''),
    closed_by=p_actor_user_id,
    closed_at=now(),
    updated_at=now()
  where id=v_session.id
  returning * into v_session;

  insert into public.audit_logs (organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values (v_session.organization_id,v_session.store_id,p_actor_user_id,'cash.session_closed','cash_session',v_session.id,
    jsonb_build_object('expected_cash_cents',v_expected,'counted_cash_cents',p_counted_cash_cents,'difference_cents',v_session.difference_cents));
  insert into public.domain_events (organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values (v_session.organization_id,v_session.store_id,'cash.session_closed','cash_session',v_session.id,
    jsonb_build_object('cash_register_id',v_session.cash_register_id,'expected_cash_cents',v_expected,'counted_cash_cents',p_counted_cash_cents,'difference_cents',v_session.difference_cents),
    'pending',0,now(),p_actor_user_id);
  return v_session;
end;
$$;
revoke all on function public.cash_close_session_internal(uuid,bigint,text,text,uuid) from public, anon, authenticated;
grant execute on function public.cash_close_session_internal(uuid,bigint,text,text,uuid) to service_role;
