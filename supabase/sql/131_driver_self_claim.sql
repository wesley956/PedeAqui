-- PedeAqui — modo opcional de auto-seleção de entregas pelo entregador
-- Defaults preservam o fluxo atual de atribuição manual em todas as lojas.

alter table public.store_operational_settings
  add column if not exists deliveries_driver_self_claim_enabled boolean not null default false;

create or replace function public.set_store_operational_settings_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_settings jsonb,
  p_actor_user_id uuid,
  p_reason text,
  p_request_id text
) returns public.store_operational_settings
language plpgsql security invoker set search_path='' as $$
declare
  v_before public.store_operational_settings%rowtype;
  v_after public.store_operational_settings%rowtype;
begin
  if p_actor_user_id is null then raise exception 'settings actor is required'; end if;
  if not exists(select 1 from public.stores s where s.id=p_store_id and s.organization_id=p_organization_id) then raise exception 'store not found'; end if;
  if jsonb_typeof(coalesce(p_settings,'{}'::jsonb)) <> 'object' then raise exception 'settings must be an object'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'settings reason is required'; end if;
  if char_length(trim(coalesce(p_request_id,''))) not between 3 and 120 then raise exception 'settings request id is required'; end if;
  if coalesce(p_settings->>'orders_workflow_mode','standard') not in ('standard','simplified') then raise exception 'invalid workflow mode'; end if;
  if coalesce(p_settings->>'orders_workflow_mode','standard')='simplified'
    and not coalesce((p_settings->>'orders_auto_accept')::boolean,false) then
    raise exception 'simplified workflow requires auto accept';
  end if;
  if coalesce((p_settings->>'deliveries_driver_tracking_enabled')::boolean,false)
    and (not private.store_module_enabled(p_organization_id,p_store_id,'deliveries')
      or not private.store_module_enabled(p_organization_id,p_store_id,'driver')) then
    raise exception 'driver tracking requires deliveries and driver modules';
  end if;
  if coalesce((p_settings->>'deliveries_driver_self_claim_enabled')::boolean,false)
    and (not private.store_module_enabled(p_organization_id,p_store_id,'deliveries')
      or not private.store_module_enabled(p_organization_id,p_store_id,'driver')) then
    raise exception 'driver self claim requires deliveries and driver modules';
  end if;
  if coalesce((p_settings->>'growth_campaigns_enabled')::boolean,false)
    and (not private.store_module_enabled(p_organization_id,p_store_id,'growth')
      or not private.store_module_enabled(p_organization_id,p_store_id,'customers')
      or not private.store_module_enabled(p_organization_id,p_store_id,'conversations')) then
    raise exception 'campaigns require growth, customers and conversations modules';
  end if;

  select * into v_before from public.store_operational_settings where store_id=p_store_id for update;
  insert into public.store_operational_settings(
    organization_id,store_id,orders_auto_accept,orders_workflow_mode,deliveries_auto_create_when_ready,
    deliveries_driver_tracking_enabled,deliveries_driver_self_claim_enabled,
    deliveries_stationary_alert_minutes,deliveries_tracking_retention_days,
    growth_campaigns_enabled,campaign_rate_per_minute,updated_by,updated_at
  ) values (
    p_organization_id,p_store_id,
    coalesce((p_settings->>'orders_auto_accept')::boolean,false),
    coalesce(p_settings->>'orders_workflow_mode','standard'),
    coalesce((p_settings->>'deliveries_auto_create_when_ready')::boolean,false),
    coalesce((p_settings->>'deliveries_driver_tracking_enabled')::boolean,false),
    coalesce((p_settings->>'deliveries_driver_self_claim_enabled')::boolean,false),
    coalesce((p_settings->>'deliveries_stationary_alert_minutes')::integer,15),
    coalesce((p_settings->>'deliveries_tracking_retention_days')::integer,7),
    coalesce((p_settings->>'growth_campaigns_enabled')::boolean,false),
    coalesce((p_settings->>'campaign_rate_per_minute')::integer,10),
    p_actor_user_id,now()
  ) on conflict(store_id) do update set
    orders_auto_accept=excluded.orders_auto_accept,
    orders_workflow_mode=excluded.orders_workflow_mode,
    deliveries_auto_create_when_ready=excluded.deliveries_auto_create_when_ready,
    deliveries_driver_tracking_enabled=excluded.deliveries_driver_tracking_enabled,
    deliveries_driver_self_claim_enabled=excluded.deliveries_driver_self_claim_enabled,
    deliveries_stationary_alert_minutes=excluded.deliveries_stationary_alert_minutes,
    deliveries_tracking_retention_days=excluded.deliveries_tracking_retention_days,
    growth_campaigns_enabled=excluded.growth_campaigns_enabled,
    campaign_rate_per_minute=excluded.campaign_rate_per_minute,
    updated_by=excluded.updated_by,updated_at=now()
  returning * into v_after;

  insert into public.audit_logs(
    organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id
  ) values(
    p_organization_id,p_store_id,p_actor_user_id,
    'platform.store_operational_settings_updated','store_operational_settings',p_store_id,
    case when v_before.store_id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after)||jsonb_build_object('reason',trim(p_reason)),trim(p_request_id)
  );
  return v_after;
end $$;

create or replace function public.delivery_self_claim_internal(
  p_order_id uuid,
  p_idempotency_key text,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_order public.orders%rowtype;
  v_delivery public.deliveries%rowtype;
  v_driver public.drivers%rowtype;
  v_enabled boolean := false;
  v_result jsonb;
begin
  if p_actor_user_id is null then raise exception 'delivery actor is required'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 240 then
    raise exception 'invalid delivery idempotency key';
  end if;

  -- O lock do pedido é a barreira de concorrência: dois entregadores nunca vencem o mesmo pedido.
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'order not found'; end if;
  if v_order.fulfillment_type <> 'delivery' then raise exception 'order is not delivery'; end if;
  if v_order.order_status <> 'confirmed' then raise exception 'order must be confirmed before assignment'; end if;
  if v_order.production_status not in ('ready','not_required') then raise exception 'production must be ready before assignment'; end if;

  select coalesce(s.deliveries_driver_self_claim_enabled,false) into v_enabled
  from public.store_operational_settings s
  where s.organization_id=v_order.organization_id and s.store_id=v_order.store_id;
  if not coalesce(v_enabled,false) then raise exception 'driver self claim is disabled'; end if;
  if not private.store_module_enabled(v_order.organization_id,v_order.store_id,'deliveries')
    or not private.store_module_enabled(v_order.organization_id,v_order.store_id,'driver') then
    raise exception 'driver self claim is disabled';
  end if;

  select * into v_driver
  from public.drivers
  where organization_id=v_order.organization_id
    and store_id=v_order.store_id
    and user_id=p_actor_user_id
    and deleted_at is null
  for update;
  if v_driver.id is null then raise exception 'current user is not a driver for this store'; end if;
  if not v_driver.active or not v_driver.on_duty then raise exception 'driver is not available'; end if;

  select * into v_delivery from public.deliveries where order_id=v_order.id for update;

  if v_order.fulfillment_status='assigned' then
    if v_delivery.id is not null and v_delivery.driver_id=v_driver.id then
      return jsonb_build_object(
        'delivery_id',v_delivery.id,'driver_id',v_driver.id,'changed',false,
        'claim_mode','self_service'
      );
    end if;
    raise exception 'delivery already claimed';
  end if;

  if v_order.fulfillment_status not in ('pending','awaiting_assignment') then
    raise exception 'order is not available for self claim';
  end if;
  if v_delivery.id is not null and v_delivery.driver_id is not null then
    raise exception 'delivery already claimed';
  end if;

  v_result := public.delivery_assign_internal(
    v_order.id,v_driver.id,null,trim(p_idempotency_key),p_actor_user_id
  );

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object('claim_mode','self_service');
end $$;

revoke all on function public.delivery_self_claim_internal(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.delivery_self_claim_internal(uuid,text,uuid) to service_role;
