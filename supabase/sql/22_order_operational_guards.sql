-- PedeAqui — invariantes entre os ciclos independentes do pedido.
-- Os estados continuam separados, mas transições operacionais precisam respeitar o contexto do pedido.

create or replace function public.order_transition_internal(
  p_order_id uuid,
  p_domain text,
  p_to_state text,
  p_reason text default null,
  p_actor_user_id uuid default null,
  p_source text default 'system'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_from text;
  v_allowed boolean := false;
  v_event_type text;
begin
  if p_domain not in ('order','payment','production','fulfillment') then raise exception 'invalid state domain'; end if;
  if p_source not in ('system','checkout','panel','pdv','integration','automation') then raise exception 'invalid source'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order not found'; end if;

  if p_domain = 'order' then
    v_from := v_order.order_status;
    v_allowed :=
      (v_from = 'pending_confirmation' and p_to_state in ('confirmed','rejected','canceled')) or
      (v_from = 'confirmed' and p_to_state in ('completed','canceled'));

    if p_to_state = 'completed' then
      if v_order.fulfillment_status not in ('delivered','picked_up_by_customer','served','not_required') then
        raise exception 'fulfillment is not complete';
      end if;
      if v_order.payment_status <> 'paid' then
        raise exception 'payment is not complete';
      end if;
    end if;

    if p_to_state in ('canceled','rejected') and v_order.fulfillment_status in ('delivered','picked_up_by_customer','served') then
      raise exception 'fulfilled order cannot be canceled or rejected';
    end if;
    if p_to_state = 'canceled' and coalesce(length(trim(p_reason)),0) < 3 then raise exception 'cancel reason required'; end if;
  elsif p_domain = 'payment' then
    v_from := v_order.payment_status;
    v_allowed :=
      (v_from = 'pending' and p_to_state in ('authorized','paid','failed')) or
      (v_from = 'authorized' and p_to_state in ('paid','failed')) or
      (v_from = 'failed' and p_to_state = 'pending') or
      (v_from = 'paid' and p_to_state in ('partially_refunded','refunded')) or
      (v_from = 'partially_refunded' and p_to_state = 'refunded');
  elsif p_domain = 'production' then
    v_from := v_order.production_status;
    v_allowed :=
      (v_from = 'pending_confirmation' and p_to_state in ('queued','canceled','not_required')) or
      (v_from = 'queued' and p_to_state in ('preparing','canceled')) or
      (v_from = 'preparing' and p_to_state in ('ready','canceled')) or
      (v_from = 'ready' and p_to_state = 'canceled');

    if p_to_state = 'queued' and v_order.order_status <> 'confirmed' then
      raise exception 'order must be confirmed before production queue';
    end if;
  else
    v_from := v_order.fulfillment_status;
    v_allowed :=
      (v_from = 'pending' and p_to_state in ('awaiting_assignment','awaiting_pickup','served','canceled','not_required')) or
      (v_from = 'awaiting_assignment' and p_to_state in ('assigned','canceled')) or
      (v_from = 'assigned' and p_to_state in ('picked_up','canceled')) or
      (v_from = 'picked_up' and p_to_state in ('out_for_delivery','canceled')) or
      (v_from = 'out_for_delivery' and p_to_state in ('delivered','canceled')) or
      (v_from = 'awaiting_pickup' and p_to_state in ('picked_up_by_customer','canceled'));

    if p_to_state in ('awaiting_assignment','awaiting_pickup','served') and v_order.order_status <> 'confirmed' then
      raise exception 'order must be confirmed before fulfillment starts';
    end if;
    if p_to_state in ('awaiting_pickup','picked_up','out_for_delivery','served')
       and v_order.production_status not in ('ready','not_required') then
      raise exception 'production must be ready before this fulfillment transition';
    end if;
  end if;

  if p_to_state = v_from then
    return jsonb_build_object('order_id', v_order.id, 'domain', p_domain, 'from', v_from, 'to', p_to_state, 'changed', false);
  end if;
  if not v_allowed then raise exception 'invalid transition: % % -> %', p_domain, v_from, p_to_state; end if;

  if p_domain = 'order' then
    update public.orders set
      order_status = p_to_state,
      confirmed_at = case when p_to_state = 'confirmed' then now() else confirmed_at end,
      completed_at = case when p_to_state = 'completed' then now() else completed_at end,
      canceled_at = case when p_to_state = 'canceled' then now() else canceled_at end,
      canceled_by = case when p_to_state = 'canceled' then p_actor_user_id else canceled_by end,
      cancel_reason = case when p_to_state = 'canceled' then trim(p_reason) else cancel_reason end,
      updated_at = now()
    where id = p_order_id;
  elsif p_domain = 'payment' then
    update public.orders set payment_status = p_to_state, updated_at = now() where id = p_order_id;
  elsif p_domain = 'production' then
    update public.orders set production_status = p_to_state, updated_at = now() where id = p_order_id;
  else
    update public.orders set fulfillment_status = p_to_state, updated_at = now() where id = p_order_id;
  end if;

  insert into public.order_state_history (
    organization_id, store_id, order_id, state_domain, from_state, to_state, reason, source, actor_user_id
  ) values (
    v_order.organization_id, v_order.store_id, v_order.id, p_domain, v_from, p_to_state,
    nullif(trim(coalesce(p_reason,'')),''), p_source, p_actor_user_id
  );

  v_event_type := p_domain || '.' || p_to_state;
  insert into public.domain_events (
    organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at, created_by
  ) values (
    v_order.organization_id, v_order.store_id, v_event_type, 'order', v_order.id,
    jsonb_build_object('display_number', v_order.display_number, 'from', v_from, 'to', p_to_state, 'domain', p_domain),
    'pending', 0, now(), p_actor_user_id
  );

  -- Cancelamento/recusa encerra os ciclos operacionais na mesma transação.
  -- Pagamento fica independente: um pedido pago e cancelado ainda precisa de refund explícito.
  if p_domain = 'order' and p_to_state in ('canceled','rejected') then
    if v_order.production_status not in ('canceled','not_required') then
      update public.orders set production_status = 'canceled', updated_at = now() where id = v_order.id;
      insert into public.order_state_history (
        organization_id, store_id, order_id, state_domain, from_state, to_state, reason, source, actor_user_id
      ) values (
        v_order.organization_id, v_order.store_id, v_order.id, 'production', v_order.production_status, 'canceled',
        nullif(trim(coalesce(p_reason,'')),''), p_source, p_actor_user_id
      );
      insert into public.domain_events (
        organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at, created_by
      ) values (
        v_order.organization_id, v_order.store_id, 'production.canceled', 'order', v_order.id,
        jsonb_build_object('display_number', v_order.display_number, 'from', v_order.production_status, 'to', 'canceled', 'domain', 'production'),
        'pending', 0, now(), p_actor_user_id
      );
    end if;

    if v_order.fulfillment_status not in ('canceled','not_required') then
      update public.orders set fulfillment_status = 'canceled', updated_at = now() where id = v_order.id;
      insert into public.order_state_history (
        organization_id, store_id, order_id, state_domain, from_state, to_state, reason, source, actor_user_id
      ) values (
        v_order.organization_id, v_order.store_id, v_order.id, 'fulfillment', v_order.fulfillment_status, 'canceled',
        nullif(trim(coalesce(p_reason,'')),''), p_source, p_actor_user_id
      );
      insert into public.domain_events (
        organization_id, store_id, event_type, entity_type, entity_id, payload, status, attempts, occurred_at, created_by
      ) values (
        v_order.organization_id, v_order.store_id, 'fulfillment.canceled', 'order', v_order.id,
        jsonb_build_object('display_number', v_order.display_number, 'from', v_order.fulfillment_status, 'to', 'canceled', 'domain', 'fulfillment'),
        'pending', 0, now(), p_actor_user_id
      );
    end if;
  end if;

  return jsonb_build_object('order_id', v_order.id, 'domain', p_domain, 'from', v_from, 'to', p_to_state, 'changed', true);
end;
$$;

revoke all on function public.order_transition_internal(uuid,text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.order_transition_internal(uuid,text,text,text,uuid,text) to service_role;
