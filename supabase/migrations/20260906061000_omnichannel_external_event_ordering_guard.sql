-- Omnichannel causal ordering hardening (#936/#937).
-- A late provider event must never regress the external reconciliation view that
-- already reflects a newer durable event. Canonical PedeAqui state machines remain untouched.

alter table public.external_orders
  add column if not exists last_provider_event_at timestamptz;

create or replace function private.integration_external_order_event_ordering_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_candidate_event_at timestamptz;
begin
  if new.last_external_event_id is not null then
    select coalesce(e.occurred_at, e.received_at)
      into v_candidate_event_at
    from public.integration_events e
    where e.organization_id = new.organization_id
      and e.store_id = new.store_id
      and e.integration_account_id = new.integration_account_id
      and e.provider = new.provider
      and e.external_event_id = new.last_external_event_id
    order by e.received_at desc
    limit 1;
  end if;

  if tg_op = 'INSERT' then
    new.last_provider_event_at := v_candidate_event_at;
    return new;
  end if;

  -- Reconciliation/admin updates without a durable provider event are allowed,
  -- but they do not rewrite the provider event watermark.
  if v_candidate_event_at is null then
    new.last_provider_event_at := old.last_provider_event_at;
    return new;
  end if;

  if old.last_provider_event_at is not null
     and v_candidate_event_at < old.last_provider_event_at then
    -- Preserve the complete external-sync view. The stale inbox event can still
    -- be marked processed/ACKed by the worker; it simply cannot move sync data back.
    new.external_status := old.external_status;
    new.external_revision := old.external_revision;
    new.last_external_event_id := old.last_external_event_id;
    new.last_snapshot := old.last_snapshot;
    new.payment_owner := old.payment_owner;
    new.logistics_owner := old.logistics_owner;
    new.sync_status := old.sync_status;
    new.last_provider_event_at := old.last_provider_event_at;
    new.updated_at := old.updated_at;
    return new;
  end if;

  new.last_provider_event_at := v_candidate_event_at;
  return new;
end;
$$;

revoke all on function private.integration_external_order_event_ordering_guard()
  from public, anon, authenticated;

drop trigger if exists external_orders_guard_event_ordering on public.external_orders;
create trigger external_orders_guard_event_ordering
before insert or update of
  external_status,
  external_revision,
  last_external_event_id,
  last_snapshot,
  payment_owner,
  logistics_owner,
  sync_status
on public.external_orders
for each row execute function private.integration_external_order_event_ordering_guard();

-- Defensive watermark backfill for eventual promotion into an environment that
-- already has external links. Current external capabilities remain OFF.
update public.external_orders eo
set last_provider_event_at = coalesce(e.occurred_at, e.received_at)
from public.integration_events e
where eo.last_provider_event_at is null
  and eo.last_external_event_id is not null
  and e.organization_id = eo.organization_id
  and e.store_id = eo.store_id
  and e.integration_account_id = eo.integration_account_id
  and e.provider = eo.provider
  and e.external_event_id = eo.last_external_event_id;

create index if not exists external_orders_provider_event_time_idx
  on public.external_orders(integration_merchant_id, last_provider_event_at desc)
  where last_provider_event_at is not null;

comment on column public.external_orders.last_provider_event_at is
  'Causal watermark of the latest durable provider event allowed to update the external reconciliation view.';
comment on trigger external_orders_guard_event_ordering on public.external_orders is
  'Prevents a late/older provider event from regressing external status, revision, sync snapshot, ownership or event identity.';
