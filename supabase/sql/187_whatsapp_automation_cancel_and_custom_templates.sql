begin;

alter table public.store_conversation_settings
  add column if not exists notify_order_canceled boolean not null default false,
  add column if not exists order_notification_custom_templates jsonb not null default '{}'::jsonb;

alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_order_notification_custom_templates_object_check;

alter table public.store_conversation_settings
  add constraint store_conversation_settings_order_notification_custom_templates_object_check
  check (jsonb_typeof(order_notification_custom_templates) = 'object');

comment on column public.store_conversation_settings.notify_order_canceled is
  'Opt-in preference for the authoritative order.canceled WhatsApp notification.';
comment on column public.store_conversation_settings.order_notification_custom_templates is
  'Per-automation free-form message overrides validated by the application. Empty object preserves defaults.';

alter table public.order_whatsapp_notifications
  drop constraint if exists order_whatsapp_notifications_notification_type_check;

alter table public.order_whatsapp_notifications
  add constraint order_whatsapp_notifications_notification_type_check
  check (notification_type = any (array[
    'order_received'::text,
    'order_confirmed'::text,
    'production_preparing'::text,
    'payment_paid'::text,
    'pickup_ready'::text,
    'pickup_completed'::text,
    'out_for_delivery'::text,
    'delivered'::text,
    'order_canceled'::text
  ]));

create or replace function private.enqueue_order_whatsapp_notification_from_event()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_type text;
  v_fulfillment_type text;
begin
  if new.entity_type <> 'order' or new.entity_id is null then
    return new;
  end if;

  v_type := case new.event_type
    when 'order.created' then 'order_received'
    when 'order.confirmed' then 'order_confirmed'
    when 'production.preparing' then 'production_preparing'
    when 'payment.paid' then 'payment_paid'
    when 'production.ready' then 'pickup_ready'
    when 'fulfillment.picked_up_by_customer' then 'pickup_completed'
    when 'fulfillment.out_for_delivery' then 'out_for_delivery'
    when 'fulfillment.delivered' then 'delivered'
    when 'order.canceled' then 'order_canceled'
    else null
  end;

  if v_type is null then
    return new;
  end if;

  if v_type in ('pickup_ready', 'pickup_completed') then
    select fulfillment_type
      into v_fulfillment_type
      from public.orders
     where id = new.entity_id;
    if v_fulfillment_type is distinct from 'pickup' then
      return new;
    end if;
  elsif v_type in ('out_for_delivery', 'delivered') then
    select fulfillment_type
      into v_fulfillment_type
      from public.orders
     where id = new.entity_id;
    if v_fulfillment_type is distinct from 'delivery' then
      return new;
    end if;
  end if;

  insert into public.order_whatsapp_notifications (
    organization_id,
    store_id,
    order_id,
    domain_event_id,
    notification_type
  ) values (
    new.organization_id,
    new.store_id,
    new.entity_id,
    new.id,
    v_type
  )
  on conflict (organization_id, order_id, notification_type) do nothing;

  return new;
end;
$function$;

commit;
