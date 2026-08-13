-- PedeAqui — Milestone 18 [175]–[185]
-- Operações atômicas/idempotentes da execução logística.

create or replace function private.delivery_ensure(p_order_id uuid, p_actor_user_id uuid default null)
returns public.deliveries
language plpgsql security invoker set search_path='' as $$
declare
  v_order public.orders%rowtype;
  v_delivery public.deliveries%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'order not found'; end if;
  if v_order.fulfillment_type <> 'delivery' then raise exception 'order is not delivery'; end if;

  insert into public.deliveries(organization_id,store_id,order_id,promised_by_at)
  values (
    v_order.organization_id,v_order.store_id,v_order.id,
    case when v_order.delivery_estimated_max_minutes is null then null
      else v_order.created_at + make_interval(mins => v_order.delivery_estimated_max_minutes) end
  )
  on conflict (order_id) do nothing;

  select * into v_delivery from public.deliveries where order_id=v_order.id for update;
  insert into public.delivery_history(
    organization_id,store_id,delivery_id,order_id,event_type,idempotency_key,actor_user_id,metadata
  ) values (
    v_delivery.organization_id,v_delivery.store_id,v_delivery.id,v_delivery.order_id,'created',
    'delivery:'||v_delivery.id::text||':created',p_actor_user_id,
    jsonb_build_object('promised_by_at',v_delivery.promised_by_at)
  ) on conflict (organization_id,idempotency_key) do nothing;
  return v_delivery;
end; $$;
revoke all on function private.delivery_ensure(uuid,uuid) from public,anon,authenticated;
grant execute on function private.delivery_ensure(uuid,uuid) to service_role;

create or replace function public.delivery_create_driver_internal(
  p_store_id uuid,
  p_name text,
  p_phone text default null,
  p_user_id uuid default null,
  p_max_active_deliveries integer default 3,
  p_actor_user_id uuid default null
) returns public.drivers
language plpgsql security invoker set search_path='' as $$
declare
  v_store public.stores%rowtype;
  v_driver public.drivers%rowtype;
begin
  if p_actor_user_id is null then raise exception 'driver actor is required'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'invalid driver name'; end if;
  if p_phone is not null and char_length(trim(p_phone)) not between 8 and 30 then raise exception 'invalid driver phone'; end if;
  if p_max_active_deliveries not between 1 and 20 then raise exception 'invalid driver capacity'; end if;
  select * into v_store from public.stores where id=p_store_id;
  if v_store.id is null then raise exception 'store not found'; end if;

  if p_user_id is not null and not exists(
    select 1 from public.organization_members m
    where m.organization_id=v_store.organization_id and m.user_id=p_user_id and m.status='active'
      and (exists(select 1 from public.user_store_roles usr where usr.organization_id=m.organization_id and usr.store_id=v_store.id and usr.user_id=p_user_id)
        or exists(select 1 from public.roles r where r.id=m.role_id and r.key='owner'))
  ) then raise exception 'driver user is not active in store'; end if;

  insert into public.drivers(organization_id,store_id,user_id,name,phone,max_active_deliveries,created_by,updated_by)
  values(v_store.organization_id,v_store.id,p_user_id,trim(p_name),nullif(trim(coalesce(p_phone,'')),''),p_max_active_deliveries,p_actor_user_id,p_actor_user_id)
  returning * into v_driver;

  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(v_driver.organization_id,v_driver.store_id,p_actor_user_id,'delivery.driver_created','driver',v_driver.id,to_jsonb(v_driver));
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values(v_driver.organization_id,v_driver.store_id,'delivery.driver_created','driver',v_driver.id,jsonb_build_object('user_id',v_driver.user_id,'name',v_driver.name),'pending',0,now(),p_actor_user_id);
  return v_driver;
end; $$;
revoke all on function public.delivery_create_driver_internal(uuid,text,text,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.delivery_create_driver_internal(uuid,text,text,uuid,integer,uuid) to service_role;

create or replace function public.delivery_update_driver_internal(
  p_driver_id uuid,
  p_name text,
  p_phone text,
  p_active boolean,
  p_on_duty boolean,
  p_max_active_deliveries integer,
  p_actor_user_id uuid default null
) returns public.drivers
language plpgsql security invoker set search_path='' as $$
declare
  v_before public.drivers%rowtype;
  v_after public.drivers%rowtype;
  v_active integer;
begin
  if p_actor_user_id is null then raise exception 'driver actor is required'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'invalid driver name'; end if;
  if p_phone is not null and char_length(trim(p_phone)) not between 8 and 30 then raise exception 'invalid driver phone'; end if;
  if p_max_active_deliveries not between 1 and 20 then raise exception 'invalid driver capacity'; end if;
  select * into v_before from public.drivers where id=p_driver_id and deleted_at is null for update;
  if v_before.id is null then raise exception 'driver not found'; end if;

  select count(*)::integer into v_active
  from public.deliveries d join public.orders o on o.id=d.order_id
  where d.driver_id=v_before.id and o.fulfillment_status in ('assigned','picked_up','out_for_delivery');
  if v_active > p_max_active_deliveries then raise exception 'driver capacity below active deliveries'; end if;
  if (not p_active or not p_on_duty) and v_active > 0 then raise exception 'driver has active deliveries'; end if;

  update public.drivers set name=trim(p_name),phone=nullif(trim(coalesce(p_phone,'')),''),active=p_active,
    on_duty=case when p_active then p_on_duty else false end,max_active_deliveries=p_max_active_deliveries,
    updated_by=p_actor_user_id,updated_at=now()
  where id=v_before.id returning * into v_after;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(v_after.organization_id,v_after.store_id,p_actor_user_id,'delivery.driver_updated','driver',v_after.id,to_jsonb(v_before),to_jsonb(v_after));
  return v_after;
end; $$;
revoke all on function public.delivery_update_driver_internal(uuid,text,text,boolean,boolean,integer,uuid) from public,anon,authenticated;
grant execute on function public.delivery_update_driver_internal(uuid,text,text,boolean,boolean,integer,uuid) to service_role;

create or replace function public.delivery_mark_waiting_internal(
  p_order_id uuid,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_order public.orders%rowtype;
  v_delivery public.deliveries%rowtype;
begin
  if p_actor_user_id is null then raise exception 'delivery actor is required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 240 then raise exception 'invalid delivery idempotency key'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'order not found'; end if;
  if v_order.fulfillment_type <> 'delivery' then raise exception 'order is not delivery'; end if;
  if v_order.order_status <> 'confirmed' then raise exception 'order must be confirmed before delivery starts'; end if;
  if v_order.production_status not in ('ready','not_required') then raise exception 'production must be ready before delivery starts'; end if;
  if v_order.fulfillment_status='pending' then
    perform public.order_transition_internal(v_order.id,'fulfillment','awaiting_assignment',null,p_actor_user_id,'panel');
  elsif v_order.fulfillment_status not in ('awaiting_assignment','assigned','picked_up','out_for_delivery','delivered') then
    raise exception 'delivery cannot start from fulfillment state %',v_order.fulfillment_status;
  end if;
  v_delivery := private.delivery_ensure(v_order.id,p_actor_user_id);
  return jsonb_build_object('delivery_id',v_delivery.id,'order_id',v_order.id,'changed',v_order.fulfillment_status='pending');
end; $$;
revoke all on function public.delivery_mark_waiting_internal(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.delivery_mark_waiting_internal(uuid,text,uuid) to service_role;

create or replace function public.delivery_assign_internal(
  p_order_id uuid,
  p_driver_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_order public.orders%rowtype;
  v_delivery public.deliveries%rowtype;
  v_driver public.drivers%rowtype;
  v_existing public.delivery_history%rowtype;
  v_active integer;
  v_event text;
  v_from_driver uuid;
begin
  if p_actor_user_id is null then raise exception 'delivery actor is required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 240 then raise exception 'invalid delivery idempotency key'; end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'order not found'; end if;
  if v_order.fulfillment_type <> 'delivery' then raise exception 'order is not delivery'; end if;
  if v_order.order_status <> 'confirmed' then raise exception 'order must be confirmed before assignment'; end if;
  if v_order.production_status not in ('ready','not_required') then raise exception 'production must be ready before assignment'; end if;
  if v_order.fulfillment_status='pending' then
    perform public.order_transition_internal(v_order.id,'fulfillment','awaiting_assignment',null,p_actor_user_id,'panel');
    v_order.fulfillment_status := 'awaiting_assignment';
  end if;
  if v_order.fulfillment_status not in ('awaiting_assignment','assigned') then raise exception 'order is not assignable'; end if;

  v_delivery := private.delivery_ensure(v_order.id,p_actor_user_id);
  select * into v_existing from public.delivery_history
  where organization_id=v_delivery.organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then
    if v_existing.delivery_id<>v_delivery.id or v_existing.to_driver_id is distinct from p_driver_id then
      raise exception 'delivery idempotency key reused with different payload';
    end if;
    return jsonb_build_object('delivery_id',v_delivery.id,'driver_id',v_existing.to_driver_id,'changed',false);
  end if;

  select * into v_driver from public.drivers where id=p_driver_id and organization_id=v_delivery.organization_id and store_id=v_delivery.store_id and deleted_at is null for update;
  if v_driver.id is null then raise exception 'driver not found'; end if;
  if not v_driver.active or not v_driver.on_duty then raise exception 'driver is not available'; end if;
  if v_delivery.driver_id=p_driver_id and v_order.fulfillment_status='assigned' then
    return jsonb_build_object('delivery_id',v_delivery.id,'driver_id',p_driver_id,'changed',false);
  end if;

  select count(*)::integer into v_active
  from public.deliveries d join public.orders o on o.id=d.order_id
  where d.driver_id=v_driver.id and d.id<>v_delivery.id and o.fulfillment_status in ('assigned','picked_up','out_for_delivery');
  if v_active >= v_driver.max_active_deliveries then raise exception 'driver capacity reached'; end if;

  v_from_driver := v_delivery.driver_id;
  if v_from_driver is not null and v_from_driver<>p_driver_id and char_length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'reassignment reason required';
  end if;
  v_event := case when v_from_driver is null then 'assigned' else 'reassigned' end;

  update public.deliveries set driver_id=v_driver.id,assigned_at=now(),updated_at=now() where id=v_delivery.id returning * into v_delivery;
  if v_order.fulfillment_status='awaiting_assignment' then
    perform public.order_transition_internal(v_order.id,'fulfillment','assigned',null,p_actor_user_id,'panel');
  end if;
  insert into public.delivery_history(organization_id,store_id,delivery_id,order_id,event_type,from_driver_id,to_driver_id,reason,idempotency_key,actor_user_id)
  values(v_delivery.organization_id,v_delivery.store_id,v_delivery.id,v_delivery.order_id,v_event,v_from_driver,v_driver.id,
    case when v_event='reassigned' then trim(p_reason) else null end,trim(p_idempotency_key),p_actor_user_id);
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(v_delivery.organization_id,v_delivery.store_id,p_actor_user_id,'delivery.'||v_event,'delivery',v_delivery.id,
    jsonb_build_object('driver_id',v_from_driver),jsonb_build_object('driver_id',v_driver.id,'order_id',v_delivery.order_id));
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values(v_delivery.organization_id,v_delivery.store_id,'delivery.'||v_event,'delivery',v_delivery.id,
    jsonb_build_object('order_id',v_delivery.order_id,'from_driver_id',v_from_driver,'driver_id',v_driver.id),'pending',0,now(),p_actor_user_id);
  return jsonb_build_object('delivery_id',v_delivery.id,'driver_id',v_driver.id,'changed',true,'event',v_event);
end; $$;
revoke all on function public.delivery_assign_internal(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.delivery_assign_internal(uuid,uuid,text,text,uuid) to service_role;

create or replace function public.delivery_transition_internal(
  p_delivery_id uuid,
  p_to_state text,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
  v_existing public.delivery_history%rowtype;
  v_completed boolean := false;
begin
  if p_actor_user_id is null then raise exception 'delivery actor is required'; end if;
  if p_to_state not in ('picked_up','out_for_delivery','delivered') then raise exception 'invalid delivery transition'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 240 then raise exception 'invalid delivery idempotency key'; end if;
  select * into v_delivery from public.deliveries where id=p_delivery_id for update;
  if v_delivery.id is null then raise exception 'delivery not found'; end if;
  if v_delivery.driver_id is null then raise exception 'delivery has no driver'; end if;

  select * into v_existing from public.delivery_history
  where organization_id=v_delivery.organization_id and idempotency_key=trim(p_idempotency_key);
  if v_existing.id is not null then
    if v_existing.delivery_id<>v_delivery.id or v_existing.event_type<>p_to_state then raise exception 'delivery idempotency key reused with different payload'; end if;
    return jsonb_build_object('delivery_id',v_delivery.id,'to',p_to_state,'changed',false);
  end if;

  select * into v_order from public.orders where id=v_delivery.order_id for update;
  if (p_to_state='picked_up' and v_order.fulfillment_status<>'assigned')
    or (p_to_state='out_for_delivery' and v_order.fulfillment_status<>'picked_up')
    or (p_to_state='delivered' and v_order.fulfillment_status<>'out_for_delivery') then
    if v_order.fulfillment_status=p_to_state then return jsonb_build_object('delivery_id',v_delivery.id,'to',p_to_state,'changed',false); end if;
    raise exception 'invalid delivery transition from % to %',v_order.fulfillment_status,p_to_state;
  end if;

  perform public.order_transition_internal(v_order.id,'fulfillment',p_to_state,null,p_actor_user_id,'panel');
  update public.deliveries set
    picked_up_at=case when p_to_state='picked_up' then now() else picked_up_at end,
    out_for_delivery_at=case when p_to_state='out_for_delivery' then now() else out_for_delivery_at end,
    delivered_at=case when p_to_state='delivered' then now() else delivered_at end,
    updated_at=now()
  where id=v_delivery.id returning * into v_delivery;
  insert into public.delivery_history(organization_id,store_id,delivery_id,order_id,event_type,from_driver_id,to_driver_id,idempotency_key,actor_user_id)
  values(v_delivery.organization_id,v_delivery.store_id,v_delivery.id,v_delivery.order_id,p_to_state,v_delivery.driver_id,v_delivery.driver_id,trim(p_idempotency_key),p_actor_user_id);
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values(v_delivery.organization_id,v_delivery.store_id,'delivery.'||p_to_state,'delivery',v_delivery.id,
    jsonb_build_object('order_id',v_delivery.order_id,'driver_id',v_delivery.driver_id),'pending',0,now(),p_actor_user_id);

  if p_to_state='delivered' and v_order.payment_status='paid' and v_order.order_status='confirmed' then
    perform public.order_transition_internal(v_order.id,'order','completed',null,p_actor_user_id,'panel');
    v_completed := true;
  end if;
  return jsonb_build_object('delivery_id',v_delivery.id,'to',p_to_state,'changed',true,'order_completed',v_completed);
end; $$;
revoke all on function public.delivery_transition_internal(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.delivery_transition_internal(uuid,text,text,uuid) to service_role;
