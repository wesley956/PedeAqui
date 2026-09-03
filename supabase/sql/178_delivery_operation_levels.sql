-- Explicit delivery operation levels. Existing stores remain NULL and keep the
-- behavior derived from their current modules until they opt in.
alter table public.store_operational_settings
  add column if not exists delivery_operation_level text null;

alter table public.store_operational_settings
  drop constraint if exists store_operational_settings_delivery_operation_level_check;
alter table public.store_operational_settings
  add constraint store_operational_settings_delivery_operation_level_check
  check (delivery_operation_level is null or delivery_operation_level in ('manual','dispatch_simple','driver_connected','advanced'));

comment on column public.store_operational_settings.delivery_operation_level is
  'Opt-in logistics level. NULL preserves legacy module-derived behavior.';

create or replace function public.manual_delivery_dispatch_internal(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_reason text default 'Entrega manual iniciada pelo restaurante'
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_order public.orders%rowtype;
  v_level text;
begin
  if p_actor_user_id is null then raise exception 'delivery actor is required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'order not found'; end if;
  if v_order.fulfillment_type <> 'delivery' or v_order.order_status <> 'confirmed' then raise exception 'order is not eligible for manual delivery'; end if;
  if v_order.production_status not in ('ready','not_required') then raise exception 'production must be ready'; end if;
  select delivery_operation_level into v_level from public.store_operational_settings
    where organization_id=v_order.organization_id and store_id=v_order.store_id;
  if coalesce(v_level, case when private.store_module_enabled(v_order.organization_id,v_order.store_id,'deliveries') and private.store_module_enabled(v_order.organization_id,v_order.store_id,'driver') then 'driver_connected' else 'manual' end) <> 'manual'
    then raise exception 'store does not use manual delivery'; end if;
  if v_order.fulfillment_status='out_for_delivery' then return jsonb_build_object('order_id',v_order.id,'changed',false,'status','out_for_delivery'); end if;
  if v_order.fulfillment_status not in ('pending','awaiting_assignment','assigned','picked_up') then raise exception 'invalid manual delivery state'; end if;
  update public.orders set fulfillment_status='out_for_delivery',updated_at=now() where id=v_order.id;
  insert into public.order_state_history(organization_id,store_id,order_id,state_domain,from_state,to_state,reason,source,actor_user_id)
  values(v_order.organization_id,v_order.store_id,v_order.id,'fulfillment',v_order.fulfillment_status,'out_for_delivery',nullif(trim(p_reason),''),'panel',p_actor_user_id);
  insert into public.domain_events(organization_id,store_id,event_type,entity_type,entity_id,payload,status,attempts,occurred_at,created_by)
  values(v_order.organization_id,v_order.store_id,'fulfillment.out_for_delivery','order',v_order.id,jsonb_build_object('display_number',v_order.display_number,'from',v_order.fulfillment_status,'to','out_for_delivery','domain','fulfillment','operation_level','manual'),'pending',0,now(),p_actor_user_id);
  return jsonb_build_object('order_id',v_order.id,'changed',true,'status','out_for_delivery');
end $$;

revoke all on function public.manual_delivery_dispatch_internal(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.manual_delivery_dispatch_internal(uuid,uuid,text) to service_role;
