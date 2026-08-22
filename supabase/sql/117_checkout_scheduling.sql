-- Optional checkout scheduling. The selected instant is stored on the session
-- and copied into the immutable order snapshot at creation time.

alter table public.checkout_sessions
  add column if not exists scheduled_for timestamptz;

alter table public.orders
  add column if not exists scheduled_for timestamptz;

comment on column public.checkout_sessions.scheduled_for is
  'Optional requested fulfillment instant selected in the store timezone.';
comment on column public.orders.scheduled_for is
  'Immutable requested fulfillment instant copied from checkout at order creation.';

create index if not exists orders_store_scheduled_idx
  on public.orders (organization_id, store_id, scheduled_for)
  where scheduled_for is not null
    and order_status not in ('completed', 'canceled', 'rejected');

create or replace function private.copy_checkout_schedule_to_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.checkout_session_id is not null then
    select checkout.scheduled_for
      into new.scheduled_for
      from public.checkout_sessions as checkout
     where checkout.id = new.checkout_session_id
       and checkout.organization_id = new.organization_id
       and checkout.store_id = new.store_id;
  end if;
  return new;
end;
$$;

revoke all on function private.copy_checkout_schedule_to_order() from public, anon, authenticated;

drop trigger if exists orders_checkout_schedule_snapshot on public.orders;
create trigger orders_checkout_schedule_snapshot
before insert on public.orders
for each row execute function private.copy_checkout_schedule_to_order();

-- Printing is fed by JSON snapshots. Enrich new jobs without replacing the
-- established queue function, keeping this append-only migration isolated.
create or replace function private.copy_order_schedule_to_print_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_at timestamptz;
  store_timezone text;
begin
  if new.order_id is not null then
    select orders.scheduled_for, stores.timezone
      into requested_at, store_timezone
      from public.orders as orders
      join public.stores as stores
        on stores.id = orders.store_id
       and stores.organization_id = orders.organization_id
     where orders.id = new.order_id
       and orders.organization_id = new.organization_id
       and orders.store_id = new.store_id;
    new.payload := jsonb_set(coalesce(new.payload, '{}'::jsonb), '{order,scheduled_for}', coalesce(to_jsonb(requested_at), 'null'::jsonb), true);
    new.payload := jsonb_set(new.payload, '{order,timezone}', to_jsonb(coalesce(store_timezone, 'America/Sao_Paulo')), true);
  end if;
  return new;
end;
$$;

revoke all on function private.copy_order_schedule_to_print_payload() from public, anon, authenticated;

drop trigger if exists print_jobs_order_schedule_snapshot on public.print_jobs;
create trigger print_jobs_order_schedule_snapshot
before insert on public.print_jobs
for each row execute function private.copy_order_schedule_to_print_payload();
