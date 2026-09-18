-- Complete the canonical WhatsApp order-status notification sequence.
-- Only future authoritative domain events are enqueued; this migration does not backfill old orders.

alter table public.order_whatsapp_notifications
  drop constraint if exists order_whatsapp_notifications_workflow_checkpoint_check;

alter table public.order_whatsapp_notifications
  add constraint order_whatsapp_notifications_workflow_checkpoint_check
  check (workflow_checkpoint is null or workflow_checkpoint in (
    'new',
    'received',
    'confirmed',
    'preparing',
    'ready',
    'delivering',
    'awaiting_pickup',
    'finished',
    'payment',
    'canceled'
  ));

create or replace function public.order_notification_claim_workflow_checkpoint_internal(
  p_notification_id uuid,
  p_worker_id text,
  p_checkpoint text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_checkpoint not in (
    'new','received','confirmed','preparing','ready','delivering',
    'awaiting_pickup','finished','payment','canceled'
  ) then
    raise exception 'invalid workflow checkpoint';
  end if;

  update public.order_whatsapp_notifications
     set workflow_checkpoint = p_checkpoint,
         updated_at = now()
   where id = p_notification_id
     and status = 'processing'
     and locked_by = trim(p_worker_id)
     and (workflow_checkpoint is null or workflow_checkpoint = p_checkpoint);

  get diagnostics v_updated = row_count;
  return v_updated = 1;
exception
  when unique_violation then
    return false;
end;
$$;

revoke all on function public.order_notification_claim_workflow_checkpoint_internal(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.order_notification_claim_workflow_checkpoint_internal(uuid,text,text)
  to service_role;

create or replace function private.enqueue_order_whatsapp_notification_from_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type text;
  v_fulfillment_type text;
begin
  if new.entity_type <> 'order' or new.entity_id is null then
    return new;
  end if;

  -- External channels keep their own operational contracts and must not emit
  -- duplicate PedeAqui customer notifications from this trigger.
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
    select o.fulfillment_type
      into v_fulfillment_type
      from public.orders o
     where o.id = new.entity_id
       and o.organization_id = new.organization_id
       and o.store_id = new.store_id;

    if v_fulfillment_type is distinct from 'pickup' then
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
$$;
