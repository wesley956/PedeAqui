-- Keep the logistics projection consistent when a delivery is completed through
-- the manual order flow instead of the managed-driver flow.

create or replace function private.sync_delivery_completion_from_order()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.fulfillment_type = 'delivery'
     and new.fulfillment_status = 'delivered'
     and old.fulfillment_status is distinct from 'delivered' then
    update public.deliveries
    set delivered_at = coalesce(delivered_at, new.completed_at, new.updated_at, now()),
        updated_at = now()
    where organization_id = new.organization_id
      and store_id = new.store_id
      and order_id = new.id
      and delivered_at is null
      and canceled_at is null;
  end if;
  return new;
end;
$function$;

comment on function private.sync_delivery_completion_from_order() is
  'Closes an open delivery projection when the authoritative order fulfillment reaches delivered through any valid flow.';

drop trigger if exists orders_sync_delivery_completion on public.orders;
create trigger orders_sync_delivery_completion
after update of fulfillment_status on public.orders
for each row execute function private.sync_delivery_completion_from_order();

-- Repair only rows whose authoritative order already proves delivery. No order,
-- payment or customer data is changed by this backfill.
update public.deliveries d
set delivered_at = coalesce(o.completed_at, o.updated_at, d.updated_at, now()),
    updated_at = now()
from public.orders o
where o.id = d.order_id
  and o.organization_id = d.organization_id
  and o.store_id = d.store_id
  and o.fulfillment_type = 'delivery'
  and o.fulfillment_status = 'delivered'
  and d.delivered_at is null
  and d.canceled_at is null;

