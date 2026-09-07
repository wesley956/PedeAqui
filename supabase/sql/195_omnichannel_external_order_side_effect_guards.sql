-- Prevent PedeAqui-owned customer messaging from being emitted for marketplace orders.
-- External orders still emit canonical domain events for production, printing, sound and
-- observability; only the native WhatsApp customer notification queue is suppressed.

create or replace function private.enqueue_order_whatsapp_notification_from_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_type text;
  v_fulfillment_type text;
begin
  if new.entity_type <> 'order' or new.entity_id is null then return new; end if;

  -- The existence of the canonical external-order link is the provider-neutral source of
  -- truth. Do not hard-code one marketplace here; future sales-channel adapters inherit
  -- the same protection automatically.
  if exists (
    select 1
    from public.external_orders eo
    where eo.order_id = new.entity_id
      and eo.organization_id = new.organization_id
      and eo.store_id = new.store_id
  ) then
    return new;
  end if;

  v_type := case new.event_type
    when 'order.created' then 'order_received'
    when 'payment.paid' then 'payment_paid'
    when 'production.ready' then 'pickup_ready'
    when 'fulfillment.out_for_delivery' then 'out_for_delivery'
    when 'fulfillment.delivered' then 'delivered'
    else null
  end;
  if v_type is null then return new; end if;

  if v_type = 'pickup_ready' then
    select fulfillment_type into v_fulfillment_type
    from public.orders
    where id = new.entity_id;
    if v_fulfillment_type is distinct from 'pickup' then return new; end if;
  end if;

  insert into public.order_whatsapp_notifications (
    organization_id, store_id, order_id, domain_event_id, notification_type
  ) values (
    new.organization_id, new.store_id, new.entity_id, new.id, v_type
  )
  on conflict (organization_id, order_id, notification_type) do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_order_whatsapp_notification_from_event()
  from public, anon, authenticated;

comment on function private.enqueue_order_whatsapp_notification_from_event() is
  'Queues native PedeAqui order WhatsApp notifications only for orders that are not linked to an external sales channel.';