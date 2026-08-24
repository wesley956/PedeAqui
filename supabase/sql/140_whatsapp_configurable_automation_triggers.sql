-- PedeAqui — WhatsApp configurável por unidade (gatilhos)
-- Fase 2 do rollout: aplicar somente depois que a aplicação que conhece os novos tipos estiver publicada.

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

  v_type := case new.event_type
    when 'order.created' then 'order_received'
    when 'order.confirmed' then 'order_confirmed'
    when 'production.preparing' then 'production_preparing'
    when 'payment.paid' then 'payment_paid'
    when 'production.ready' then 'pickup_ready'
    when 'fulfillment.picked_up_by_customer' then 'pickup_completed'
    when 'fulfillment.out_for_delivery' then 'out_for_delivery'
    when 'fulfillment.delivered' then 'delivered'
    else null
  end;

  if v_type is null then return new; end if;

  if v_type in ('pickup_ready','pickup_completed') then
    select fulfillment_type into v_fulfillment_type from public.orders where id = new.entity_id;
    if v_fulfillment_type is distinct from 'pickup' then return new; end if;
  elsif v_type in ('out_for_delivery','delivered') then
    select fulfillment_type into v_fulfillment_type from public.orders where id = new.entity_id;
    if v_fulfillment_type is distinct from 'delivery' then return new; end if;
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

revoke all on function private.enqueue_order_whatsapp_notification_from_event() from public, anon, authenticated;
