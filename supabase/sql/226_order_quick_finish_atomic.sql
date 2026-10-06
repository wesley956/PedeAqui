-- Atomic/idempotent operational quick finish for native PedeAqui orders.
-- Payment confirmation remains in PaymentService before this RPC so cash/payment
-- audit rules are preserved. This function only collapses the operational state
-- transitions into one database transaction.

create or replace function public.order_quick_finish_internal(
  p_order_id uuid,
  p_actor_user_id uuid default null,
  p_source text default 'panel'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_actor_user_id is null then raise exception 'order actor is required'; end if;
  if p_source not in ('system','panel','automation') then raise exception 'invalid source'; end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then raise exception 'order not found'; end if;

  if exists (
    select 1
    from public.external_orders e
    where e.organization_id = v_order.organization_id
      and e.store_id = v_order.store_id
      and e.order_id = v_order.id
  ) then
    raise exception 'external orders cannot use quick finish';
  end if;

  if v_order.order_status = 'completed' then
    return jsonb_build_object(
      'order_id', v_order.id,
      'completed', true,
      'changed', false,
      'order_status', v_order.order_status,
      'payment_status', v_order.payment_status,
      'production_status', v_order.production_status,
      'fulfillment_status', v_order.fulfillment_status
    );
  end if;

  if v_order.order_status in ('rejected','canceled') then
    raise exception 'order cannot be quick finished from state %', v_order.order_status;
  end if;

  if v_order.payment_status not in ('paid','partially_refunded','refunded') then
    raise exception 'payment must be settled before quick finish';
  end if;

  if v_order.order_status = 'pending_confirmation' then
    perform public.order_transition_internal(
      v_order.id, 'order', 'confirmed', null, p_actor_user_id, p_source
    );
  elsif v_order.order_status <> 'confirmed' then
    raise exception 'order cannot be quick finished from state %', v_order.order_status;
  end if;

  if v_order.production_status in ('pending_confirmation','queued') then
    perform public.order_start_production_internal(v_order.id, p_actor_user_id, p_source);
    perform public.order_transition_internal(
      v_order.id, 'production', 'ready', null, p_actor_user_id, p_source
    );
  elsif v_order.production_status = 'preparing' then
    perform public.order_transition_internal(
      v_order.id, 'production', 'ready', null, p_actor_user_id, p_source
    );
  elsif v_order.production_status not in ('ready','not_required') then
    raise exception 'production cannot be quick finished from state %', v_order.production_status;
  end if;

  if v_order.fulfillment_type = 'delivery' then
    if v_order.fulfillment_status <> 'delivered' then
      if v_order.fulfillment_status <> 'out_for_delivery' then
        perform public.manual_delivery_dispatch_internal(
          v_order.id, p_actor_user_id, 'Finalização rápida do pedido'
        );
      end if;
      perform public.order_transition_internal(
        v_order.id, 'fulfillment', 'delivered', 'Entrega concluída na finalização rápida', p_actor_user_id, p_source
      );
    end if;
  elsif v_order.fulfillment_type = 'pickup' then
    if v_order.fulfillment_status = 'pending' then
      perform public.order_transition_internal(
        v_order.id, 'fulfillment', 'awaiting_pickup', null, p_actor_user_id, p_source
      );
      perform public.order_transition_internal(
        v_order.id, 'fulfillment', 'picked_up_by_customer', null, p_actor_user_id, p_source
      );
    elsif v_order.fulfillment_status = 'awaiting_pickup' then
      perform public.order_transition_internal(
        v_order.id, 'fulfillment', 'picked_up_by_customer', null, p_actor_user_id, p_source
      );
    elsif v_order.fulfillment_status not in ('picked_up_by_customer','not_required') then
      raise exception 'pickup cannot be quick finished from state %', v_order.fulfillment_status;
    end if;
  else
    if v_order.fulfillment_status = 'pending' then
      perform public.order_transition_internal(
        v_order.id, 'fulfillment', 'served', null, p_actor_user_id, p_source
      );
    elsif v_order.fulfillment_status not in ('served','not_required') then
      raise exception 'service cannot be quick finished from state %', v_order.fulfillment_status;
    end if;
  end if;

  perform public.order_transition_internal(
    v_order.id, 'order', 'completed', 'Finalização rápida transacional', p_actor_user_id, p_source
  );

  select * into v_order
  from public.orders
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'completed', v_order.order_status = 'completed',
    'changed', true,
    'order_status', v_order.order_status,
    'payment_status', v_order.payment_status,
    'production_status', v_order.production_status,
    'fulfillment_status', v_order.fulfillment_status
  );
end;
$$;

revoke all on function public.order_quick_finish_internal(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.order_quick_finish_internal(uuid,uuid,text) to service_role;
