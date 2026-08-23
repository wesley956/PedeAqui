-- PedeAqui — corrige o limite de permissão do auto-claim de entregas.
-- A RPC é invocada pelo backend com service_role e não deve depender de helpers privados
-- que permanecem deliberadamente fechados para esse papel.

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

  -- Valida os módulos diretamente. Não amplia EXECUTE em private.store_module_enabled.
  if not exists(
      select 1 from public.store_modules sm
      where sm.organization_id=v_order.organization_id
        and sm.store_id=v_order.store_id
        and sm.module_key='deliveries'
        and sm.enabled=true
    ) or not exists(
      select 1 from public.store_modules sm
      where sm.organization_id=v_order.organization_id
        and sm.store_id=v_order.store_id
        and sm.module_key='driver'
        and sm.enabled=true
    ) then
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
