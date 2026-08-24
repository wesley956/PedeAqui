-- PedeAqui — WhatsApp configurável por unidade
-- Preserva as configurações atuais como "custom" e amplia os avisos usando estados autoritativos do pedido.

alter table public.store_conversation_settings
  add column if not exists order_notification_preset text not null default 'custom',
  add column if not exists notify_order_confirmed boolean not null default false,
  add column if not exists notify_production_preparing boolean not null default false,
  add column if not exists notify_pickup_completed boolean not null default false;

alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_order_notification_preset_check,
  add constraint store_conversation_settings_order_notification_preset_check
    check (order_notification_preset in ('simple','complete','custom'));

comment on column public.store_conversation_settings.order_notification_preset is
  'Perfil de automação de WhatsApp da unidade: simple, complete ou custom. Linhas antigas permanecem custom para preservar o comportamento existente.';

alter table public.order_whatsapp_notifications
  drop constraint if exists order_whatsapp_notifications_notification_type_check,
  add constraint order_whatsapp_notifications_notification_type_check
    check (notification_type in (
      'order_received',
      'order_confirmed',
      'production_preparing',
      'payment_paid',
      'pickup_ready',
      'pickup_completed',
      'out_for_delivery',
      'delivered'
    ));

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
